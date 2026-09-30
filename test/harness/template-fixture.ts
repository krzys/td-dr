import Handlebars from "handlebars";
import { Liquid } from "liquidjs";
import { field } from "../../src/template/tokens.ts";
import { equalsHelper, type DialectName } from "../../src/template/dialects.ts";
import type { Fixture } from "./fixture-runner.ts";

// A fixture with `template: handlebars` or `template: [handlebars, liquid]` in its intent is compiled
// once per dialect. Its input writes placeholders as {{path}}; props.json holds the sample data.
export const templateDialects = (f: Fixture): DialectName[] | undefined => {
  const t = f.intent.template;
  if (t === undefined) return undefined;
  const list = Array.isArray(t) ? t : [t];
  for (const d of list) if (d !== "handlebars" && d !== "liquid") throw new Error(`${f.dir}: unknown template dialect ${String(d)}`);
  return list as DialectName[];
};

export const tokenize = (src: string): string => src.replace(/\{\{\s*([A-Za-z_][\w.]*)\s*\}\}/g, (_m, path: string) => field(path));

const liquid = new Liquid();

// The ESP's comparison helpers, which plain Handlebars doesn't ship, as exactly what the template
// may rely on (equalsHelper): a call outside that fails the test instead of picking an answer.
export const requirementHelpers = (e: typeof Handlebars): typeof Handlebars => {
  for (const [name, same] of [["equals", true], ["notEquals", false]] as const) {
    e.registerHelper(name, function (this: unknown, a: unknown, b: unknown, opts: Handlebars.HelperOptions) {
      const eq = equalsHelper(a, b);
      if (eq === undefined) throw new Error(`${name} called with ${JSON.stringify(a) ?? "undefined"} and ${JSON.stringify(b) ?? "undefined"}, a pair the template must not rely on`);
      return eq === same ? opts.fn(this) : opts.inverse(this);
    });
  }
  return e;
};
const hb = requirementHelpers(Handlebars.create());

// two helpers an ESP could ship that both meet the requirement
const helpers = (same: (a: unknown, b: unknown) => boolean): typeof Handlebars => {
  const e = Handlebars.create();
  for (const [name, yes] of [["equals", true], ["notEquals", false]] as const) {
    e.registerHelper(name, function (this: unknown, a: unknown, b: unknown, o: Handlebars.HelperOptions) {
      return same(a, b) === yes ? o.fn(this) : o.inverse(this);
    });
  }
  return e;
};
const strict = helpers((a, b) => a === b);
const coercing = helpers((a, b) => String(a ?? "") === String(b ?? ""));

// Every fill of a template: Liquid, or Handlebars with the requirement and the two helpers.
export const fills = (template: string, dialect: DialectName, props: Record<string, unknown>): string[] =>
  dialect === "liquid" ? [liquid.parseAndRenderSync(template, props)] : [hb, strict, coercing].map((e) => e.compile(template)(props));

// The real engines, so a dialect writer that produces something the ESP can't read fails here.
export const expand = (template: string, dialect: DialectName, props: Record<string, unknown>): string =>
  dialect === "handlebars" ? hb.compile(template)(props) : liquid.parseAndRenderSync(template, props);

// expected.html for a single dialect, expected.<dialect>.html when there are several
export const goldenName = (dialects: readonly DialectName[], d: DialectName): string => (dialects.length > 1 ? `expected.${d}.html` : "expected.html");

// Every data set a fixture has: props.json first, then props.<name>.json
export const dataSets = (f: Fixture): Array<[name: string, props: Record<string, unknown>]> => [
  ...(f.props ? ([["", f.props]] as Array<[string, Record<string, unknown>]>) : []),
  ...Object.entries(f.variants ?? {}),
];

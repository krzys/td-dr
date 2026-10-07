import type { DialectName } from "../../src/index.ts";
import { equalsHelper } from "../../src/template/dialects.ts";
import { importOptional } from "./optional.ts";

export type Fill = (template: string, data: unknown) => string;

type HelperOptions = { fn: (ctx: unknown) => string; inverse: (ctx: unknown) => string };
type Handlebars = {
  create: () => Handlebars;
  compile: (t: string) => (data: unknown) => string;
  registerHelper: (name: string, fn: (this: unknown, a: unknown, b: unknown, o: HelperOptions) => string) => void;
};
type LiquidJs = { Liquid: new () => { parseAndRenderSync: (t: string, data: object) => string } };

// The ESP's own engine, from the user's project, or undefined when it isn't installed.
const loaders: Record<DialectName, (root: string) => Promise<Fill | undefined>> = {
  handlebars: async (root) => {
    const mod = await importOptional<{ default: Handlebars }>(root, "handlebars");
    if (!mod) return undefined;
    const hb = mod.default.create();
    // the ESP's comparison helpers, which plain Handlebars doesn't ship: exactly what the template
    // relies on, and an error for a pair it doesn't (the data doesn't meet the template's needs)
    for (const [name, same] of [["equals", true], ["notEquals", false]] as const) {
      hb.registerHelper(name, function (this: unknown, a, b, o) {
        const eq = equalsHelper(a, b);
        if (eq === undefined) throw new Error(`${name}: ${JSON.stringify(a) ?? "missing"} and ${JSON.stringify(b) ?? "missing"} aren't two strings or two numbers; the template's comparison needs those`);
        return eq === same ? o.fn(this) : o.inverse(this);
      });
    }
    return (t, data) => hb.compile(t)(data);
  },
  liquid: async (root) => {
    const mod = await importOptional<LiquidJs>(root, "liquidjs");
    if (!mod) return undefined;
    const liquid = new mod.Liquid();
    return (t, data) => liquid.parseAndRenderSync(t, data as object);
  },
};

const cache = new Map<string, Promise<Fill | undefined>>();

export const engine = (root: string, dialect: DialectName): Promise<Fill | undefined> => {
  const key = `${dialect}\0${root}`;
  if (!cache.has(key)) cache.set(key, loaders[dialect](root));
  return cache.get(key)!;
};

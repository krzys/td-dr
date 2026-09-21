import type { Cond } from "../ir/types.ts";
import { condPaths, isProblem, parseCond, type CondProblem } from "./cond.ts";
import { isPath, pathProblem } from "./tokens.ts";

// The authoring side of templates (docs/templates.md): data-email-each / -as / -if / -unless / -else-if / -else on an element.
export const TEMPLATE_ATTRS = ["data-email-each", "data-email-as", "data-email-if", "data-email-unless", "data-email-else-if", "data-email-else"] as const;
// what makes an element a branch of a chain; each and as stay on it
export const CHAIN_ATTRS = ["data-email-if", "data-email-unless", "data-email-else-if", "data-email-else"] as const;

// `name` is the attribute it came from (an unless is an if with not).
export type Block = { op: "if"; name: "if" | "unless"; when: Cond } | { op: "each"; path: string; as?: string };
export type HintProblem = { message: string; hint?: string };

const IDENT = /^[A-Za-z_]\w*$/;

// a loop variable is a name a path could start with
export const isIdent = (s: string): boolean => IDENT.test(s) && isPath(s);

export const hasTemplateAttrs = (attrs: Readonly<Record<string, string>>): boolean => TEMPLATE_ATTRS.some((a) => attrs[a] !== undefined);

// The condition of an attribute (or of a tddr element's test), or what is wrong with it.
export const readCond = (value: string, what: string): Cond | CondProblem => parseCond(value.trim(), `${what}="${value}"`);

const OWN_LOOP_HINT = "The condition is checked once, outside the loop. Put it on a child of the repeated element to test each item.";

// A condition on an element that also carries data-email-each opens outside the loop, where its
// variable doesn't exist yet.
export const readsOwnLoop = (attrs: Readonly<Record<string, string>>, when: Cond, attr: string): HintProblem | undefined => {
  if (!isPath(attrs["data-email-each"]?.trim() ?? "")) return undefined;
  const as = attrs["data-email-as"]?.trim() ?? "item";
  if (!condPaths(when).some((p) => p.split(".")[0] === as)) return undefined;
  return { message: `${attr}="${attrs[attr]}" reads the loop variable of the same element's data-email-each`, hint: OWN_LOOP_HINT };
};

// Outermost first: if / unless guard the list, so they open before the each does. Anything
// invalid is left out and described in `problems`. Chains (-else-if / -else) are read in sanitize.
export const readBlocks = (attrs: Readonly<Record<string, string>>): { blocks: Block[]; problems: HintProblem[] } => {
  const blocks: Block[] = [];
  const problems: HintProblem[] = [];
  for (const name of ["if", "unless"] as const) {
    const attr = `data-email-${name}`;
    const v = attrs[attr];
    if (v === undefined) continue;
    const c = readCond(v, attr);
    if (isProblem(c)) {
      problems.push(c);
      continue;
    }
    const own = readsOwnLoop(attrs, c, attr);
    if (own) problems.push(own);
    else blocks.push({ op: "if", name, when: name === "if" ? c : { op: "not", cond: c } });
  }
  const eachValue = attrs["data-email-each"]?.trim();
  const each = eachValue !== undefined && isPath(eachValue) ? eachValue : undefined;
  if (eachValue !== undefined && !each) {
    problems.push({ message: `data-email-each="${eachValue}" is not a data path`, hint: "Use a dotted name such as order.items, or for -if/-unless a comparison: status == 'paid'." });
  }
  const as = attrs["data-email-as"]?.trim();
  if (as !== undefined && attrs["data-email-each"] === undefined) {
    problems.push({ message: "data-email-as without data-email-each", hint: "The alias names the loop variable of data-email-each; remove it or add the list." });
  }
  const badAs = as !== undefined && !isIdent(as);
  if (badAs) problems.push({ message: `data-email-as="${as}" is not a name${IDENT.test(as) ? `: ${pathProblem(as)}` : ""}`, hint: "Use a plain identifier such as line or item that isn't a template keyword or helper." });
  // fields in the loop read the alias, so a loop under another name would be wrong, not just unnamed
  if (each && !badAs) blocks.push({ op: "each", path: each, ...(as !== undefined ? { as } : {}) });
  return { blocks, problems };
};

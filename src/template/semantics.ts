import type { Cond } from "../ir/types.ts";
import { condPaths, condText, type Leaf } from "./cond.ts";
import { dialects, eachNeed, listNeed, type DialectName, type Need } from "./dialects.ts";

// A condition evaluated the way the html render does, in JS, on one data set: what preview()
// shows. A dialect's template matches it whenever the data meets that dialect's needs, so the
// needs of every test JS evaluates are checked too: a data set that doesn't meet them is an
// error, not a silent difference. A test JS skips (the right of a false &&) can't change the
// result in any dialect either, so it isn't checked.

export type Read = (path: string) => unknown;

const leaf = (c: Leaf, read: Read): boolean => {
  switch (c.op) {
    case "truthy":
      return !!read(c.path);
    case "nullish":
      return read(c.path) == null;
    case "nonEmpty":
      return (read(c.path) as unknown[]).length > 0;
    case "==":
    case "!=": {
      const r = c.right;
      const b = "path" in r ? read(r.path) : "num" in r ? r.num : "bool" in r ? r.bool : r.literal;
      return (read(c.left.path) === b) === (c.op === "==");
    }
  }
};

const show = (v: unknown): string => {
  if (v === undefined) return "missing";
  const s = JSON.stringify(v) ?? String(v);
  return s.length > 40 ? `${s.slice(0, 37)}...` : s;
};

export const dataError = (message: string): Error => {
  const err = new Error(`template data: ${message}`);
  err.name = "TemplateDataError";
  return err;
};

// what is wrong with the data for `n`, as a message, or undefined
const unmet = (n: Need, read: Read, who: string): string | undefined => {
  const vs = n.paths.map(read);
  if (n.ok(...vs)) return undefined;
  const values = n.paths.map((p, i) => `${p} is ${show(vs[i])}`).join(" and ");
  return `${values}; ${who} needs ${n.want} there (${n.why}).\nHint: ${n.hint}`;
};

const first = (needs: Array<[Need, string]>, read: Read): string | undefined => {
  for (const [n, who] of needs) {
    const m = unmet(n, read, who);
    if (m) return m;
  }
  return undefined;
};

const pathNeeds = (p: string, on: readonly DialectName[]): Array<[Need, string]> => on.flatMap((d) => dialects[d].pathNeeds(p).map((n): [Need, string] => [n, `the ${d} template`]));

// A field printed, or a list looped over: what the dialects need of the path itself.
export const checkPath = (path: string, read: Read, on: readonly DialectName[], loop = false): void => {
  const m = first([...(loop ? [[eachNeed(path), "a loop"] as [Need, string]] : []), ...pathNeeds(path, on)], read);
  if (m) throw dataError(`${loop ? "the loop over" : "the field"} ${path}: ${m}`);
};

const leafNeeds = (c: Leaf, on: readonly DialectName[]): Array<[Need, string]> => [
  ...(c.op === "nonEmpty" ? [[listNeed(c.path), "the test"] as [Need, string]] : []),
  ...on.flatMap((d) => dialects[d].needs(c).map((n): [Need, string] => [n, `the ${d} template`])),
  ...condPaths(c).flatMap((p) => pathNeeds(p, on)),
];

// `on`: the dialects whose needs the data must meet.
export const evaluate = (whole: Cond, read: Read, on: readonly DialectName[]): boolean => {
  const run = (c: Cond): boolean => {
    switch (c.op) {
      case "not":
        return !run(c.cond);
      case "and":
        return c.conds.every(run);
      case "or":
        return c.conds.some(run);
      default: {
        const m = first(leafNeeds(c, on), read);
        if (m) throw dataError(`in "${condText(whole)}", ${m}`);
        return leaf(c, read);
      }
    }
  };
  return run(whole);
};

// `x && <A/>` in a framework that prints 0 but nothing for false: the template shows nothing
// for any falsy x, so x must not be 0 (blocks.ts writes these paths as prints-zero).
export const checkZero = (paths: readonly string[], read: Read): void => {
  for (const p of paths) {
    if (read(p) !== 0) continue;
    throw dataError(`${p} is 0; the component prints "0" for ${p} && …, which the template can't (it shows nothing for any false value).\nHint: write ${p} ? … : null in the component, which shows nothing for 0 too, or send a value other than 0`);
  }
};

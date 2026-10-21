import type * as IR from "../../src/ir/types.ts";
import { condText as irText } from "../../src/template/cond.ts";

// A recorded condition, with JS's meaning on the data (see IR.Cond). `const` only lives while
// folding: a test that turns out constant takes the plain JS path, so none is ever written.
export type Operand = { path: string } | { lit: string } | { num: number } | { bool: boolean };
export type Cond =
  | { t: "const"; v: boolean }
  | { t: "truthy"; path: string }
  | { t: "nullish"; path: string } // == null: null or missing
  | { t: "nonEmpty"; path: string } // a list's length > 0
  | { t: "eq"; a: string; b: Operand; not: boolean } // ===, or !== with `not`
  | { t: "not"; c: Cond }
  | { t: "and"; a: Cond; b: Cond }
  | { t: "or"; a: Cond; b: Cond };

export const TRUE: Cond = { t: "const", v: true };
export const FALSE: Cond = { t: "const", v: false };
export const constant = (v: boolean): Cond => (v ? TRUE : FALSE);

export const not = (c: Cond): Cond => {
  if (c.t === "const") return constant(!c.v);
  if (c.t === "not") return c.c;
  if (c.t === "eq") return { ...c, not: !c.not };
  return { t: "not", c };
};

// conditions are plain data, so the same text is the same condition
const same = (a: Cond, b: Cond): boolean => JSON.stringify(a) === JSON.stringify(b);

export const and = (a: Cond, b: Cond): Cond => {
  if (a.t === "const") return a.v ? b : FALSE;
  if (b.t === "const") return b.v ? a : FALSE;
  if (same(a, b)) return a;
  if (same(not(a), b)) return FALSE;
  return { t: "and", a, b };
};

export const or = (a: Cond, b: Cond): Cond => {
  if (a.t === "const") return a.v ? TRUE : b;
  if (b.t === "const") return b.v ? TRUE : a;
  if (same(a, b)) return a;
  if (same(not(a), b)) return TRUE;
  return { t: "or", a, b };
};

const operand = (o: Operand): IR.Operand => ("lit" in o ? { literal: o.lit } : o);

// The one way from a recorded condition to the IR's; what reaches the markup is condText of
// this, which parseCond reads back to the same IR condition.
export const toIR = (c: Cond): IR.Cond => {
  switch (c.t) {
    case "const":
      throw new Error("tddr: a constant condition reached the markup");
    case "truthy":
    case "nullish":
    case "nonEmpty":
      return { op: c.t, path: c.path };
    case "eq":
      return { op: c.not ? "!=" : "==", left: { path: c.a }, right: operand(c.b) };
    case "not":
      return { op: "not", cond: toIR(c.c) };
    case "and":
    case "or": {
      const conds = [c.a, c.b].map(toIR).flatMap((x) => (x.op === c.t ? x.conds : [x]));
      return { op: c.t, conds };
    }
  }
};

export const condText = (c: Cond): string => irText(toIR(c));

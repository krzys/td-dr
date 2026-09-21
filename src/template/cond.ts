import type { Cond, Operand } from "../ir/types.ts";

const NAME = /^[A-Za-z_]\w*$/;
const PATH = /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/;
// Names a dialect or JS reads as something other than the data's field. As the first name:
// literals and keywords, Liquid's operators and loop objects, Handlebars' built-in helpers (a bare
// {{log}} calls the helper). As any name: what Handlebars parses as a literal, and what every JS
// object inherits (the html render would read Object.prototype, the engines nothing).
const FIRST = new Set(["else", "nil", "empty", "blank", "and", "or", "not", "contains", "forloop", "tablerowloop", "if", "unless", "each", "with", "lookup", "log", "equals", "notEquals", "helperMissing", "blockHelperMissing"]);
const ANY = new Set(["this", "true", "false", "null", "undefined", ...Object.getOwnPropertyNames(Object.prototype)]);

// Why `p` can't be a data path in a template, or undefined when it can.
export const pathProblem = (p: string): string | undefined => {
  const names = p.split(".");
  const bad = names.find((n) => !NAME.test(n));
  if (bad !== undefined) return bad === "" ? "it has an empty name" : `"${bad}" isn't a name of letters, digits and _`;
  if (FIRST.has(names[0]!)) return `"${names[0]}" is a keyword or helper of a template dialect`;
  const kw = names.find((n) => ANY.has(n));
  if (kw !== undefined) return `"${kw}" reads as a ${Object.hasOwn(Object.prototype, kw) ? "built-in member of every JS object" : "literal"}, not as a field`;
  return undefined;
};

export const isPath = (p: string): boolean => pathProblem(p) === undefined;

// Why a string can't be compared with in a template, or undefined. It sits in a marker comment
// (no --, < or >), in a Handlebars or Liquid string literal (no quotes, no backslash, which both
// read as an escape) and inside their tags (no {{ }} {% %}).
export const literalProblem = (s: string): string | undefined => {
  const m = /['"\\<>\u0000-\u001f\uE000\uE001]|--|\{\{|\}\}|\{%|%\}/.exec(s);
  return m ? `holds ${JSON.stringify(m[0])}` : undefined;
};

// The digits of a number a template can write so that they read back exactly, or undefined.
export const numberText = (n: number): string | undefined => {
  const t = String(n === 0 ? 0 : n);
  if (!/^-?\d+(\.\d+)?$/.test(t)) return undefined;
  return Number.isInteger(n) && !Number.isSafeInteger(n) ? undefined : t;
};

// The condition grammar (docs/templates.md#condition-semantics; it spells every IR condition):
//   p                          truthiness, as JS: !!p
//   p == null, p != null       null or missing (JS p == null)
//   p.length != 0, == 0        a list is empty or not (> 0 and >= 1 read the same)
//   p == 'x', p == 1, p == true, p == q, and !=     strict equality, as JS ===
//   !c, c && c, c || c, ( )    ! binds tighter than &&, && tighter than ||
// A trailing .length is always a list's length.

export type CondProblem = { message: string; hint: string };

const GRAMMAR_HINT =
  "A condition is a dotted name (paid), a comparison (status == 'paid', qty == 0, a.id != b.id, flag == true, note == null), a list test (items.length != 0), or these combined with !, && and || and parentheses.";
const PATH_HINT = "Use a dotted name such as order.items, or for -if/-unless a comparison: status == 'paid'.";
const KEYWORD_HINT = "Compare a dotted name with a quoted string, a plain number, true, false, null or another dotted name: status == 'paid', qty == 0, a.id == b.id.";
const STRING_HINT = "Compare a dotted name with a quoted string or a plain number: status == 'paid', qty == 0. The string can't hold quotes, a backslash, < >, --, {{ }} or {% %}.";
const NAME_HINT = "Use dotted names of letters, digits and _ that aren't template keywords, helpers or built-in object members (this, true, constructor, forloop, and, log ...); rename the field in the data.";
const NULL_HINT = "Write p == null: it holds for null and for a missing field, which the ESP's data doesn't tell apart.";
const LENGTH_HINT = "A list's length only tells whether it is empty: items.length != 0 (or > 0), items.length == 0. Send a count as its own field.";

type Tok = { t: "name" | "str" | "num" | "==" | "!=" | ">=" | ">" | "!" | "&&" | "||" | "(" | ")"; v: string };

const TOKEN = /\s*(?:(==|!=|>=|>|&&|\|\||!|\(|\))|'([^']*)'|"([^"]*)"|([A-Za-z_][\w.]*)|(-?\d+(?:\.\d+)?)(?![\w.]))/y;

type Bad = { bad: true; hint: string; detail?: string };
function fail(hint: string, detail?: string): never {
  throw { bad: true, hint, ...(detail ? { detail } : {}) } satisfies Bad;
}

const tokenize = (src: string): Tok[] => {
  const out: Tok[] = [];
  let at = 0;
  while (at < src.length) {
    if (/^\s*$/.test(src.slice(at))) break;
    TOKEN.lastIndex = at;
    const m = TOKEN.exec(src);
    if (!m) {
      const rest = src.slice(at).trim();
      if (rest.startsWith("=")) fail("Compare with == or !=; == compares like JS ===.", `unexpected "${rest[0]}"`);
      fail(/^['"]/.test(rest) ? STRING_HINT : GRAMMAR_HINT, `unexpected "${rest[0]}"`);
    }
    at = TOKEN.lastIndex;
    if (m[1]) out.push({ t: m[1] as Tok["t"], v: m[1] });
    else if (m[4] !== undefined) out.push({ t: "name", v: m[4] });
    else if (m[5] !== undefined) out.push({ t: "num", v: m[5] });
    else out.push({ t: "str", v: m[2] ?? m[3]! });
  }
  return out;
};

// a number the markup can hold: its digits survive Number() (ESPs keep long integers exact)
const exact = (v: string): boolean => {
  const n = Number(v);
  return /^-?\d+$/.test(v) ? Number.isSafeInteger(n) : String(n) === v.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
};
const inexact = (v: string): string =>
  /^-?\d+$/.test(v) ? `the number ${v} is too large to be written exactly` : `the number ${v} has more digits than a number holds exactly`;

// a list's length, `items.length`: the list's path
const lengthOf = (name: string): string | undefined => (name.endsWith(".length") ? name.slice(0, -".length".length) : undefined);

const KEYWORDS: Record<string, Operand | "null"> = { true: { bool: true }, false: { bool: false }, null: "null" };

const parse = (toks: Tok[]): Cond => {
  let i = 0;
  const peek = (): Tok | undefined => toks[i];
  const right = (): Operand | "null" => {
    const t = toks[i++];
    if (t?.t === "name") {
      const kw = KEYWORDS[t.v];
      if (kw) return kw;
      if (t.v === "undefined" || t.v === "nil") fail(NULL_HINT, `"${t.v}" isn't a value here`);
      if (lengthOf(t.v) !== undefined && isPath(lengthOf(t.v)!)) fail(LENGTH_HINT, `${t.v} is compared with a field`);
      const why = pathProblem(t.v);
      if (why) fail(t.v.includes(".") ? NAME_HINT : KEYWORD_HINT, why);
      return { path: t.v };
    }
    if (t?.t === "str") {
      const why = literalProblem(t.v);
      if (why) fail(STRING_HINT, `the string ${why}`);
      return { literal: t.v };
    }
    if (t?.t === "num") {
      if (!exact(t.v)) fail(`Compare it as a quoted string instead: id == '${t.v}'.`, inexact(t.v));
      return { num: Number(t.v) };
    }
    fail(GRAMMAR_HINT, t ? `unexpected "${t.v}"` : "it ends too early");
  };
  // items.length == 0, != 0, > 0, >= 1
  const listTest = (list: string): Cond => {
    const op = toks[i++]?.t;
    const n = toks[i++];
    const zero = n?.t === "num" && Number(n.v) === 0;
    const one = n?.t === "num" && Number(n.v) === 1;
    if (op === "==" && zero) return { op: "not", cond: { op: "nonEmpty", path: list } };
    if (((op === "!=" || op === ">") && zero) || (op === ">=" && one)) return { op: "nonEmpty", path: list };
    fail(LENGTH_HINT, `${list}.length is compared with ${n ? `"${n.v}"` : "nothing"}`);
  };
  const primary = (): Cond => {
    if (peek()?.t === "(") {
      i++;
      const c = or();
      if (toks[i++]?.t !== ")") fail(GRAMMAR_HINT, "a ( isn't closed");
      return c;
    }
    const t = toks[i++];
    if (t?.t === "str" || t?.t === "num") {
      const op = peek()?.t;
      fail(op === "==" || op === "!=" ? STRING_HINT : GRAMMAR_HINT, op === "==" || op === "!=" ? "the field goes on the left" : "a string or number alone isn't a condition");
    }
    if (t?.t !== "name") fail(GRAMMAR_HINT, t ? `unexpected "${t.v}"` : "it ends too early");
    const list = lengthOf(t.v);
    if (list !== undefined && isPath(list)) {
      if (peek()?.t !== "==" && peek()?.t !== "!=" && peek()?.t !== ">" && peek()?.t !== ">=") fail(LENGTH_HINT, `${t.v} alone isn't a test`);
      return listTest(list);
    }
    const why = pathProblem(t.v);
    if (why) fail(KEYWORDS[t.v] ? KEYWORD_HINT : NAME_HINT, `"${t.v}" is not a data path: ${why}`);
    const op = peek()?.t;
    if (op === ">" || op === ">=") fail("A field compares only with == and !=; send a flag computed before sending (order.freeShipping) and test that.", `unexpected "${op}"`);
    if (op !== "==" && op !== "!=") return { op: "truthy", path: t.v };
    i++;
    const r = right();
    if (r === "null") return op === "==" ? { op: "nullish", path: t.v } : { op: "not", cond: { op: "nullish", path: t.v } };
    return { op, left: { path: t.v }, right: r };
  };
  const unary = (): Cond => {
    if (peek()?.t !== "!") return primary();
    i++;
    return { op: "not", cond: unary() };
  };
  const chain = (op: "and" | "or", tok: "&&" | "||", next: () => Cond) => (): Cond => {
    const conds = [next()];
    while (peek()?.t === tok) {
      i++;
      conds.push(next());
    }
    return conds.length === 1 ? conds[0]! : { op, conds };
  };
  const and = chain("and", "&&", unary);
  const or: () => Cond = chain("or", "||", and);
  const c = or();
  if (i < toks.length) fail(GRAMMAR_HINT, `unexpected "${toks[i]!.v}"`);
  return c;
};

// `what` names the source in messages, e.g. data-email-if="a b".
export const parseCond = (src: string, what: string): Cond | CondProblem => {
  try {
    const toks = tokenize(src);
    if (toks.length === 0) return { message: `${what} is empty`, hint: GRAMMAR_HINT };
    return parse(toks);
  } catch (e) {
    if (!(e as Bad | undefined)?.bad) throw e;
    const { hint, detail } = e as Bad;
    // anything without operators or quotes was meant as a single path
    if (!/[=!&|()'"<>]/.test(src) && !/\.length\s*$/.test(src)) {
      const why = PATH.test(src.trim()) ? pathProblem(src.trim()) : undefined;
      return why ? { message: `${what} is not a data path: ${why}`, hint: NAME_HINT } : { message: `${what} is not a data path`, hint: PATH_HINT };
    }
    return { message: `${what} can't be written as a template condition${detail ? `: ${detail}` : ""}`, hint };
  }
};

export const isProblem = (c: Cond | CondProblem): c is CondProblem => "message" in c;

const operandText = (o: Operand): string => ("path" in o ? o.path : "num" in o ? String(o.num) : "bool" in o ? String(o.bool) : `'${o.literal}'`);

// One spelling per condition, so it can travel in a marker and be read back with parseCond
// exactly (parseCond(condText(c)) equals c). No `>`: a marker comment can't hold one.
export const condText = (c: Cond): string => {
  switch (c.op) {
    case "truthy":
      return c.path;
    case "nullish":
      return `${c.path} == null`;
    case "nonEmpty":
      return `${c.path}.length != 0`;
    case "==":
    case "!=":
      return `${c.left.path} ${c.op} ${operandText(c.right)}`;
    case "not":
      if (c.cond.op === "truthy") return `!${c.cond.path}`;
      if (c.cond.op === "nullish") return `${c.cond.path} != null`;
      if (c.cond.op === "nonEmpty") return `${c.cond.path}.length == 0`;
      return `!(${condText(c.cond)})`;
    case "and":
      return c.conds.map((x) => (x.op === "or" ? `(${condText(x)})` : condText(x))).join(" && ");
    case "or":
      return c.conds.map(condText).join(" || ");
  }
};

// The leaves of a condition: everything but not / and / or.
export type Leaf = Exclude<Cond, { op: "not" | "and" | "or" }>;

export const condPaths = (c: Cond): string[] => {
  switch (c.op) {
    case "==":
    case "!=":
      return [c.left.path, ...("path" in c.right ? [c.right.path] : [])];
    case "not":
      return condPaths(c.cond);
    case "and":
    case "or":
      return c.conds.flatMap(condPaths);
    default:
      return [c.path];
  }
};

export const mapPaths = (c: Cond, fn: (p: string) => string): Cond => {
  switch (c.op) {
    case "==":
    case "!=":
      return { op: c.op, left: { path: fn(c.left.path) }, right: "path" in c.right ? { path: fn(c.right.path) } : c.right };
    case "not":
      return { op: "not", cond: mapPaths(c.cond, fn) };
    case "and":
    case "or":
      return { op: c.op, conds: c.conds.map((x) => mapPaths(x, fn)) };
    default:
      return { op: c.op, path: fn(c.path) };
  }
};

// Negation pushed down to the leaves (a negated comparison flips its operator), and nested
// and / or of the same kind flattened: the form the writers lower from.
export const normalize = (c: Cond, neg = false): Cond => {
  switch (c.op) {
    case "==":
    case "!=":
      return neg ? { ...c, op: c.op === "==" ? "!=" : "==" } : c;
    case "not":
      return normalize(c.cond, !neg);
    case "and":
    case "or": {
      const op = neg ? (c.op === "and" ? "or" : "and") : c.op;
      const conds = c.conds.map((x) => normalize(x, neg)).flatMap((x) => (x.op === op ? x.conds : [x]));
      return { op, conds };
    }
    default:
      return neg ? { op: "not", cond: c } : c;
  }
};

export const both = (op: "and" | "or", conds: readonly Cond[]): Cond => (conds.length === 1 ? conds[0]! : { op, conds });

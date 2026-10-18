// What the tddr() transform rewrites operators into. On plain values each one is the JS
// operator (same short-circuit, same operand returned); on template values it records.
import { boolBranch, branch, branchSubject, condOf, isBranch, isTemplateValue, nullOf, sameConst } from "./branch.ts";
import * as C from "./cond.ts";
import { literalProblem, numberText } from "../../src/template/cond.ts";
import { templateError } from "./errors.ts";
import { infoOf, isEach, textOf, type Info } from "./symbolic.ts";

type Thunk = () => unknown;

const subject = (v: unknown): string => {
  const i = infoOf(v);
  if (i) return i.kind === "length" ? `${i.path}.length` : i.kind === "index" ? `the index of ${i.path}` : i.path;
  return isBranch(v) ? branchSubject(v) : String(v);
};

const MARKUP_HINT = "branch in the markup: cond ? <A/> : <B/>, cond && <A/>, or v-if / v-else in Vue";
const FIELD_HINT = "send the value ready to use in the data (a formatted string or a flag), and test or print that";

export const and = (a: unknown, b: Thunk): unknown => {
  const c = condOf(a);
  if (c.t === "const") return c.v ? b() : a;
  const v = b();
  // as in JS, a falsy a is the value; blocks.ts decides what a framework shows for it
  return branch([{ when: c, value: v }], a, C.and(c, condOf(v)));
};

export const or = (a: unknown, b: Thunk): unknown => {
  const c = condOf(a);
  if (c.t === "const") return c.v ? a : b();
  const v = b();
  return branch([{ when: c, value: a }], v, C.or(c, condOf(v)));
};

const join = (c: C.Cond, x: unknown, y: unknown): unknown => branch([{ when: c, value: x }], y, sameConst([condOf(x), condOf(y)]) ?? C.or(C.and(c, condOf(x)), C.and(C.not(c), condOf(y))));

// `a ?? b` on a field: a when it is set (not null, not missing), else b, as in JS
export const nullish = (a: unknown, b: Thunk): unknown => {
  if (!isTemplateValue(a)) return a ?? b();
  const set = C.not(nullOf(a));
  if (set.t === "const") return set.v ? a : b();
  return join(set, a, b());
};

export const cond = (t: unknown, a: Thunk, b: Thunk): unknown => {
  const c = condOf(t);
  if (c.t === "const") return c.v ? a() : b();
  return join(c, a(), b());
};

// `cond` for arms that give several values at once (a list each): one branch per position
export const condAll = (t: unknown, a: () => unknown[], b: () => unknown[]): unknown[] => {
  const c = condOf(t);
  if (c.t === "const") return c.v ? a() : b();
  const x = a();
  const y = b();
  return x.map((v, i) => join(c, v, y[i]));
};

export const not = (x: unknown): unknown => {
  const c = condOf(x);
  return c.t === "const" ? !c.v : boolBranch(C.not(c));
};

const NULL_HINT = (p: string) => `write ${p} == null (or != null): it holds for null and for a missing field, which the ESP's data doesn't tell apart`;
const LOOSE_HINT = (p: string, v: string) => `compare with === (${p} === ${v}); the template compares like ===`;

// A field compared with a plain value: === (or ==, `loose`) as a recorded condition, or why not.
const literal = (i: Info, v: unknown, loose: boolean): C.Cond => {
  if (v === null || v === undefined) {
    if (loose) return { t: "nullish", path: i.path };
    throw templateError(i.path, `is compared with === to ${String(v)}; a template can't tell null from a missing field.`, NULL_HINT(i.path));
  }
  const shown = typeof v === "string" ? JSON.stringify(v) : String(v);
  if (loose && (typeof v === "string" || typeof v === "number" || typeof v === "boolean")) {
    throw templateError(i.path, `is compared with == to ${shown}; JS == also matches other types ("1" == 1, true == 1, ["x"] == "x"), and no template can.`, LOOSE_HINT(i.path, typeof v === "string" ? `'${v}'` : shown));
  }
  if (typeof v === "string") {
    const why = literalProblem(v);
    if (why) throw templateError(i.path, `is compared with ${JSON.stringify(v)}, which ${why}; a template comparison can't hold that.`, "compare with a plain word, or send a flag");
    return { t: "eq", a: i.path, b: { lit: v }, not: false };
  }
  if (typeof v === "number") {
    if (numberText(v) === undefined) {
      const big = /^-?\d+$/.test(String(v));
      throw templateError(i.path, big ? `is compared with ${String(v)}, a number too large to write exactly in a template.` : `is compared with ${String(v)}, which a template can't write as a plain number.`, big ? "compare it as a quoted string (id === '12345678901234567890'), or send a flag" : FIELD_HINT);
    }
    return { t: "eq", a: i.path, b: { num: v === 0 ? 0 : v }, not: false };
  }
  if (typeof v === "boolean") return { t: "eq", a: i.path, b: { bool: v }, not: false };
  throw templateError(i.path, `is compared with ${subject(v)}; a template compares a field with a string, a number, a boolean or another field.`, FIELD_HINT);
};

// Only "is the list empty" survives: items.length === 0, !== 0 (and == / != 0, a number either way).
const lengthTest = (i: Info, n: unknown, negate: boolean): C.Cond => {
  if (n !== 0) throw templateError(`${i.path}.length`, `is compared with ${subject(n)}; a template only knows whether a list is empty.`, "test items.length > 0 (or === 0), or send the count as a field");
  const has: C.Cond = { t: "nonEmpty", path: i.path };
  return negate ? has : C.not(has);
};

const compare = (a: unknown, b: unknown, negate: boolean, loose: boolean): unknown => {
  if (isBranch(a) || isBranch(b)) throw templateError(subject(isBranch(a) ? a : b), "is compared; only a field itself can be compared.", "compare the field, then choose the value: x === 'a' ? … : …");
  // a list's length goes first, whichever side it is on; else the field
  const [x, y] = infoOf(b)?.kind === "length" || !infoOf(a) ? [b, a] : [a, b];
  const xi = infoOf(x)!;
  if (xi.kind === "length") return boolBranch(lengthTest(xi, y, negate));
  // a field with a usable path, or the reason it isn't one
  textOf(xi);
  const yi = infoOf(y);
  if (yi) {
    textOf(yi);
    if (loose) throw templateError(`${xi.path} == ${yi.path}`, "compares two fields with ==; JS == also matches values of different types (\"1\" == 1), and no template can.", LOOSE_HINT(xi.path, yi.path));
  }
  const c: C.Cond = yi ? { t: "eq", a: xi.path, b: { path: yi.path }, not: false } : literal(xi, y, loose);
  return boolBranch(negate ? C.not(c) : c);
};

const plain = (a: unknown, b: unknown): boolean => !isTemplateValue(a) && !isTemplateValue(b);

// switch (true) { case order.paid: } lands here as true === field. JS compares the value itself
// with true, where such a switch is usually meant as a truthiness test. Say so rather than guess.
const SWITCH_TRUE_HINT = "branch with if (order.paid) … else if (…), or compare the field with a value: order.status === 'paid'";
const boolFirst = (a: unknown, b: unknown): void => {
  if (typeof a === "boolean" && isTemplateValue(b) && !isBranch(b)) throw templateError(subject(b), `is compared with ${a} on the left (a switch (${a}) case, or ${a} === field); JS compares the value itself with ${a}, which is rarely what such a switch means.`, `${SWITCH_TRUE_HINT}; for the strict comparison write the field first: order.paid === ${a}`);
};

// the case of a switch on a literal that JS compares natively
export const onCase = (v: unknown, disc: unknown): unknown => {
  if (!isTemplateValue(v) || isTemplateValue(disc)) return v;
  boolFirst(disc, v);
  throw templateError(subject(v), `is a case of a switch on ${typeof disc === "bigint" ? String(disc) : JSON.stringify(disc)}; JS would compare it with ===, and a template value never matches.`, SWITCH_TRUE_HINT);
};

export const eq = (a: unknown, b: unknown): unknown => (plain(a, b) ? a === b : (boolFirst(a, b), compare(a, b, false, false)));
export const ne = (a: unknown, b: unknown): unknown => (plain(a, b) ? a !== b : (boolFirst(a, b), compare(a, b, true, false)));
export const looseEq = (a: unknown, b: unknown): unknown => (plain(a, b) ? a == b : (boolFirst(a, b), compare(a, b, false, true)));
export const looseNe = (a: unknown, b: unknown): unknown => (plain(a, b) ? a != b : (boolFirst(a, b), compare(a, b, true, true)));

// Only "is the list empty" survives: items.length > 0, >= 1, < 1, <= 0, either way round.
const FLIPPED = { "<": ">", ">": "<", "<=": ">=", ">=": "<=" } as const;
const order = (a: unknown, b: unknown, op: "<" | ">" | "<=" | ">="): unknown => {
  const ai = infoOf(a);
  const bi = infoOf(b);
  // as list.length <op> n
  const [list, rel, n] = ai?.kind === "length" ? [ai, op, b] : bi?.kind === "length" ? [bi, FLIPPED[op], a] : [undefined, op, undefined];
  const has = (rel === ">" && n === 0) || (rel === ">=" && n === 1);
  const none = (rel === "<" && n === 1) || (rel === "<=" && n === 0);
  if (list && (has || none)) {
    const c: C.Cond = { t: "nonEmpty", path: list.path };
    return boolBranch(has ? c : C.not(c));
  }
  throw templateError(subject(isTemplateValue(a) ? a : b), `is compared with ${op}; the dialects compare fields only for equality.`, "send a flag computed before sending (e.g. order.freeShipping) and test that");
};

type Ordered = number | string | bigint;
export const lt = (a: unknown, b: unknown): unknown => (plain(a, b) ? (a as Ordered) < (b as Ordered) : order(a, b, "<"));
export const gt = (a: unknown, b: unknown): unknown => (plain(a, b) ? (a as Ordered) > (b as Ordered) : order(a, b, ">"));
export const le = (a: unknown, b: unknown): unknown => (plain(a, b) ? (a as Ordered) <= (b as Ordered) : order(a, b, "<="));
export const ge = (a: unknown, b: unknown): unknown => (plain(a, b) ? (a as Ordered) >= (b as Ordered) : order(a, b, ">="));

export const add = (a: unknown, b: unknown): unknown => {
  if (plain(a, b) && !isEach(a) && !isEach(b)) return (a as string) + (b as string);
  if (isBranch(a) || isBranch(b) || isEach(a) || isEach(b)) {
    throw templateError(subject(isTemplateValue(a) ? a : b), "is joined with + into a string; a string can't hold a branch or a loop.", MARKUP_HINT);
  }
  const ai = infoOf(a);
  const bi = infoOf(b);
  if (ai && bi) throw templateError(`${subject(a)} + ${subject(b)}`, "adds two template fields; that is either arithmetic or joining text, and a template can't do the first.", "join text with a template string: `${a} ${b}`, or send the sum in the data");
  const other = ai ? b : a;
  if (typeof other !== "string") throw templateError(subject(ai ? a : b), "is used in arithmetic (+); the ESP fills fields as text at send time.", FIELD_HINT);
  return ai ? textOf(ai) + other : other + textOf(bi!);
};

// What the rewrite couldn't turn into a branch value, and what to do instead (docs/templates.md#native-component-code).
const GUARD_HINT = "return from every branch (if (x) return a; return b), assign a let in every branch (let v; if (x) v = a; else v = b), or branch in the markup: cond ? <A/> : <B/>";
const STATEMENT: Record<string, [why: string, hint: string]> = {
  loop: ["is the test of a loop; a template can't repeat code until a field changes.", "loop over a list with .map, or send the list ready to use in the data"],
  effects: ["decides a branch that does more than return or assign a variable (a call, push, +=, a member assignment); JS runs only one side of it, a template needs both.", "return the value from each branch, assign a let in every branch, or build the list outside the condition"],
  assign: ["assigns something that is not a let declared earlier in this function (a parameter, a const or an outer variable) in a branch decided by a field; JS runs only one side of it, a template needs both.", "declare a let in this function before the if (let v = …;) and assign that, or return the value from each branch"],
  armEffect: ["decides a branch whose value changes something while it is computed (a nested assignment like v = w = 1, ++, --, delete, push, splice); a template renders every branch once, so the change would happen for each of them.", "compute the value without changing anything: build the list or counter before the condition, and let each branch only return or assign its value"],
  closure: ["assigns several variables in a branch decided by a field while a function in this component also reads them; a template runs the branches on copies, so that function would see the wrong values.", "assign one variable per if (that form works with functions), or pass the values to the function as arguments"],
  shadow: ["assigns a variable that a branch declares again with its own let or const, so the branch would change a different variable than the one after the if.", "rename the variable declared inside the branch"],
  tryAssign: ["assigns several variables in a branch decided by a field inside try / catch; a template runs the branch on copies, so an error partway would lose the assignments made before it.", "decide before the try, or assign one variable per if"],
  await: ["decides a branch with an await or yield in it; a template can't wait for a value.", "await before the if and branch on the result"],
  hoist: ["decides a return, but a name declared after it (a function below, a later const or let) is also used before or inside the if; moving the code after the if into the branch would change which one that name means.", "rename the later declaration, or move declarations above the if"],
  jump: ["decides a break or continue; JS runs only one side of it, a template needs both.", "branch inside the loop body (cond && <A/>) instead of leaving the loop early, or filter the list in the data"],
  loopReturn: ["decides a return inside a loop; JS runs only one side of it, a template needs both.", ".map over the list and branch per item, or send the chosen item in the data"],
  midReturn: ["decides a return that can't become one value: it sits in a nested block, only some paths of its branch return, or the code after the if does more than declare and return; JS runs only one side of it, a template needs both.", "put the if at the top of the function body, return from every path of it, and keep the code after it to declarations and the return"],
  tryReturn: ["decides a return inside try / catch; JS runs only one side of it, a template needs both.", "decide before the try (if (x) return a;) and keep only the risky call inside it"],
};
const SWITCH: Record<string, [why: string, hint: string]> = {
  grouped: ["decides a switch with a case grouped with default whose test is not a plain literal; JS would still evaluate that test, a template can't.", "use a literal for that case (case 'a': default: …), or drop it, since default already covers it"],
  break: ["decides a switch whose case ends in break; a template needs each case to return its value.", "end every case with return (empty cases may be grouped above it), or chain x === 'a' ? … : x === 'b' ? … : …"],
  fall: ["decides a switch where a case falls through into the next one's code; a template needs each case to return its value.", "end every case with return, or group empty cases: case 'a': case 'b': return …"],
};

// statement `if`, loops, `switch` and `typeof` run one way in JS; a template needs both ways
export const test = (v: unknown, why?: string): unknown => {
  if (!isTemplateValue(v)) return v;
  const c = condOf(v);
  if (c.t === "const") return c.v;
  const [reason, hint] = STATEMENT[why ?? ""] ?? ["decides a statement (if, a loop or a switch); JS runs only one side of it, a template needs both.", GUARD_HINT];
  throw templateError(subject(v), reason, hint);
};

export const switchOn = (v: unknown, why?: string): unknown => {
  if (isTemplateValue(v)) {
    const [reason, hint] = SWITCH[why ?? ""] ?? STATEMENT[why ?? ""] ?? ["decides a switch; JS runs only one case, a template needs them all.", `${MARKUP_HINT}, chaining x === 'a' ? … : x === 'b' ? … : …; or return from every case`];
    throw templateError(subject(v), reason, hint);
  }
  return v;
};

export const typeOf = (v: unknown): string => {
  if (isTemplateValue(v)) throw templateError(subject(v), "is checked with typeof; its type isn't known until the ESP fills it.", "decide the type in the data, or test the field itself");
  return typeof v;
};

// the transform puts this first in every catch: an author's try must not hide what a template can't do
export const rethrow = (e: unknown): void => {
  if (e instanceof Error && e.name === "TemplateError") throw e;
};

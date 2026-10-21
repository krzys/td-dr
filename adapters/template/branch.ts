import * as C from "./cond.ts";
import { condText, constant, type Cond } from "./cond.ts";
import { templateError } from "./errors.ts";
import { infoOf, isEach, isProbe, textOf } from "./symbolic.ts";

// What `?:`, `&&` and `||` give back on a symbolic test: every arm, and what the whole value
// tests as when it is itself used as a condition. Its own parts are $-named so that a property
// read off the branch (cfg.test, cfg.arms) is never mistaken for them (an arm's own $test,
// $arms or $otherwise key can't be read: the branch answers for those).
export const BRANCH = Symbol.for("tddr.branch");
export type Arm = { when: Cond; value: unknown };
export type Branch = { readonly [BRANCH]: true; $test: Cond; $arms: Arm[]; $otherwise: unknown };

// a function target when an arm is a function, so that calling the branch can be told apart
export const isBranch = (v: unknown): v is Branch => (typeof v === "object" || typeof v === "function") && v !== null && BRANCH in v;

// anything the operators can't hand to plain JS
export const isTemplateValue = (v: unknown): boolean => infoOf(v) !== undefined || isBranch(v);

const INSPECT = Symbol.for("nodejs.util.inspect.custom");
const INTERNAL = new Set(["$test", "$arms", "$otherwise"]);

const depends = (b: Branch): string => `a value that depends on ${condText(b.$arms[0]!.when)}`;
const BRANCH_HINT = "branch in the markup instead: cond ? <A/> : <B/> (v-if / v-else in Vue), or send the value ready to use in the data";
const READ_ONLY_HINT = "keep your own values in local variables";

export const branchSubject = depends;
export const branchError = (b: Branch, what: string, hint = BRANCH_HINT): Error => templateError(depends(b), what, hint);
const unsupported = (b: Branch, what: string, hint = BRANCH_HINT): Error =>
  branchError(b, `${what}; it is only one of several values until the ESP fills the data.`, hint);

// fields are callable proxies too: a method on a branch of fields must still be named
const isFn = (v: unknown): boolean => typeof v === "function" && !isBranch(v);

// what `of` says of a value made of these arms: `of` of the first arm whose test holds, else of
// the fallback (if / else-if order)
const armsCond = (arms: Arm[], otherwise: unknown, of: (v: unknown) => Cond): Cond => {
  const same = sameConst([...arms.map((a) => of(a.value)), of(otherwise)]);
  if (same) return same;
  let none: Cond = C.TRUE;
  let any: Cond = C.FALSE;
  for (const a of arms) {
    any = C.or(any, C.and(C.and(none, a.when), of(a.value)));
    none = C.and(none, C.not(a.when));
  }
  return C.or(any, C.and(none, of(otherwise)));
};

// what a value made of these arms tests as
export const armsTest = (arms: Arm[], otherwise: unknown): Cond => armsCond(arms, otherwise, condOf);

// the constant that every one of these tests as, if they agree: the arm taken then makes no difference
export const sameConst = (cs: Cond[]): Cond | undefined => (cs.every((c) => c.t === "const" && c.v === (cs[0] as { v?: boolean }).v) ? cs[0] : undefined);

// the key a called branch was read with (cfg.fmt(...)), to name it in the error
const callee = new WeakMap<object, string>();

// one arm's `.key`; a missing value reads as undefined, like `?.`
const read = (v: unknown, key: string): unknown => (v === null || v === undefined ? undefined : (v as Record<string, unknown>)[key]);

// cfg.color on a branch of objects is a branch of each arm's color; all arms plain and equal
// give that value.
const property = (b: Branch, key: string): unknown => {
  const arms = b.$arms.map((a) => ({ when: a.when, value: read(a.value, key) }));
  const otherwise = read(b.$otherwise, key);
  return branch(arms, otherwise, armsTest(arms, otherwise), key);
};

const hasOwn = (b: Branch, key: string): boolean =>
  [...b.$arms.map((a) => a.value), b.$otherwise].some((v) => (typeof v === "object" || typeof v === "function") && v !== null && Object.hasOwn(v, key));

const handler: ProxyHandler<Branch> = {
  get(t, key) {
    if (key === BRANCH) return true;
    // Vue's markRaw flag: a reactive proxy around a branch would ask it for keys it can't answer
    if (key === "__v_skip") return true;
    if (typeof key === "string" && INTERNAL.has(key)) return t[key as "$test"];
    if (key === Symbol.toPrimitive)
      return (hint: string) => {
        throw hint === "number"
          ? unsupported(t, "is used as a number (arithmetic)", "send the number ready to use in the data, or choose between prepared values in the markup")
          : templateError(depends(t), "is turned into text (a template string, + or an attribute that can't branch).", "put the condition around the markup instead: cond ? <b>{a}</b> : <b>{b}</b>, or v-if / v-else in Vue");
      };
    if (key === INSPECT) return () => `[template branch ${t.$arms.map((a) => condText(a.when)).join(" / ")}]`;
    if (key === Symbol.iterator)
      return () => {
        throw unsupported(t, "is iterated (spread, for…of, Array.from)");
      };
    if (typeof key === "symbol" || (isProbe(key) && !hasOwn(t, key))) return undefined;
    return property(t, key);
  },
  // `in` / hasOwn would have to answer for every arm at once
  has(t, key) {
    if (key === BRANCH) return true;
    if (typeof key === "symbol" || (isProbe(key) && !hasOwn(t, key))) return false;
    throw unsupported(t, "is tested for a key (in / hasOwn)", "test the value itself (cfg.discount ? … : …), or keep the key in every arm");
  },
  ownKeys(t) {
    throw unsupported(t, "is spread, serialized (JSON) or has its keys listed");
  },
  getOwnPropertyDescriptor(t, key) {
    if (typeof key === "symbol" || (isProbe(key) && !hasOwn(t, key))) return undefined;
    throw unsupported(t, "is tested for a key (in / hasOwn)", "test the value itself (cfg.discount ? … : …), or keep the key in every arm");
  },
  apply(t) {
    const key = callee.get(t);
    if (key) throw unsupported(t, `has .${key}() called on it`);
    throw unsupported(t, "is called as a function", "call it in the markup instead: cond ? fmtA(x) : fmtB(x)");
  },
  set(t) {
    throw unsupported(t, "is assigned to", READ_ONLY_HINT);
  },
  defineProperty(t) {
    throw unsupported(t, "is assigned to", READ_ONLY_HINT);
  },
  deleteProperty(t) {
    throw unsupported(t, "is assigned to", READ_ONLY_HINT);
  },
};

// `a ? b : (c ? d : e)` is one if / else-if / else chain
export const branch = (arms: Arm[], otherwise: unknown, test: Cond, readAs?: string): Branch => {
  if (isBranch(otherwise)) return branch([...arms, ...otherwise.$arms], otherwise.$otherwise, test, readAs);
  const values = [...arms.map((a) => a.value), otherwise];
  // arms that are all plain and equal are just that value (a method both arms share is not: it would run on the branch)
  if (!(readAs && isFn(values[0])) && values.every((v) => !isTemplateValue(v) && Object.is(v, values[0]))) return values[0] as Branch;
  const parts = { [BRANCH]: true, $test: test, $arms: arms, $otherwise: otherwise } as Branch;
  const target = values.some(isFn) ? Object.assign(() => undefined, parts) : parts;
  if (readAs) callee.set(target, readAs);
  return new Proxy(target as Branch, handler);
};

export const boolBranch = (c: Cond): Branch => branch([{ when: c, value: true }], false, c);

// what a value tests as in JS (!!v), as a condition
export const condOf = (v: unknown): Cond => {
  const i = infoOf(v);
  if (i) {
    if (i.kind === "index") textOf(i); // throws with the reason
    if (i.kind === "filtered") return constant(true); // an array
    if (i.kind === "length") return { t: "nonEmpty", path: i.path }; // a count is true when not 0
    textOf(i); // checks the path
    return { t: "truthy", path: i.path };
  }
  if (isBranch(v)) return v.$test;
  if (isEach(v)) return constant(true);
  return constant(!!v);
};

// whether a value is null or undefined (v == null), as a condition
export const nullOf = (v: unknown): Cond => {
  const i = infoOf(v);
  if (i) {
    if (i.kind === "index") textOf(i);
    if (i.kind !== "field") return constant(false); // a count, a list
    textOf(i);
    return { t: "nullish", path: i.path };
  }
  if (isBranch(v)) return armsCond(v.$arms, v.$otherwise, nullOf);
  if (isEach(v)) return constant(false);
  return constant(v == null);
};

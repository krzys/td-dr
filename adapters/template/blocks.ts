import { condOf, isBranch, type Arm, type Branch } from "./branch.ts";
import * as C from "./cond.ts";
import { cond, condAll } from "./ops.ts";
import { infoOf, isEach } from "./symbolic.ts";

// One `<tddr-*>` element of the template input (docs/templates.md); `value` is what goes inside it.
export type Part = { tag: "tddr-if" | "tddr-else-if" | "tddr-else" | "tddr-each"; attrs: Record<string, string>; value: unknown };

// the parts of an and-chain, `a && b` read as [a, b]
const conj = (c: C.Cond): string[] => (c.t === "and" ? [...conj(c.a), ...conj(c.b)] : c.t === "const" && c.v ? [] : [JSON.stringify(c)]);

// The path of a field value that is falsy whenever its arm is reached: an earlier arm tested it
// with nothing this arm doesn't also test (`x && y` falls through to x exactly when x is falsy).
const falsyField = (earlier: readonly Arm[], when: C.Cond, v: unknown): string | undefined => {
  const i = infoOf(v);
  if (i?.kind !== "field") return undefined;
  const t = JSON.stringify({ t: "truthy", path: i.path } satisfies C.Cond);
  const here = new Set([...conj(when), t]);
  return earlier.some((a) => conj(a.when).includes(t) && conj(a.when).every((x) => here.has(x))) ? i.path : undefined;
};

// An arm that renders nothing is left out: its condition guards the arms after it instead, so
// `a ? null : <X/>` is one `if !a`. A field that is falsy where it is reached shows what the
// framework shows for a falsy value: a framework that prints false (Vue) prints the field as the
// template does; one that shows nothing for false (React) shows nothing, except "0" for 0, which
// is a data need the parts carry (`prints-zero`, checked by preview()).
const branchParts = (b: Branch, empty: (v: unknown) => boolean): Part[] => {
  const kept: { when: C.Cond; value: unknown }[] = [];
  const zero: string[] = [];
  const nothing = (when: C.Cond, k: number, v: unknown): boolean => {
    if (empty(v)) return true;
    const falsy = empty(false) ? falsyField(b.$arms.slice(0, k), when, v) : undefined;
    if (falsy !== undefined && !empty(0)) zero.push(falsy);
    return falsy !== undefined;
  };
  let guard: C.Cond = C.TRUE;
  b.$arms.forEach((a, k) => {
    if (nothing(a.when, k, a.value)) guard = C.and(guard, C.not(a.when));
    else kept.push({ when: C.and(guard, a.when), value: a.value });
  });
  const otherwise = b.$otherwise === undefined || nothing(C.TRUE, b.$arms.length, b.$otherwise) ? undefined : b.$otherwise;
  const last = otherwise !== undefined && guard !== C.TRUE ? { when: guard, value: otherwise } : undefined;
  const arms = last ? [...kept, last] : kept;
  const parts: Part[] = arms.map((a, i) => ({ tag: i ? "tddr-else-if" : "tddr-if", attrs: { test: C.condText(a.when) }, value: a.value }));
  if (otherwise !== undefined && !last) parts.push({ tag: "tddr-else", attrs: {}, value: otherwise });
  if (zero.length === 0) return parts;
  // the need sits on the chain's head; with nothing shown at all, on an empty one
  const head = parts[0]?.tag === "tddr-if" ? parts[0] : { tag: "tddr-if" as const, attrs: { test: C.condText(b.$arms[0]!.when) }, value: undefined };
  head.attrs["prints-zero"] = [...new Set(zero)].join(" ");
  return parts[0] === head ? parts : [head, ...parts];
};

// The elements a branch or a loop renders as, or undefined for any other value. `empty` is what
// the framework renders as nothing (React: null, booleans, ""; Vue's text: null and "").
export const blockParts = (v: unknown, empty: (v: unknown) => boolean): Part[] | undefined => {
  if (isBranch(v)) return branchParts(v, empty);
  if (isEach(v)) return [{ tag: "tddr-each", attrs: { of: v.of, as: v.as }, value: v.body }];
  return undefined;
};

// If / ElseIf / Else as one value, the way `a ? x : b ? y : z` is
export const chain = (arms: Array<[when: unknown, value: () => unknown]>, otherwise?: () => unknown): unknown => {
  const [first, ...rest] = arms;
  if (!first) return otherwise?.();
  return cond(first[0], first[1], () => chain(rest, otherwise));
};

type Thunk = () => unknown;

// Statement ifs that return (the transform's early returns): like `chain`, but a test is only
// evaluated once the ones before it were false, as JS does.
export const guards = (arms: Array<[test: Thunk, value: Thunk]>, otherwise?: Thunk): unknown => {
  const [first, ...rest] = arms;
  if (!first) return otherwise?.();
  return cond(first[0](), first[1], () => guards(rest, otherwise));
};

// a switch whose cases return: `entries` get the discriminant, a null test is `default`
export const pick = (d: unknown, entries: (d: unknown) => Array<[test: Thunk | null, value: Thunk]>, rest?: Thunk): unknown => {
  const all = entries(d);
  const fallback = all.find(([t]) => t === null)?.[1] ?? rest;
  return guards(
    all.filter((e): e is [Thunk, Thunk] => e[0] !== null),
    fallback,
  );
};

// the same for several variables assigned in one if: each arm gives all their values
export const guardsAll = (arms: Array<[test: Thunk, values: () => unknown[]]>, otherwise: () => unknown[]): unknown[] => {
  const [first, ...rest] = arms;
  if (!first) return otherwise();
  return condAll(first[0](), first[1], () => guardsAll(rest, otherwise));
};

const ESCAPES: Record<string, string> = { "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" };
export const attrText = (attrs: Record<string, string>): string =>
  Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${v.replace(/[&"<>]/g, (c) => ESCAPES[c]!)}"`)
    .join("");

type Push = (s: string) => void;

// A statement `if` / else-if / else whose arms write to a stream (Vue's SSR render), as blocks
// around what each arm writes. Tests run in order and stop at the first true one, like JS. Vue
// writes an `<!--v-if-->` else when there is no v-else: `placeholder` leaves it out of a block.
export const pushIf = (push: Push, arms: Array<[test: () => unknown, body: () => void]>, otherwise: (() => void) | null, placeholder = false): void => {
  let open = false;
  for (const [test, body] of arms) {
    const c = condOf(test());
    if (c.t === "const") {
      if (!c.v) continue;
      if (!open) return body();
      push("<tddr-else>");
      body();
      push("</tddr-else>");
      return;
    }
    const tag = open ? "tddr-else-if" : "tddr-if";
    push(`<${tag}${attrText({ test: C.condText(c) })}>`);
    body();
    push(`</${tag}>`);
    open = true;
  }
  if (!otherwise) return;
  if (!open) return otherwise();
  if (placeholder) return;
  push("<tddr-else>");
  otherwise();
  push("</tddr-else>");
};

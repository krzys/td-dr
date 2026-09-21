import type { Cond } from "../ir/types.ts";
import { isProblem } from "./cond.ts";
import { CHAIN_ATTRS, isIdent, readCond, readsOwnLoop, type HintProblem } from "./hints.ts";
import { isPath } from "./tokens.ts";

// Template block syntax (docs/templates.md): an if / else-if / else chain over sibling elements (hint attributes or
// <tddr-if test> and friends), and <tddr-each of as>. Read the same way by sanitize (which turns
// it into markers) and by preview (which decides it), over either DOM.

// What the template rule regroups the markers into, after the cascade: a transparent group (a
// list, or a branch of several nodes) and a chain whose groups are its branches, `WHEN_ATTR`
// holding the condition (none on the else).
export const GROUP_TAG = "tddr-group";
export const CHAIN_TAG = "tddr-chain";
export const WHEN_ATTR = "data-tddr-when";

export const TDDR_TAGS = ["tddr-if", "tddr-else-if", "tddr-else", "tddr-each"] as const;
// prints-zero: what the adapters write for a data need of `x && …` (see adapters/template/blocks.ts)
const OWN_ATTRS: Record<string, readonly string[]> = { "tddr-if": ["test", "prints-zero"], "tddr-else-if": ["test"], "tddr-else": [], "tddr-each": ["of", "as"] };

export type Access<N> = {
  tag: (n: N) => string | undefined; // lowercase; undefined for anything but an element
  attrs: (n: N) => Readonly<Record<string, string>>;
  blank: (n: N) => boolean; // whitespace-only text
};

// `tddr`: a transparent element, whose children take its place.
export type Member<N> = { node: N; when?: Cond; tddr: boolean };
export type Piece<N> =
  | { kind: "node"; node: N } // untouched; a lone data-email-if is read where it is lowered
  | { kind: "chain"; members: Member<N>[]; between: N[] } // between: the whitespace that goes
  | { kind: "each"; node: N; path: string; as?: string }
  | { kind: "plain"; node: N; tddr: boolean }; // its construct is invalid: shown once, as is

const ELSE_HINT = "An else (data-email-else, data-email-else-if, <tddr-else>, <tddr-else-if>) goes right after a data-email-if / -unless / -else-if element or a <tddr-if> / <tddr-else-if>; only whitespace may sit between them.";

const role = <N>(n: N, a: Access<N>): "head" | "elseif" | "else" | "each" | undefined => {
  const tag = a.tag(n);
  if (tag === undefined) return undefined;
  if (tag === "tddr-if") return "head";
  if (tag === "tddr-else-if") return "elseif";
  if (tag === "tddr-else") return "else";
  if (tag === "tddr-each") return "each";
  const at = a.attrs(n);
  if (at["data-email-else-if"] !== undefined) return "elseif";
  if (at["data-email-else"] !== undefined) return "else";
  if (at["data-email-if"] !== undefined || at["data-email-unless"] !== undefined) return "head";
  return undefined;
};

const describe = <N>(n: N, a: Access<N>): string => {
  const tag = a.tag(n)!;
  if (tag.startsWith("tddr-")) return `<${tag}>`;
  const attr = CHAIN_ATTRS.find((x) => a.attrs(n)[x] !== undefined)!;
  return attr === "data-email-else" ? attr : `${attr}="${a.attrs(n)[attr]}"`;
};

// The condition a member stands for, or what is wrong with it.
const condOf = <N>(n: N, a: Access<N>, r: "head" | "elseif"): Cond | HintProblem => {
  const tag = a.tag(n)!;
  const at = a.attrs(n);
  if (tag.startsWith("tddr-")) {
    const test = at["test"];
    if (test === undefined) return { message: `<${tag}> without a test`, hint: `Write the condition in test: <${tag} test="order.paid">.` };
    return readCond(test, `<${tag}> test`);
  }
  if (r === "elseif") {
    if (at["data-email-if"] !== undefined || at["data-email-unless"] !== undefined) return { message: `${describe(n, a)} also has data-email-if / -unless`, hint: "A branch has one condition: combine them with && in data-email-else-if." };
    const c = readCond(at["data-email-else-if"]!, "data-email-else-if");
    return isProblem(c) ? c : (readsOwnLoop(at, c, "data-email-else-if") ?? c);
  }
  const conds: Cond[] = [];
  for (const name of ["if", "unless"] as const) {
    const attr = `data-email-${name}`;
    if (at[attr] === undefined) continue;
    const c = readCond(at[attr], attr);
    if (isProblem(c)) return c;
    const own = readsOwnLoop(at, c, attr);
    if (own) return own;
    conds.push(name === "if" ? c : { op: "not", cond: c });
  }
  return conds.length === 1 ? conds[0]! : { op: "and", conds };
};

// What a transparent element carries that it can't: it has no box and no attributes of its own.
const extraAttrs = <N>(n: N, a: Access<N>): HintProblem | undefined => {
  const tag = a.tag(n)!;
  const own = OWN_ATTRS[tag];
  if (!own) return undefined;
  const extra = Object.keys(a.attrs(n)).filter((k) => !own.includes(k));
  if (extra.length === 0) return undefined;
  return { message: `<${tag}> ${extra.join(", ")} ${extra.length > 1 ? "are" : "is"} dropped`, hint: `<${tag}> has no box of its own; its children take its place. Put classes, styles and other attributes on them.` };
};

// Splits a list of siblings into chains, lists and everything else. `report` hears of every
// problem, with the node to point at; whatever is invalid is shown once, without the construct.
export const scanChains = <N>(kids: readonly N[], a: Access<N>, report: (n: N, p: HintProblem) => void): Piece<N>[] => {
  const out: Piece<N>[] = [];
  // so a stray else can say whether it is far from its if or has none
  let seenHead = false;
  for (let i = 0; i < kids.length; i++) {
    const n = kids[i]!;
    const r = role(n, a);
    const extra = r && extraAttrs(n, a);
    if (extra) report(n, extra);
    if (r === undefined) {
      out.push({ kind: "node", node: n });
      continue;
    }
    if (r === "each") {
      const at = a.attrs(n);
      const of = at["of"]?.trim();
      const as = at["as"]?.trim();
      const problem: HintProblem | undefined =
        of === undefined ? { message: "<tddr-each> without of", hint: 'Name the list in of: <tddr-each of="order.items" as="line">.' }
        : !isPath(of) ? { message: `<tddr-each> of="${of}" is not a data path`, hint: "Use a dotted name such as order.items." }
        : as !== undefined && !isIdent(as) ? { message: `<tddr-each> as="${as}" is not a name`, hint: "Use a plain identifier such as line or item." }
        : undefined;
      if (problem) {
        report(n, problem);
        out.push({ kind: "plain", node: n, tddr: true });
      } else out.push({ kind: "each", node: n, path: of!, ...(as !== undefined ? { as } : {}) });
      continue;
    }
    if (r !== "head") {
      report(n, {
        message: seenHead ? `${describe(n, a)} isn't right after the branch it belongs to` : `${describe(n, a)} without a data-email-if or <tddr-if> before it`,
        hint: ELSE_HINT,
      });
      out.push({ kind: "plain", node: n, tddr: a.tag(n)!.startsWith("tddr-") });
      continue;
    }
    // a head and the else-if / else elements right after it
    const members: N[] = [n];
    const between: N[] = [];
    let j = i + 1;
    for (let k = j; k < kids.length; k++) {
      const next = kids[k]!;
      if (a.blank(next)) continue;
      const nr = role(next, a);
      if (nr !== "elseif" && nr !== "else") break;
      between.push(...kids.slice(j, k));
      members.push(next);
      j = k + 1;
      if (nr === "else") break;
    }
    i = j - 1;
    seenHead = true;
    const isTddr = (m: N): boolean => a.tag(m)!.startsWith("tddr-");
    // a lone data-email-if is no chain: the template rule reads it as before
    if (members.length === 1 && !isTddr(n)) {
      out.push({ kind: "node", node: n });
      continue;
    }
    const read = members.map((m, k) => {
      const mr = k === 0 ? "head" : role(m, a);
      if (mr === "else") {
        const v = isTddr(m) ? undefined : a.attrs(m)["data-email-else"];
        if (v || a.attrs(m)["data-email-if"] !== undefined || a.attrs(m)["data-email-unless"] !== undefined) {
          return { message: `${describe(m, a)}${v ? `="${v}"` : ""} takes no condition`, hint: "data-email-else is valueless and shows when nothing before it does; for a condition use data-email-else-if." };
        }
        return undefined;
      }
      return condOf(m, a, mr as "head" | "elseif");
    });
    const bad = read.findIndex((c) => c !== undefined && "message" in c);
    if (bad >= 0) {
      report(members[bad]!, read[bad] as HintProblem);
      for (const m of members) out.push({ kind: "plain", node: m, tddr: isTddr(m) });
      continue;
    }
    out.push({ kind: "chain", members: members.map((m, k) => ({ node: m, tddr: isTddr(m), ...(read[k] ? { when: read[k] as Cond } : {}) })), between });
  }
  return out;
};

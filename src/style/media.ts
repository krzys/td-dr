// @media preludes, parsed once and evaluated against an Env (docs/head-styles.md).
import type { Env } from "./types.ts";
import { INITIAL_FONT_SIZE } from "./units.ts";

// Width is an inclusive integer px interval: viewports are whole pixels.
export type MediaQuery = {
  not: boolean;
  typeOk: boolean; // all / screen
  lo: number;
  hi: number;
  width: boolean; // some width feature was written
  scheme?: "dark" | "light";
  // what isn't evaluated; such a query never matches
  unsupported?: string;
};

const KEYWORDS = new Set(["and", "or", "not", "only"]);
const LEN = /^(-?(?:\d+\.?\d*|\.\d+))(px|em|rem)?$/;
const FLIP: Record<string, string> = { "<": ">", "<=": ">=", ">": "<", ">=": "<=", "=": "=" };

const px = (s: string): number | undefined => {
  const m = LEN.exec(s.trim());
  if (!m) return undefined;
  const n = Number(m[1]);
  if (m[2] === undefined) return n === 0 ? 0 : undefined;
  // em and rem here are the initial font-size, whatever the root says (Media Queries 4 §1.3)
  return m[2] === "px" ? n : n * INITIAL_FONT_SIZE;
};

// Top level words and (…) groups.
const tokens = (q: string): string[] | undefined => {
  const out: string[] = [];
  let i = 0;
  while (i < q.length) {
    if (/\s/.test(q[i]!)) i++;
    else if (q[i] === "(") {
      let depth = 0;
      let j = i;
      for (; j < q.length; j++) {
        if (q[j] === "(") depth++;
        else if (q[j] === ")" && --depth === 0) break;
      }
      if (depth !== 0) return undefined;
      out.push(q.slice(i, j + 1));
      i = j + 1;
    } else {
      const word = /^[^\s(]+/.exec(q.slice(i))![0];
      out.push(word);
      i += word.length;
    }
  }
  return out;
};

type Bounds = { lo: number; hi: number };

// `width <op> v` as bounds on whole px viewports
const bound = (op: string, v: number): Bounds => {
  switch (op) {
    case "<=": return { lo: 0, hi: Math.floor(v) };
    case "<": return { lo: 0, hi: Math.ceil(v) - 1 };
    case ">=": return { lo: Math.ceil(v), hi: Infinity };
    case ">": return { lo: Math.floor(v) + 1, hi: Infinity };
    default: return Number.isInteger(v) ? { lo: v, hi: v } : { lo: 1, hi: 0 };
  }
};

const RANGE = /^(?:(\S+?)\s*(<=|>=|<|>|=)\s*)?width(?:\s*(<=|>=|<|>|=)\s*(\S+))?$/;

// What one (…) group says: bounds, a scheme, or undefined when it isn't ours.
const feature = (inner: string): { bounds?: Bounds; scheme?: "dark" | "light" } | undefined => {
  const colon = /^([a-z-]+)\s*:\s*(.+)$/.exec(inner);
  if (colon) {
    const name = colon[1]!;
    const value = colon[2]!.trim();
    if (name === "min-width" || name === "max-width") {
      const v = px(value);
      return v === undefined ? undefined : { bounds: bound(name === "min-width" ? ">=" : "<=", v) };
    }
    if (name === "prefers-color-scheme") return value === "dark" || value === "light" ? { scheme: value } : undefined;
    return undefined;
  }
  const m = RANGE.exec(inner);
  if (!m || (m[1] === undefined && m[3] === undefined)) return undefined;
  const [, left, op1, op2, right] = m;
  let out: Bounds = { lo: 0, hi: Infinity };
  const apply = (op: string, text: string): boolean => {
    const v = px(text);
    if (v === undefined) return false;
    const b = bound(op, v);
    out = { lo: Math.max(out.lo, b.lo), hi: Math.min(out.hi, b.hi) };
    return true;
  };
  if (left !== undefined && !apply(FLIP[op1!]!, left)) return undefined;
  if (right !== undefined && !apply(op2!, right)) return undefined;
  // (a < width > b) is not a range
  if (left !== undefined && right !== undefined && op1![0] !== op2![0]) return undefined;
  return { bounds: out };
};

const parseQuery = (text: string): MediaQuery => {
  const written = text.trim();
  const q: MediaQuery = { not: false, typeOk: true, lo: 0, hi: Infinity, width: false };
  const bad = (what: string): MediaQuery => ({ ...q, unsupported: what });
  const t = tokens(written.toLowerCase());
  if (!t || t.length === 0 || t[t.length - 1] === "and") return bad(written || "(empty)");
  let i = 0;
  if (t[0] === "not") q.not = true;
  if (t[0] === "not" || t[0] === "only") i++;
  if (i >= t.length) return bad(written);
  if (!t[i]!.startsWith("(")) {
    const type = t[i]!;
    if (KEYWORDS.has(type)) return bad(written);
    q.typeOk = type === "all" || type === "screen";
    i++;
    if (i < t.length && t[i++] !== "and") return bad(written);
  }
  for (let want = true; i < t.length; i++, want = !want) {
    const tok = t[i]!;
    if (!want) {
      if (tok !== "and") return bad(written);
      continue;
    }
    if (!tok.startsWith("(")) return bad(written);
    const f = feature(tok.slice(1, -1).trim());
    if (!f) return bad(tok);
    if (f.bounds) {
      q.width = true;
      q.lo = Math.max(q.lo, f.bounds.lo);
      q.hi = Math.min(q.hi, f.bounds.hi);
    }
    if (f.scheme) {
      if (q.scheme && q.scheme !== f.scheme) return bad(tok);
      q.scheme = f.scheme;
    }
  }
  if (q.width && q.scheme) return bad(`(prefers-color-scheme: ${q.scheme}) with a width query`);
  return q;
};

const splitComma = (s: string): string[] => {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") depth--;
    else if (s[i] === "," && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out;
};

// an empty prelude is valid CSS and means all
export const parseMedia = (prelude: string): MediaQuery[] => splitComma(prelude.trim() === "" ? "all" : prelude).map(parseQuery);

export const matchesQuery = (q: MediaQuery, env: Env): boolean => {
  if (q.unsupported !== undefined) return false;
  const hit =
    q.typeOk &&
    env.viewport >= q.lo &&
    env.viewport <= q.hi &&
    (q.scheme === undefined || q.scheme === (env.dark ? "dark" : "light"));
  return q.not ? !hit : hit;
};

export const matchesList = (list: readonly MediaQuery[], env: Env): boolean => list.some((q) => matchesQuery(q, env));

// Mentions dark mode: `dark`, or `not … light`.
export const wantsDark = (q: MediaQuery): boolean =>
  q.unsupported === undefined && q.typeOk && q.scheme !== undefined && (q.scheme === "dark") !== q.not;

// Viewport widths where the query's width part starts or stops holding.
const edgesOf = (q: MediaQuery): number[] => [q.lo, q.hi + 1].filter((e) => e > 0 && Number.isFinite(e));

// Integer ranges below the topmost edge; neighbours that every width query answers alike are merged.
// `split` is an extra edge (the design width) that always ends a range, even where no query changes.
export const rangesOf = (queries: readonly MediaQuery[], split?: number): { min: number; max: number }[] => {
  const widths = queries.filter((q) => q.unsupported === undefined && q.typeOk && q.width);
  const edges = [...new Set([...widths.flatMap(edgesOf), ...(split !== undefined && split > 0 ? [split] : [])])].sort((a, b) => a - b);
  if (edges.length === 0) return [];
  const starts = [0, ...edges];
  const out: { min: number; max: number; key: string }[] = [];
  for (let i = 0; i < starts.length - 1; i++) {
    const min = starts[i]!;
    const key = widths.map((q) => (min >= q.lo && min <= q.hi ? 1 : 0)).join("") + (split !== undefined && min >= split ? "+" : "");
    const last = out[out.length - 1];
    if (last && last.key === key) last.max = starts[i + 1]! - 1;
    else out.push({ min, max: starts[i + 1]! - 1, key });
  }
  return out.reverse().map(({ min, max }) => ({ min, max }));
};

// Some env could satisfy it: `not print` and `not (feature)` can, `print` and `not all` can't.
export const canMatch = (q: MediaQuery): boolean =>
  q.unsupported === undefined && (q.not ? !q.typeOk || q.width || q.scheme !== undefined : q.typeOk);

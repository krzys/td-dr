// Length handling for computeValues. Everything ends up in px.
import { evalMath, type Val } from "./calc.ts";

// The initial font-size: medium. What rem means when the root sets no font-size, what the
// root's own font-size is relative to, and what em/rem mean in media queries.
export const INITIAL_FONT_SIZE = 16;

// em is the element's own font-size (the parent's, inside font-size), rem the root element's.
export type FontSizes = { readonly em: number; readonly rem: number };

const KEYWORDS: Readonly<Record<string, number>> = {
  "xx-small": 9,
  "x-small": 10,
  small: 13,
  medium: 16,
  large: 18,
  "x-large": 24,
  "xx-large": 32,
  "xxx-large": 48,
};

const TO_PX: Readonly<Record<string, number>> = { px: 1, pt: 4 / 3, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, q: 96 / 101.6 };
const unitPx = (u: string, f: FontSizes): number | undefined => (u === "em" ? f.em : u === "rem" ? f.rem : TO_PX[u]);
const UNSUPPORTED = new Set(["vw", "vh", "vmin", "vmax", "vi", "vb", "svw", "svh", "lvw", "lvh", "dvw", "dvh", "svmin", "svmax", "lvmin", "lvmax", "dvmin", "dvmax", "ch", "ex", "cap", "ic", "lh", "rlh"]);

// Zero is always "0", never "0px".
export const formatPx = (n: number): string => {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? "0" : `${r}px`;
};

export const parsePx = (v: string | undefined): number | undefined => {
  v = designOf(v);
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+))(?:px)?$/i.exec(v?.trim() ?? "");
  return m ? Number(m[1]) : undefined;
};

// Whitespace split at the top level; "/" becomes its own token. Parens and quotes stay whole.
export const splitTokens = (value: string): string[] => {
  const out: string[] = [];
  let cur = "";
  let depth = 0;
  let quote = "";
  const flush = () => {
    if (cur) out.push(cur);
    cur = "";
  };
  for (const ch of value) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === "(") {
      depth++;
      cur += ch;
    } else if (ch === ")") {
      depth--;
      cur += ch;
    } else if (depth === 0 && /\s/.test(ch)) flush();
    else if (depth === 0 && ch === "/") {
      flush();
      out.push("/");
    } else cur += ch;
  }
  flush();
  return out;
};

// The email is laid out for a desktop viewport `width` px wide. Its height is unknown, so
// vmin and vmax read the width too. Heights (vh, vb) have no meaning and stay unsupported.
const VIEWPORT = /(?<![\w#.-])([+-]?(?:\d+\.?\d*|\.\d+))([sld]?v(?:w|min|max))(?![\w.])/gi;

// The cascade tags a text value that stays vw on phones (docs/support.md#design-width); toPx drops the tag and
// leaves the value as written instead of calling it unsupported.
export const LIVE = "\u0001";

// A live font-size carries the px it has at the design width too (LIVE px LIVE authored), so
// em, % and line-height math keep working; the computed style shows only the authored part.
export const liveValue = (prop: string, authored: string, design: string): string =>
  prop === "font-size" ? `${LIVE}${design.trim()}${LIVE}${authored.trim()}` : LIVE + authored.trim();

const split = (v: string): [string, string] | undefined => {
  if (!v.startsWith(LIVE)) return undefined;
  const at = v.indexOf(LIVE, 1);
  return at < 0 ? undefined : [v.slice(1, at), v.slice(at + 1)];
};
const designOf = (v: string | undefined): string | undefined => (v === undefined ? v : (split(v)?.[0] ?? v));

export const isLive = (v: string | undefined): boolean => v !== undefined && split(v) !== undefined;
export const publicValue = (v: string): string => split(v)?.[1] ?? (v.startsWith(LIVE) ? v.slice(1) : v);

// em and % font-sizes under a live parent stay live: .6em of 5vw is calc(0.6 * 5vw)
export const relativeLive = (value: string, parent: string, designPx: string): string | undefined => {
  const v = value.trim().toLowerCase();
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+))(em|%)$/.exec(v);
  const auth = split(parent)?.[1];
  // larger / smaller are the 1.2 step browsers use
  const rel = v === "larger" ? 1.2 : v === "smaller" ? 1 / 1.2 : undefined;
  if ((!m && rel === undefined) || auth === undefined) return undefined;
  const k = Math.round((m ? Number(m[1]) / (m[2] === "%" ? 100 : 1) : rel!) * 1e4) / 1e4;
  return `${LIVE}${designPx}${LIVE}calc(${k} * ${auth})`;
};

export const hasViewport = (value: string): boolean => {
  let found = false;
  mapUnprotected(value, (part) => ((found ||= new RegExp(VIEWPORT.source, "i").test(part)), part));
  return found;
};

// Rewrites vw/vmin/vmax lengths to px; `seen` hears each distinct one with its result.
export const resolveViewport = (value: string, width: number, seen: (token: string, px: string) => void): string =>
  mapUnprotected(value, (part) =>
    part.replace(VIEWPORT, (whole, num: string) => {
      const px = formatPx((Number(num) * width) / 100);
      seen(whole.toLowerCase(), px);
      return px;
    }),
  );

const MATH_FN = /(?<![\w-])(?:-\w+-)?(?:calc|min|max|clamp)\(/i;
// strings and url()s are never lengths or colours; a quoted url may hold parens
export const PROTECTED = /("[^"]*"|'[^']*'|url\(\s*(?:"[^"]*"|'[^']*'|[^)"']*)\s*\))/i;
export const mapUnprotected = (value: string, f: (part: string) => string): string =>
  value
    .split(PROTECTED)
    .map((part, i) => (i % 2 ? part : f(part)))
    .join("");
const LENGTH = /(?<![\w#.-])([+-]?(?:\d+\.?\d*|\.\d+))([a-z]+)(?![\w.])/gi;

const round = (n: number) => Math.round(n * 1e4) / 1e4;

// calc(P% ± Npx) is the one mixed form the flex rule reads (docs/support.md#flex-rows)
const formatVal = (v: Val): string => {
  if (v.d === "num") return String(round(v.n));
  const pct = round(v.pct);
  const px = Math.round(v.px * 100) / 100;
  if (pct === 0) return formatPx(px);
  if (px === 0) return `${pct}%`;
  return `calc(${pct}% ${px < 0 ? "-" : "+"} ${formatPx(Math.abs(px))})`;
};

const MATH_START = /(?<![\w-])(?:-\w+-)?(?:calc|min|max|clamp)\(/gi;

// Folds every static calc()/min()/max()/clamp() in `value` to one number, length, % or
// calc(P% ± Npx). One that can't fold (calc(100% - 1vw)) stays, with whatever inside it did fold.
export const reduceMath = (value: string, f: FontSizes): string => mapUnprotected(value, (part) => reduceIn(part, f));

const reduceIn = (value: string, f: FontSizes): string => {
  let out = "";
  let at = 0;
  for (;;) {
    MATH_START.lastIndex = at;
    const m = MATH_START.exec(value);
    if (!m) return out + value.slice(at);
    let depth = 0;
    let end = m.index + m[0].length - 1;
    for (; end < value.length; end++) {
      if (value[end] === "(") depth++;
      else if (value[end] === ")" && --depth === 0) break;
    }
    if (end >= value.length) return out + value.slice(at);
    const whole = value.slice(m.index, end + 1);
    const v = evalMath(whole, (u) => unitPx(u, f));
    out += value.slice(at, m.index) + (v ? formatVal(v) : `${m[0]}${reduceIn(whole.slice(m[0].length, -1), f)})`);
    at = end + 1;
  }
};

// Rewrites every length in `value` to px. null means something we can't resolve
// (vw, calc(100% - 1vw)...).
export const toPx = (input: string, f: FontSizes): string | null => {
  if (input.startsWith(LIVE)) return publicValue(input).trim();
  let bad = false;
  const out = mapUnprotected(reduceMath(input, f), (part) => {
    if (MATH_FN.test(part)) bad = true;
    return part.replace(LENGTH, (whole, num: string, unit: string) => {
      const u = unit.toLowerCase();
      if (UNSUPPORTED.has(u)) {
        bad = true;
        return whole;
      }
      const n = Number(num);
      const k = unitPx(u, f);
      return k === undefined ? whole : formatPx(n * k); // s, deg, fr... aren't lengths
    });
  });
  return bad ? null : out;
};

// null = unsupported. `parent.em` is the parent's computed font-size in px.
export const resolveFontSize = (value: string, parent: FontSizes): string | null => {
  const live = split(value);
  if (live) {
    const px = resolveFontSize(live[0], parent);
    return px === null ? null : `${LIVE}${px}${LIVE}${live[1]}`;
  }
  if (value.startsWith(LIVE)) return value.slice(1).trim();
  const parentSize = parent.em;
  const v = reduceMath(value.trim(), parent).toLowerCase();
  const kw = KEYWORDS[v];
  if (kw !== undefined) return formatPx(kw);
  if (v === "larger") return formatPx(parentSize * 1.2);
  if (v === "smaller") return formatPx(parentSize / 1.2);
  const pct = /^([+-]?(?:\d+\.?\d*|\.\d+))%$/.exec(v);
  if (pct) return formatPx((Number(pct[1]) * parentSize) / 100);
  const px = toPx(v, parent);
  // a bare number (calc(10)) isn't a font-size
  return px !== null && (px === "0" || /^[+-]?[\d.]+px$/.test(px)) ? px : null;
};

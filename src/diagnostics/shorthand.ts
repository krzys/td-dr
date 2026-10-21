import { locKey } from "../loc.ts";
import type { Diagnostic } from "./diagnostic.ts";

// One diagnostic per declaration the author wrote: the stages read longhands, so `padding: 5% 8%`
// reaches them as four sides and `-webkit-mask` next to `mask` as two (docs/support.md#diagnostic-codes).

const SIDES = ["top", "right", "bottom", "left"] as const;
// a value: words, or a function call with its own spaces and commas
const VALUE = String.raw`(?:[^\s;(),]+|\([^()]*\))+`;
const SIDED = new RegExp(String.raw`(?<![\w-])([a-z]+(?:-[a-z]+)*?)-(top|right|bottom|left)(-[a-z]+)?: (${VALUE})`, "g");
// the shorthands that take one value per side, top right bottom left
const BOX = new Set(["padding", "margin", "scroll-margin", "scroll-padding", "border-width", "border-style", "border-color"]);

type Side = { family: string; side: string; value: string; start: number; end: number };
const sidesIn = (message: string): Side[] =>
  [...message.matchAll(SIDED)].map((m) => ({ family: m[1]! + (m[3] ?? ""), side: m[2]!, value: m[4]!, start: m.index, end: m.index + m[0].length }));

// `padding: 5% 8%` from the four sides, or undefined when the shorthand can't say it
const shorthand = (family: string, values: readonly string[]): string | undefined => {
  const [t, r, b, l] = values as [string, string, string, string];
  if (t === r && r === b && b === l) return `${family}: ${t}`;
  if (!BOX.has(family)) return undefined;
  if (t === b && r === l) return `${family}: ${t} ${r}`;
  if (r === l) return `${family}: ${t} ${r} ${b}`;
  return `${family}: ${t} ${r} ${b} ${l}`;
};

// "border-top-color: x; border-right-color: x; …" inside one message
const joinWithin = (message: string): string => {
  const found = sidesIn(message);
  for (let i = 0; i + 3 < found.length; i++) {
    const run = found.slice(i, i + 4);
    const inOrder = run.every((s, k) => s.family === run[0]!.family && s.side === SIDES[k] && (k === 0 || message.slice(run[k - 1]!.end, s.start) === "; "));
    const short = inOrder ? shorthand(run[0]!.family, run.map((s) => s.value)) : undefined;
    if (short) return joinWithin(message.slice(0, run[0]!.start) + short + message.slice(run[3]!.end));
  }
  return message;
};

const placeOf = (d: Diagnostic): string => JSON.stringify([d.code, d.severity, d.loc ? locKey(d.loc) : ""]);

// the same message about each side of one element, said once
const joinAcross = (ds: readonly Diagnostic[]): Diagnostic[] => {
  const groups = new Map<string, { at: number; sides: Map<string, string> }[]>();
  const keys = ds.map((d, at) => {
    const found = d.loc ? sidesIn(d.message) : [];
    if (found.length !== 1) return undefined;
    const s = found[0]!;
    const key = JSON.stringify([placeOf(d), d.hint ?? null, s.family, d.message.slice(0, s.start), d.message.slice(s.end)]);
    const list = groups.get(key) ?? [];
    groups.set(key, list);
    let g = list.find((x) => !x.sides.has(s.side));
    if (!g) list.push((g = { at, sides: new Map() }));
    g.sides.set(s.side, s.value);
    return { key, g, s };
  });
  const out: Diagnostic[] = [];
  ds.forEach((d, at) => {
    const k = keys[at];
    if (!k || k.g.sides.size < 4) return void out.push(d);
    if (k.g.at !== at) return;
    const short = shorthand(k.s.family, SIDES.map((side) => k.g.sides.get(side)!));
    if (!short) return void out.push(...ds.filter((_, i) => keys[i]?.g === k.g));
    out.push({ ...d, message: d.message.slice(0, k.s.start) + short + d.message.slice(k.s.end) });
  });
  return out;
};

const PREFIX = /(?<![\w-])-(?:webkit|moz|ms|o)-(?=[a-z])/g;

export const oncePerShorthand = (ds: readonly Diagnostic[]): Diagnostic[] => {
  const said = new Set(ds.map((d) => JSON.stringify([placeOf(d), d.message])));
  // `-webkit-mask` said where `mask` is said the same way at the same place
  const unprefixed = ds.filter((d) => {
    const plain = d.message.replace(PREFIX, "");
    return plain === d.message || !said.has(JSON.stringify([placeOf(d), plain]));
  });
  return joinAcross(unprefixed.map((d) => ({ ...d, message: joinWithin(d.message) })));
};

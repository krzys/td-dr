import type { Border, Box, Sides, Style } from "../ir/index.ts";
import { isWholeField } from "../template/tokens.ts";

// Ordered pairs, so output is stable and golden files don't churn. undefined = skip.
export type Attrs = ReadonlyArray<readonly [string, string | number | undefined]>;
export type Decl = readonly [string, string | undefined];
export type Decls = ReadonlyArray<Decl>;

export const escAttr = (v: string): string =>
  v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export const attrString = (attrs: Attrs): string =>
  attrs.flatMap(([k, v]) => (v === undefined || v === "" ? [] : [` ${k}="${escAttr(String(v))}"`])).join("");

// Double quotes would turn into &quot; inside style="", which some clients mangle.
export const styleString = (decls: Decls): string =>
  decls.flatMap(([k, v]) => (v === undefined || v === "" ? [] : [`${k}:${v.replace(/"/g, "'")}`])).join(";") +
  (decls.some(([, v]) => v) ? ";" : "");

export const radiusValue = (b: Box): string | undefined =>
  b.radii ? b.radii.map((r) => `${r}px`).join(" ") : b.radius ? `${b.radius}px` : undefined;

const hex2 = (n: number): string => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");

// bgcolor is parsed the legacy way, so only give it #rrggbb or a plain colour name. A placeholder
// goes as is: the ESP fills in the colour (docs/templates.md#colours-from-data).
export const legacyColor = (c: string | undefined): string | undefined => {
  if (!c) return undefined;
  if (isWholeField(c)) return c.trim();
  const v = c.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${[...v.slice(1)].map((d) => d + d).join("")}`;
  if (/^[a-z]+$/.test(v) && v !== "transparent" && v !== "currentcolor") return v;
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[,/]\s*(1|1\.0+|100%)\s*)?\)$/.exec(v);
  return rgb ? `#${hex2(+rgb[1]!)}${hex2(+rgb[2]!)}${hex2(+rgb[3]!)}` : undefined;
};

// What clients that paint CSS backgrounds get; Outlook uses bgcolor, plus VML for a url (mso.ts).
export const imageDecls = (b: Box): Array<[string, string | undefined]> => {
  const i = b.backgroundImage;
  return i
    ? [["background-image", i.css], ["background-size", i.size], ["background-position", i.position], ["background-repeat", i.repeat]]
    : [];
};

export const fromStyle = (s: Style): Array<[string, string]> => Object.entries(s);

export const paddingValue = (p: Sides): string | undefined => {
  if (!p.top && !p.right && !p.bottom && !p.left) return undefined;
  const px = (n: number) => (n === 0 ? "0" : `${n}px`);
  if (p.top === p.bottom && p.left === p.right) {
    return p.top === p.left ? px(p.top) : `${px(p.top)} ${px(p.right)}`;
  }
  return `${px(p.top)} ${px(p.right)} ${px(p.bottom)} ${px(p.left)}`;
};

const SIDES = ["top", "right", "bottom", "left"] as const;

export const borderDecls = (b: Border | undefined): Array<[string, string]> =>
  SIDES.flatMap((side) => {
    const s = b?.[side];
    return s ? [[`border-${side}`, `${s.width}px ${s.style} ${s.color}`] as [string, string]] : [];
  });

// The preheader's hide (docs/support.md#preheader), for a node that is hidden on some screens only.
export const HIDE_DECLS: ReadonlyArray<readonly [string, string]> = [["display", "none"], ["max-height", "0"], ["overflow", "hidden"], ["mso-hide", "all"]];

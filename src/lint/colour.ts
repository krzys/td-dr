import { backdropOf, flatten, parseColor, type RGB } from "../style/alpha.ts";

const channel = (v: number): number => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

// WCAG relative luminance
export const luminance = ([r, g, b]: RGB): number => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

// unrounded: 4.499 must fail 4.5
export const contrast = (a: RGB, b: RGB): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

export const hex = ([r, g, b]: RGB): string => `#${[r, g, b].map((n) => Math.round(n).toString(16).padStart(2, "0")).join("")}`;

// What sits behind an element's content, as far as the source tells.
// image: a background-image (photo or gradient); `fallback` is the solid colour behind it, if any.
export type Paint =
  | { kind: "solid"; rgb: RGB; authored: boolean }
  | { kind: "image"; fallback: RGB | undefined }
  | { kind: "unknown" };

// The shell paints nothing unless the root has a background, so clients show white.
export const WHITE: Paint = { kind: "solid", rgb: [255, 255, 255], authored: false };

// Author tables still use the bgcolor and background attributes.
export const paintOf = (el: { style: Readonly<Record<string, string>>; attrs: Readonly<Record<string, string>> }, parent: Paint): Paint => {
  const style = {
    ...(el.attrs["bgcolor"] ? { "background-color": el.attrs["bgcolor"] } : {}),
    ...(el.attrs["background"] ? { "background-image": `url(${el.attrs["background"]})` } : {}),
    ...el.style,
  };
  const behind = parent.kind === "solid" ? parent.rgb : undefined;
  const bg = style["background-color"];
  const image = style["background-image"];
  if (image && image !== "none") {
    const p = bg ? parseColor(behind ? flatten(bg, behind) : bg) : undefined;
    return { kind: "image", fallback: p && p[3] >= 1 ? [p[0], p[1], p[2]] : undefined };
  }
  if (!bg || bg === "transparent") return parent;
  const rgb = backdropOf(style, behind);
  if (rgb) return { kind: "solid", rgb, authored: true };
  // fully transparent leaves the parent's paint alone
  const p = parseColor(bg);
  return p && p[3] <= 0 ? parent : { kind: "unknown" };
};

// The solid colour a client would show behind text, when we know it.
export const solidOf = (p: Paint): RGB | undefined => (p.kind === "solid" ? p.rgb : p.kind === "image" ? p.fallback : undefined);

// A colour value as the opaque colour it shows over `over`; undefined when it can't be resolved.
export const rgbOf = (c: string | undefined, over: RGB): RGB | undefined => {
  if (!c) return undefined;
  const p = parseColor(flatten(c, over));
  return p && p[3] >= 1 ? [p[0], p[1], p[2]] : undefined;
};

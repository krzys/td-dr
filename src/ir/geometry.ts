// Box geometry and width rounding, shared by the passes and the emitter so both mean the same box.
import type { Box, Column } from "./types.ts";

export const borderX = (b: Box): number => (b.border?.left?.width ?? 0) + (b.border?.right?.width ?? 0);
export const borderY = (b: Box): number => (b.border?.top?.width ?? 0) + (b.border?.bottom?.width ?? 0);

// What lies between a border-box edge and the content box, across and down.
export const insetX = (b: Box): number => b.padding.left + b.padding.right + borderX(b);
export const insetY = (b: Box): number => b.padding.top + b.padding.bottom + borderY(b);

// The content-box width of a box `outer` px wide (border-box). Not clamped: a box narrower than its own
// padding comes out negative, and the caller decides what that means.
export const contentWidth = (b: Box, outer: number): number => outer - b.padding.left - b.padding.right - borderX(b);

// A column's transparent side padding: lifted margins and gap gutters, inside its resolved width.
export const gutterX = (c: Column): number => (c.padding ? c.padding.left + c.padding.right : 0);

// The most a column may take: its item's max-width, with its gutters riding on top.
export const columnCap = (c: Column): number | undefined => {
  const max = "box" in c.child ? c.child.box.maxWidth : undefined;
  return max === undefined ? undefined : max + gutterX(c);
};

// How wide a slot is on a narrow screen S, one narrower than every max-width around it: a*S - b px.
// a = 0 for a slot that doesn't follow the screen (a px width above it). The root's slot is the screen.
export type Fluid = { readonly a: number; readonly b: number };
export const SCREEN: Fluid = { a: 1, b: 0 };
// `share` of the slot, less `inset` px.
export const within = (f: Fluid, share: number, inset = 0): Fluid => ({ a: f.a * share, b: f.b * share + inset });
export const fixedSlot = (px: number): Fluid => ({ a: 0, b: -px });
// The screen on which the slot is `width` px wide; 0 for a slot that doesn't follow the screen.
export const screenAt = (f: Fluid, width: number): number => (f.a > 0 ? (width + f.b) / f.a : 0);

const EPS = 1e-6;

// Rounding. A % share keeps two decimals: the table reproduces the fractional pixels with it.
export const roundPct = (pct: number): number => Math.round(pct * 100) / 100;
// A ratio (0..1) as such a share.
export const ratioPct = (ratio: number): number => Math.round(ratio * 10000) / 100;
// Inline-block columns floor theirs instead: a line of them must never come to more than 100%.
export const floorPct = (pct: number): number => Math.floor(pct * 100 + EPS) / 100;
// Whole px (Outlook width attributes, column px), cut down; EPS keeps float noise like 199.9999999 a 200.
export const floorPx = (px: number): number => Math.floor(px + EPS);

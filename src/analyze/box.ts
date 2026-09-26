// Box of a container (or a pass-through block whose box gets lifted into its cell): its geometry
// (box-geometry.ts), its paint (box-paint.ts) and what survives of its clipping (box-clip.ts), and
// the declarations none of them carry, reported dropped.
import type { Ctx } from "../ctx.ts";
import type { Box, Node } from "../ir/index.ts";
import { INHERITED, INITIAL, get } from "../style/props.ts";
import type { StyledElement } from "../style/types.ts";
import { CLIPS, clipMode, hasRadius, lineClip, unclippedCorners } from "./box-clip.ts";
import { heightAsMin, marginOf, minHeightOf, outerSize, paddingOf, widthsOf, type Frame, type ImpliedSize } from "./box-geometry.ts";
import { backgroundOf, bordersOf, CORNERS, cornersOf } from "./box-paint.ts";
import { carries } from "./classify.ts";

// src/analyze/design-width.ts reads it under this name
export { isTransparent as transparentColour } from "./classify.ts";

const SIDES = ["top", "right", "bottom", "left"] as const;

// What buildBox turns into the Box, plus things lint or the flex parent already dealt with.
const CONSUMED: ReadonlySet<string> = new Set([
  "display", "box-sizing", "width", "max-width", "background-color", "min-height",
  "background-image", "background-size", "background-position", "background-repeat", // see NOT_CARRIED
  "position", "top", "right", "bottom", "left", // relative with zero offsets is a no-op
  "flex-grow", "flex-shrink", "flex-basis", "align-self", "order", // the flex parent reads these
  "flex-direction", "flex-wrap", "justify-content", "align-items", "align-content", "row-gap", "column-gap", // flex rule
  "justify-self", "justify-items", "grid-area", "grid-column", "grid-column-start", "grid-column-end", // grid rule
  "grid-row", "grid-row-start", "grid-row-end", "grid-template-columns", "grid-template-rows", "grid-auto-flow",
  ...SIDES.flatMap((s) => [
    `padding-${s}`, `margin-${s}`, `border-${s}-width`, `border-${s}-style`, `border-${s}-color`,
  ]),
  ...CORNERS.map((c) => `border-${c}-radius`),
]);

// A box that is not a cell (an <img>, a link) can't carry a background image or a height:
// reportDropped keeps naming those.
const NOT_CARRIED: ReadonlySet<string> = new Set(["background-image", "background-size", "background-position", "background-repeat", "min-height"]);

// Diagnostics come out in the order the parts are worked out.
export const buildBox = (el: StyledElement, ctx: Ctx, implied: ImpliedSize = {}): Box => {
  const padding = paddingOf(el, ctx);
  const { margin, align } = marginOf(el, ctx);
  const border = bordersOf(el, ctx);
  const paint = backgroundOf(el, ctx);
  const frame: Frame = { padding, border, borderBox: get(el.style, "box-sizing") === "border-box" };
  const minHeight = minHeightOf(el, ctx, frame, paint);
  const corners = cornersOf(el, ctx, outerSize(el, frame, implied));
  const clip = lineClip(el, ctx);
  const widths = widthsOf(el, ctx, frame);
  return {
    padding,
    margin,
    ...(Object.keys(border).length > 0 ? { border } : {}),
    ...(align ? { align } : {}),
    ...paint,
    ...(minHeight !== undefined ? { minHeight } : {}),
    ...corners,
    ...(clip ? { clip } : {}),
    ...widths,
  };
};

// A child's node with another box: rules rebuild the nodes their children gave them, never edit them.
export const withBox = (n: Node, box: Box): Node => ("box" in n ? ({ ...n, box } as Node) : n);

export const withoutWidth = (box: Box): Box => {
  const { width: _w, ...rest } = box;
  return rest;
};

// Nothing in it paints or takes room of its own, so with no content there is nothing left of it.
export const isBareBox = (b: Box): boolean =>
  !b.background && !b.backgroundImage && !b.minHeight && !b.radius && !b.clip && !(b.border && Object.keys(b.border).length > 0) &&
  b.padding.top === 0 && b.padding.right === 0 && b.padding.bottom === 0 && b.padding.left === 0;

// Longhands a shorthand like `background: #fff` expands to; resetting them is not a loss.
const RESETS: ReadonlySet<string> = new Set(["none", "0s", "0px", "auto", "repeat", "scroll", "0% 0%", "visible", "normal", "all", "ease", "0", "stretch", "100%", "padding-box", "border-box"]);
export const isReset = (prop: string, value: string): boolean =>
  /^(background-|border-image-|transition-|animation-|overflow)/.test(prop) && (RESETS.has(value) || value === "0s");

// Columns are emitted left to right, whatever the direction: browsers flow an rtl row from the right.
export const reportRtlRow = (el: StyledElement, ctx: Ctx, columns: number): void => {
  if (columns < 2 || get(el.style, "direction") !== "rtl") return;
  ctx.diagnostics.report("W001", {
    message: "An rtl flex or grid row comes out in source order, left to right",
    hint: "td;dr doesn't mirror rows: write the items in the order they should appear from the left, or stack them in a column.",
    loc: el.loc,
  });
};

export const reportDropped = (el: StyledElement, ctx: Ctx): void => {
  for (const [prop, value] of Object.entries(el.declared)) {
    if (INHERITED.has(prop) || prop.startsWith("--")) continue;
    if (CONSUMED.has(prop) && !(NOT_CARRIED.has(prop) && !carries(el))) continue;
    if (prop === "height" && heightAsMin(el) !== undefined) continue;
    if (value === INITIAL[prop] || isReset(prop, value)) continue;
    if (/^overflow/.test(prop) && CLIPS.test(value)) {
      const loose = clipMode(el) === "corners" ? unclippedCorners(el) : [];
      if (clipMode(el) === undefined || loose.length > 0) {
        const what = loose.length > 0 ? `, and a painted child sticks out past the rounded ${loose.join(", ")} corner` : hasRadius(el) ? ", and nothing is clipped to its rounded corners" : "";
        ctx.diagnostics.report("W001", { message: `${prop}: ${value} is dropped: content that sticks out of this box will show instead of being cut off${what}`, loc: el.loc });
      }
      continue;
    }
    ctx.diagnostics.report("W001", { message: `${prop}: ${value} is dropped`, loc: el.loc });
  }
};


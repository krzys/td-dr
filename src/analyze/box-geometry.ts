// Where a box sits and how big it is: padding, margins, min-height, width and max-width, all in
// the border-box px the IR carries.
import type { Ctx } from "../ctx.ts";
import { zeroSides, type Align, type Border, type Box, type Sides } from "../ir/index.ts";
import { get, LEGACY_ALIGN } from "../style/props.ts";
import type { StyledElement, StyledNode } from "../style/types.ts";
import { clipsOverflow } from "./box-clip.ts";
import { isPaintedNode, type Background } from "./box-paint.ts";
import { carries, isInlineLevel } from "./classify.ts";
import { parseLen } from "./length.ts";

const SIDES = ["top", "right", "bottom", "left"] as const;
type Side = (typeof SIDES)[number];

// What lies between the content and the outer edge, and whether CSS sizes already include it.
export type Frame = { padding: Sides; border: Border; borderBox: boolean };

const frameX = (f: Frame): number => f.padding.left + f.padding.right + (f.border.left?.width ?? 0) + (f.border.right?.width ?? 0);
const frameY = (f: Frame): number => f.padding.top + f.padding.bottom + (f.border.top?.width ?? 0) + (f.border.bottom?.width ?? 0);

// A px height only differs from a min-height when the content is taller: the browser spills it
// over what follows, a cell grows. Clipped boxes keep reporting it dropped, bar an <hr>
// (the UA clips it): nothing in it can stick out.
export const heightAsMin = (el: StyledElement): number | undefined => {
  const len = parseLen(el.style["height"] ?? "auto");
  return carries(el) && (!clipsOverflow(el) || el.tag === "hr") && len && "px" in len && len.px > 0 ? len.px : undefined;
};

// px or 0; percentages and odd units can't be carried (E006)
const pxOrZero = (el: StyledElement, ctx: Ctx, prop: string): number => {
  const v = el.style[prop];
  const len = parseLen(v);
  if (len && "px" in len) return len.px;
  ctx.diagnostics.report("E006", { message: `${prop}: ${v} is not supported, use px`, loc: el.loc });
  return 0;
};

export const paddingOf = (el: StyledElement, ctx: Ctx): Sides => {
  const padding = zeroSides();
  for (const s of SIDES) padding[s] = pxOrZero(el, ctx, `padding-${s}`);
  return padding;
};

// A negative margin that exactly cancels the parent's padding is a full-bleed band; the bleed pass lowers it.
export const bleedsParent = (el: StyledElement, side: Side, px: number): boolean => {
  const parent = el.parentStyle;
  const display = parent?.["display"];
  if (!parent || (display !== undefined && display !== "block" && display !== "flow-root")) return false;
  // inline-level elements are never lowered, and a % width makes the box shift instead of widen
  if (isInlineLevel(el)) return false;
  if ((side === "left" || side === "right") && (el.style["width"]?.endsWith("%") || el.style["max-width"]?.endsWith("%"))) return false;
  const pad = parseLen(parent[`padding-${side}`] ?? "0");
  return !!pad && "px" in pad && pad.px === -px;
};

const OVERLAP = "To overlap items (an avatar stack), use spacing between them, or a single pre-composed image. A negative margin only works as a full-bleed band that exactly cancels the parent's padding.";

export const negativeMarginHint = (side: Side, el?: StyledElement): string | undefined => {
  // say why bleedsParent refused, in the order it checks
  const display = el?.parentStyle?.["display"];
  if (display !== undefined && display !== "block" && display !== "flow-root") return "Negative margins on flex and grid items are never lowered: space the items with gap or padding, or for an overlap (an avatar stack) use a single pre-composed image.";
  if (el && isInlineLevel(el)) return "Only block-level children can bleed out of their parent's padding; inline items can't overlap in email.";
  const pad = parseLen(el?.parentStyle?.[`padding-${side}`] ?? "0");
  if (side === "top" || side === "bottom") {
    return pad && "px" in pad && pad.px > 0
      ? `A vertical bleed must equal the parent's padding-${side} (${pad.px}px) and sit on its ${side === "top" ? "first" : "last"} child.`
      : "A negative vertical margin can only cancel the parent's padding on its first or last child; use less spacing instead.";
  }
  const w = el?.style["width"]?.endsWith("%") || el?.style["max-width"]?.endsWith("%");
  if (w && pad && "px" in pad && pad.px > 0) return `A full-bleed band needs width:auto (or a px width equal to the padded width): a percentage width shifts the box instead of widening it.`;
  if (pad && "px" in pad && pad.px > 0) return `For a full-bleed band the margin must equal the parent's padding-${side} (${pad.px}px); to overlap items (an avatar stack) use spacing or a single pre-composed image.`;
  return OVERLAP;
};

// A parent's -webkit-center / -webkit-left / -webkit-right (center, div align) places a block in it
// whatever the block's margins, but only off the start side and only one narrower than the parent
// (docs/support.md#block-flow).
const FLOWS = new Set(["block", "list-item", "flow-root", "inline-block", "table-cell"]);
const sized = (v: string | undefined): boolean => v !== undefined && v !== "auto" && v !== "none" && v !== "100%";
export const legacyAlign = (el: StyledElement): Align | undefined => {
  const side = el.parentStyle?.[LEGACY_ALIGN];
  if (side === undefined || !FLOWS.has(get(el.parentStyle!, "display") ?? "") || isInlineLevel(el) || get(el.style, "float") !== "none") return undefined;
  if (el.tag !== "table" && el.tag !== "img" && !sized(el.style["width"]) && !sized(el.style["max-width"])) return undefined;
  const rtl = el.parentStyle!["direction"] === "rtl";
  return side === "center" || (side === "right" && !rtl) || (side === "left" && rtl) ? (side as Align) : undefined;
};

// auto becomes align, negatives (E005) and odd units (E006) stay 0. The shell owns the body's margins.
export const marginOf = (el: StyledElement, ctx: Ctx): { margin: Sides; align?: Align } => {
  const margin = zeroSides();
  if (el.tag === "body") return { margin };
  const auto = (s: string): boolean => el.style[`margin-${s}`] === "auto";
  for (const s of SIDES) {
    if (auto(s)) continue;
    const v = el.style[`margin-${s}`];
    const len = parseLen(v);
    if (len && "px" in len && len.px < 0) {
      if (bleedsParent(el, s, len.px)) margin[s] = len.px;
      else {
        const hint = negativeMarginHint(s, el);
        ctx.diagnostics.report("E005", { message: `margin-${s}: ${v} is negative`, ...(hint ? { hint } : {}), loc: el.loc });
      }
    } else margin[s] = pxOrZero(el, ctx, `margin-${s}`);
  }
  const align: Align | undefined = auto("left") && auto("right") ? "center" : auto("left") ? "right" : auto("right") ? "left" : legacyAlign(el);
  return align ? { margin, align } : { margin };
};

const grows = (k: StyledNode): boolean => k.type === "element" && /^[1-9.]/.test(k.style["flex-grow"] ?? "");

// The border-box min-height of a cell, a px height included. What a table cell can't do with it
// (place or stretch the content inside) is W003; Outlook lays a photo's content out from the top.
export const minHeightOf = (el: StyledElement, ctx: Ctx, frame: Frame, paint: Background): number | undefined => {
  const fixedH = heightAsMin(el);
  const ownMin = parseLen(el.style["min-height"] ?? "auto");
  const minH = fixedH !== undefined && !(ownMin && "px" in ownMin && ownMin.px >= fixedH) ? `${fixedH}px` : el.style["min-height"];
  if (!carries(el) || minH === undefined || minH === "auto" || minH === "0" || minH === "0px" || minH === "none") return undefined;
  const len = parseLen(minH);
  const flex = /flex/.test(el.style["display"] ?? "");
  const column = /column/.test(el.style["flex-direction"] ?? "");
  const placed = column ? el.style["justify-content"] : el.style["align-items"];
  // a column spreads its items over the min-height (StackNode.justify); a one-line row whose
  // items are all placed alike moves as one table (emit: rowPlace)
  const wraps = /^wrap/.test(el.style["flex-wrap"] ?? "nowrap");
  const ownPlace = el.children.some((c) => c.type === "element" && ![undefined, "auto", placed].includes(c.style["align-self"]));
  if (flex && !column && placed !== undefined && /^(center|flex-end|end|space-)/.test(placed) && (wraps || ownPlace)) {
    ctx.diagnostics.report("W003", {
      message: `${column ? "justify-content" : "align-items"}: ${placed} inside min-height ${minH} keeps the content at the top of the box`,
      hint: "Table cells can't place content vertically inside a min-height here; put the space above it in padding-top.",
      loc: el.loc,
    });
  }
  else if (flex && !column && placed !== undefined && /^(center|flex-end|end)/.test(placed) && paint.backgroundImage?.url !== undefined) {
    ctx.diagnostics.report("W003", {
      message: `align-items: ${placed} inside min-height ${minH} over a photo: Outlook keeps the content at the top`,
      hint: "Outlook draws the photo with VML and lays its content out from the top; put the space above it in padding-top to place it everywhere.",
      loc: el.loc,
    });
  }
  else if (flex && !column && (placed === undefined || /^(stretch|normal)$/.test(placed)) && el.children.some(isPaintedNode)) {
    ctx.diagnostics.report("W003", {
      message: `min-height ${minH} on a flex row: browsers stretch the painted items to it, the cells only reach their content`,
      hint: "Table cells can't stretch items to a min-height; give each item its own px min-height.",
      loc: el.loc,
    });
  } else if (flex && column && el.children.some(grows)) {
    ctx.diagnostics.report("W003", {
      message: `flex-grow inside the min-height ${minH} column: the growing item won't fill the extra height`,
      hint: "Table cells can't grow into the minimum height; give the item its own px min-height or padding.",
      loc: el.loc,
    });
  }
  if (len && "px" in len) return frame.borderBox ? len.px : len.px + frameY(frame);
  ctx.diagnostics.report("E006", { message: `min-height: ${minH} is not supported, use px`, loc: el.loc });
  return undefined;
};

// A px size the box has without its style saying so: an <img>'s width/height attributes, or a
// link's own size after the image rule took it off the link's style. Read like a CSS width.
export type ImpliedSize = { width?: number | undefined; height?: number | undefined };

// The px border-box width and height, where known (what a % radius resolves against).
export const outerSize = (el: StyledElement, frame: Frame, implied: ImpliedSize): { width?: number | undefined; height?: number | undefined } => {
  const sized = (prop: "width" | "height", extra: number, given: number | undefined): number | undefined => {
    const v = el.style[prop];
    const len = v === undefined ? undefined : parseLen(v);
    const own = v === undefined ? given : len && "px" in len ? len.px : undefined;
    return own === undefined ? undefined : frame.borderBox ? own : own + extra;
  };
  return { width: sized("width", frameX(frame), implied.width), height: sized("height", frameY(frame), implied.height) };
};

// width and max-width as border-box px or a %, E006 for what can't be carried.
export const widthsOf = (el: StyledElement, ctx: Ctx, frame: Frame): Pick<Box, "width" | "maxWidth"> => {
  const report = (message: string): void => ctx.diagnostics.report("E006", { message, loc: el.loc });
  const extraX = frameX(frame);
  const outer = (n: number): number => (frame.borderBox ? n : n + extraX);
  const out: Pick<Box, "width" | "maxWidth"> = {};

  // `max-width: 100%` just lets a block shrink with its parent; blocks already do that.
  const maxW = el.style["max-width"];
  if (maxW !== undefined && maxW !== "none" && maxW !== "100%") {
    const len = parseLen(maxW);
    if (len && "px" in len) out.maxWidth = outer(len.px);
    else report(`max-width: ${maxW} is not supported, use px`);
  }

  const w = el.style.width;
  if (w !== undefined && w !== "auto") {
    const len = parseLen(w);
    if (len && "px" in len) out.width = { px: outer(len.px) };
    else if (/^calc\(/i.test(w)) {
      // a flex item's calc() width is the flex rule's (docs/support.md#flex-rows); anywhere else it has nothing to resolve against
      if (!/flex/.test(el.parentStyle?.["display"] ?? "")) report(`width: ${w} is only supported on flex items`);
    } else if (len) {
      if (!frame.borderBox && extraX > 0) report(`width: ${w} plus padding/border (content-box) is not supported`);
      out.width = { pct: len.pct };
    } else report(`width: ${w} is not supported`);
  }

  // `width: Npx; max-width: 100%` is a fluid box capped at N.
  if (maxW === "100%" && out.width && "px" in out.width) return { maxWidth: Math.min(out.maxWidth ?? Infinity, out.width.px) };
  return out;
};

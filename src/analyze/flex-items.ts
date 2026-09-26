// What the flex rule reads off each item: its width spec (the column's share) and its alignment.
import type { Ctx } from "../ctx.ts";
import type { Align, Box, Node, VAlign, WidthSpec } from "../ir/index.ts";
import { get } from "../style/props.ts";
import type { StyledElement } from "../style/types.ts";
import { withBox, withoutWidth } from "./box.ts";
import { isTransparent } from "./classify.ts";
import type { Item } from "./order.ts";

export const unsupported = (el: StyledElement, ctx: Ctx, prop: string, value: string, hint?: string): void =>
  void ctx.diagnostics.report("E007", { message: `${prop}: ${value} is not supported`, ...(hint ? { hint } : {}), loc: el.loc });

export const pxOf = (v: string | undefined): number | undefined => {
  if (v === undefined) return undefined;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) && (v.endsWith("px") || n === 0) ? n : undefined;
};

// A gap can't be negative: CSS drops the declaration, so the gap is as if it weren't there.
export const negativeGap = (el: StyledElement, ctx: Ctx, prop: string, v: string): number => {
  ctx.diagnostics.report("W002", { message: `${prop}: ${v} is invalid (a gap can't be negative) and was ignored`, loc: el.loc });
  return 0;
};

export const gapPx = (el: StyledElement, ctx: Ctx, prop: "column-gap" | "row-gap"): number => {
  const v = get(el.style, prop);
  if (v === undefined || v === "normal") return 0;
  const n = pxOf(v);
  if (n !== undefined) return n < 0 ? negativeGap(el, ctx, prop, v) : n;
  ctx.diagnostics.report("E006", { message: `${prop}: ${v} is not supported, use px`, loc: el.loc });
  return 0;
};

// negative values count as 0, like buildBox (E005)
const sideSum = (el: StyledElement, a: string, b: string): number => Math.max(0, pxOf(el.style[a]) ?? 0) + Math.max(0, pxOf(el.style[b]) ?? 0);

const borderW = (el: StyledElement, side: "left" | "right"): number => {
  const style = el.style[`border-${side}-style`] ?? "none";
  if (style === "none" || style === "hidden") return 0;
  return pxOf(el.style[`border-${side}-width`] ?? "3px") ?? 0;
};

// Horizontal padding plus border: what a content-box width leaves out.
export const frameX = (el: StyledElement): number => sideSum(el, "padding-left", "padding-right") + borderW(el, "left") + borderW(el, "right");

// The column owns the size now, so the child must fill it. A maxWidth that came
// from `width: N; max-width: 100%` is the same width in disguise. A button can't
// stretch to its cell by itself, so it gets the column's width (px when known, for VML).
const clearWidth = (it: Item, ctx: Ctx, outerPx?: number): Node => {
  if (!("box" in it.node)) return it.node;
  const rest = withoutWidth(it.node.box);
  const { maxWidth: _m, ...uncapped } = rest;
  const box: Box = it.el?.style["max-width"] === "100%" ? uncapped : rest;
  if (it.node.kind !== "button") return withBox(it.node, box);
  if (outerPx !== undefined) return withBox(it.node, { ...box, width: { px: outerPx } });
  if (box.radius) {
    ctx.diagnostics.report("W003", {
      message: "Outlook shows square corners on a button in a flexible column; give it a px width",
      loc: it.el?.loc,
    });
  }
  return withBox(it.node, { ...box, width: { pct: 100 } });
};


const CALC_HINT = "use calc(P% - Npx) or calc(P% + Npx)";
const NUM = "(\\d+(?:\\.\\d+)?|\\.\\d+)";
const CALC_PCT_FIRST = new RegExp(`^calc\\(\\s*${NUM}%\\s+([+-])\\s+${NUM}px\\s*\\)$`);
const CALC_PX_FIRST = new RegExp(`^calc\\(\\s*${NUM}px\\s+\\+\\s+${NUM}%\\s*\\)$`);

// calc(P% ± Npx) in either order (CSS needs the spaces around + and -); anything else is undefined.
const parseCalc = (v: string): { pct: number; px: number } | undefined => {
  const a = CALC_PCT_FIRST.exec(v);
  if (a) return { pct: Number(a[1]), px: a[2] === "-" ? -Number(a[3]) : Number(a[3]) };
  const b = CALC_PX_FIRST.exec(v);
  return b ? { pct: Number(b[2]), px: Number(b[1]) } : undefined;
};

// The column's width, and the item's node as the column holds it (its own width cleared).
export const widthOf = (it: Item, ctx: Ctx, wrap: boolean): { width: WidthSpec; node: Node } => {
  const keep = (width: WidthSpec): { width: WidthSpec; node: Node } => ({ width, node: it.node });
  const el = it.el;
  if (!el) return keep({ auto: true });
  const grow = Number.parseFloat(get(el.style, "flex-grow") ?? "0") || 0;
  const flexBasis = get(el.style, "flex-basis") ?? "auto";
  const width = el.style["width"];
  const hasBasis = flexBasis !== "auto" && flexBasis !== "content";
  // the size the item starts from: basis, else width
  const size = hasBasis ? flexBasis : width !== undefined && width !== "auto" ? width : undefined;
  const zeroBasis = hasBasis && (flexBasis === "0%" || pxOf(flexBasis) === 0);

  const calc = size?.startsWith("calc(") ? parseCalc(size) : undefined;
  if (size?.startsWith("calc(") && !calc) {
    ctx.diagnostics.report("E006", { message: `flex-basis/width: ${size} is not supported`, hint: CALC_HINT, loc: el.loc });
    return keep({ auto: true });
  }

  // A wrapping item wraps by its px basis; the resolver grows it into its line's leftover.
  const wrapsByBasis = wrap && grow > 0 && size !== undefined && !zeroBasis && pxOf(size) !== undefined;
  if (grow > 0 && !wrapsByBasis && !calc) {
    if (wrap) {
      ctx.diagnostics.report("W003", { message: "a wrapping item needs a px flex-basis or width to know when to wrap", loc: el.loc });
    } else if (size !== undefined && !zeroBasis) {
      ctx.diagnostics.report("W003", { message: "flex-basis with flex-grow is approximated", loc: el.loc });
    }
    return { width: { grow }, node: clearWidth(it, ctx) };
  }
  if (zeroBasis) {
    ctx.diagnostics.report("W003", { message: "flex-basis: 0 without flex-grow sizes to min-content, approximated as auto", loc: el.loc });
    return keep({ auto: true });
  }
  if (size === undefined) return keep({ auto: true });

  const margins = sideSum(el, "margin-left", "margin-right");
  if (calc) {
    // padding and margins are plain px next to the calc, so they ride on its px part (outer width)
    const extras = get(el.style, "box-sizing") === "border-box" ? 0 : frameX(el);
    if (grow > 0) {
      ctx.diagnostics.report("W003", { message: "flex-grow on a calc() flex-basis is ignored; the item keeps its calc() width", hint: "This only matters when its line has room left over; if the line is already full, flex: 0 0 calc(...) says the same thing. A px flex-basis lets an item grow.", loc: el.loc });
    }
    return { width: { calc: { pct: calc.pct, px: calc.px + extras + margins } }, node: clearWidth(it, ctx) };
  }
  if (size.endsWith("%")) {
    const pct = Number.parseFloat(size);
    if (Number.isFinite(pct)) {
      // padding is checked by the item's own box (buildBox); margins would need calc()
      if (margins > 0) ctx.diagnostics.report("E006", { message: `${size} width with horizontal margins is not supported`, loc: el.loc });
      // a width is checked by buildBox; a flex-basis is not
      if (hasBasis && get(el.style, "box-sizing") !== "border-box" && frameX(el) > 0) {
        ctx.diagnostics.report("E006", { message: `${size} flex-basis with horizontal padding or border needs calc(); use box-sizing: border-box`, loc: el.loc });
      }
      return { width: { pct }, node: clearWidth(it, ctx) };
    }
  }
  const px = pxOf(size);
  if (px === undefined) {
    ctx.diagnostics.report("E006", { message: `flex-basis/width: ${size} is not supported, use px or %`, loc: el.loc });
    return keep({ auto: true });
  }
  const extras = frameX(el);
  const borderBox = get(el.style, "box-sizing") === "border-box";
  const outer = borderBox ? px : px + extras;
  // a button can't grow with its column: it keeps the basis (VML needs a px width)
  const node = clearWidth(it, ctx, outer);
  if (wrapsByBasis && it.node.kind === "button") {
    ctx.diagnostics.report("W003", { message: "a button in a growing wrapping item keeps its basis width", hint: "The column grows but the button stays flex-basis wide; Outlook needs a px width for rounded corners.", loc: el.loc });
  }
  // the grow factor rides along for the resolver; everything else reads it as plain px
  return { width: wrapsByBasis ? { px: outer + margins, grow } : { px: outer + margins }, node };
};

export const VALIGN: Readonly<Record<string, VAlign>> = {
  "flex-start": "top", start: "top", "self-start": "top", baseline: "top",
  center: "middle", "flex-end": "bottom", end: "bottom", "self-end": "bottom",
  stretch: "top", normal: "top",
};

const KNOWN_ALIGN = new Set(Object.keys(VALIGN));

// The container's align-items, validated once. Unknown values are E007, baseline is W003.
export const containerAlign = (el: StyledElement, ctx: Ctx, row: boolean): string => {
  const v = get(el.style, "align-items") ?? "normal";
  if (!KNOWN_ALIGN.has(v)) {
    unsupported(el, ctx, "align-items", v);
    return "normal";
  }
  if (v === "baseline" && row) ctx.diagnostics.report("W003", { message: "align-items: baseline is approximated as top", loc: el.loc });
  return v;
};

// The item's align-self, or undefined when it defers to the container.
export const selfAlign = (it: Item, ctx: Ctx): string | undefined => {
  const own = it.el ? get(it.el.style, "align-self") : undefined;
  if (!it.el || !own || own === "auto") return undefined;
  if (!KNOWN_ALIGN.has(own)) {
    unsupported(it.el, ctx, "align-self", own);
    return undefined;
  }
  if (own === "baseline") ctx.diagnostics.report("W003", { message: "align-self: baseline is approximated as top", loc: it.el.loc });
  return own;
};

export const hasBg = (it: Item): boolean => {
  const bg = it.el?.style["background-color"];
  return (bg !== undefined && !isTransparent(bg)) || ("box" in it.node && !!it.node.box.background);
};

// background, border or radius: the item's painted area matters
export const isPainted = (it: Item): boolean => {
  if (hasBg(it)) return true;
  return "box" in it.node && (!!it.node.box.radius || Object.keys(it.node.box.border ?? {}).length > 0);
};

export const isStretch = (v: string): boolean => v === "stretch" || v === "normal";

export const ALIGN: Readonly<Record<string, Align>> = { center: "center", "flex-end": "right", end: "right", "self-end": "right" };

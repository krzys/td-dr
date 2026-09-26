import type { Ctx } from "../ctx.ts";
import { get } from "../style/props.ts";
import type { StyledElement, StyledNode } from "../style/types.ts";
import { isHidden, isInlineLevel, isTextBlock } from "./classify.ts";

// A float on an image is its align attribute (docs/images-and-fonts.md#floated-images). A flex or grid item
// ignores float in a browser, so there is nothing to carry over.
export const floatOf = (el: StyledElement): "left" | "right" | undefined => {
  if (el.tag !== "img" || /flex|grid/.test(el.parentStyle?.["display"] ?? "")) return undefined;
  const f = get(el.style, "float");
  return f === "left" || f === "right" ? f : undefined;
};

// hspace/vspace only carry px; a % or em margin has no fixed value for Outlook to use
const marginPx = (el: StyledElement, side: string): number | undefined => {
  const v = el.style[`margin-${side}`];
  if (v === undefined || v === "auto") return 0;
  const n = Number.parseFloat(v);
  if (n === 0) return 0;
  return v.endsWith("px") && Number.isFinite(n) ? n : undefined;
};

// Outlook ignores img margin but honours hspace/vspace, which apply to both sides: map margins only when equal.
export const floatSpacing = (el: StyledElement): { attrs: Array<[string, string]>; uneven: boolean } => {
  const [t, r, b, l] = ["top", "right", "bottom", "left"].map((s) => marginPx(el, s));
  const attrs: Array<[string, string]> = [];
  if (l !== undefined && l === r && l > 0) attrs.push(["hspace", String(l)]);
  if (t !== undefined && t === b && t > 0) attrs.push(["vspace", String(t)]);
  // a margin that hspace/vspace can't carry (unequal, negative, or not px) is lost in Outlook
  const lost = [t, r, b, l].some((v) => v === undefined || v < 0) || l !== r || t !== b;
  return { attrs, uneven: lost };
};

export const warnUnevenFloatMargin = (el: StyledElement, ctx: Ctx): void => {
  if (!floatOf(el) || !floatSpacing(el).uneven) return;
  ctx.diagnostics.report("W005", {
    message: "a floated image's margin can't be written for Outlook: it ignores image margin, so the gap to the wrapped text is lost there",
    hint: "Use the same px margin on both sides (and top and bottom): it becomes hspace/vspace, which Outlook honours.",
    loc: el.loc,
  });
};

const blank = (n: StyledNode): boolean => n.type === "comment" || (n.type === "text" && /^[ \t\n\r\f]*$/.test(n.text));

const significant = (el: StyledElement): StyledNode[] => el.children.filter((k) => !blank(k) && !(k.type === "element" && isHidden(k)));
const isBlock = (n: StyledNode | undefined): boolean => n?.type === "element" && !isInlineLevel(n);

type Unit = { block: true; el: StyledElement } | { block: false; nodes: StyledNode[] };

// Block children and the runs of inline content between them, the way analyzeChildren groups them.
const units = (el: StyledElement): Unit[] => {
  const out: Unit[] = [];
  for (const k of significant(el)) {
    const prev = out.at(-1);
    if (k.type === "element" && isBlock(k)) out.push({ block: true, el: k });
    else if (prev && !prev.block) prev.nodes.push(k);
    else out.push({ block: false, nodes: [k] });
  }
  return out;
};

const isFlexOrGrid = (el: StyledElement): boolean => /flex|grid/.test(el.style["display"] ?? "");

// Floated images in inline content, through any inline wrappers (an inline-block contains its floats).
const floatedIn = (nodes: StyledNode[]): StyledElement[] =>
  nodes.flatMap((k) => (k.type !== "element" || isHidden(k) ? [] : floatOf(k) ? [k] : k.style["display"] === "inline-block" ? [] : floatedIn(k.children)));

// The image rule lowers an image, or a link around only an image, that is alone in a run of a container.
const lowered = (nodes: StyledNode[]): boolean => {
  const only = nodes[0];
  if (nodes.length !== 1 || only?.type !== "element") return false;
  if (floatOf(only)) return true;
  const inner = only.tag === "a" ? significant(only) : [];
  const img = inner[0];
  return inner.length === 1 && img?.type === "element" && !!floatOf(img);
};

// Floated images whose wrapping a following sibling of `unit` would cut off. Blocks that are not
// last in their own parent report for themselves, so only the last-child chain is followed.
const tail = (unit: Unit): StyledElement[] => {
  if (!unit.block) return lowered(unit.nodes) ? [] : floatedIn(unit.nodes);
  const el = unit.el;
  if (isFlexOrGrid(el)) return [];
  const last = units(el).at(-1);
  if (isTextBlock(el)) {
    const inline = significant(el).filter((k) => !(k.type === "element" && isBlock(k)));
    return [...floatedIn(inline), ...(last?.block ? tail(last) : [])];
  }
  return last ? tail(last) : [];
};

// Each block lowers to its own cell, so text only wraps within the block that holds the image.
// Called for a container before its children are analyzed.
export const warnFloatWrapStops = (container: StyledElement, ctx: Ctx): void => {
  if (isFlexOrGrid(container)) return;
  for (const u of units(container).slice(0, -1)) {
    for (const img of tail(u)) {
      ctx.diagnostics.report("W001", {
        message: "text wrapping around this floated image stops at the end of its paragraph: what follows is a separate block and sits below the image",
        hint: "Put the text that should wrap in the same paragraph, or make the image shorter than the paragraph.",
        loc: img.loc,
      });
    }
  }
};

// Which structure a node gets: the questions the emitters ask before they write anything.
import { contentWidth, isOutlookOnlyCol, resolvedWidthOf, type Align, type Box, type Column, type ImageNode, type Node, type RowNode, type StackNode, type VAlign } from "../ir/index.ts";
import { templateChildren } from "../ir/helpers.ts";
import { borderDecls, paddingValue } from "./attrs.ts";
import { shownCols } from "./mso.ts";

// The box paints, pads or hides something, so it needs a cell of its own.
export const hasBoxCell = (b: Box): boolean =>
  b.hide !== undefined || paddingValue(b.padding) !== undefined || !!b.background || !!b.backgroundImage || !!b.minHeight || !!b.radius || !!b.clip || borderDecls(b.border).length > 0;

export const isPaddingOnly = (b: Box): boolean =>
  !b.hide && !b.background && !b.backgroundImage && !b.minHeight && !b.radius && !b.clip && borderDecls(b.border).length === 0 && !b.width && !b.maxWidth && !b.align;

export const isFullWidth = (b: Box): boolean => !b.width && !b.maxWidth && !b.align;

// Emits nothing at all.
export const isNothing = (n: Node): boolean =>
  (n.kind === "template" && templateChildren(n).every(isNothing)) ||
  (n.kind === "stack" && n.children.length === 0 && !hasBoxCell(n.box)) ||
  (n.kind === "row" && n.cols.length === 0 && !hasBoxCell(n.box));

export const outlookOnlyChild = (c: Node): boolean =>
  (c.kind === "conditional" && c.target === "mso") || (c.kind === "row" && c.cols.length > 0 && c.cols.every(isOutlookOnlyCol) && !hasBoxCell(c.box));

// A full-width box in a stack's slot shares the slot's cell instead of nesting a table in it. Not one with
// a side border (`sideBordered`): in the shell's collapsed tables a cell's side border is shared with the
// column, so every sibling row would move in by half of it.
export const sharesSlotCell = (n: StackNode | RowNode, slotPadded: boolean, sideBordered: boolean): boolean =>
  !(n.kind === "row" && n.wrap) && hasBoxCell(n.box) && isFullWidth(n.box) && !n.box.radius && !sideBordered && !slotPadded;

// Images and fixed-width tables can't center/right-align themselves by CSS in every client,
// so their slot cell carries the align attribute.
export const slotAlign = (n: Node): Align | undefined => {
  if (n.kind === "image" || n.kind === "button") return n.box.align;
  if ((n.kind === "stack" || n.kind === "row") && n.box.width && "px" in n.box.width) return n.box.align;
  return undefined;
};

// docs/support.md#images: a bare image that sat on a text line stays inline in a cell with that line's text styles.
export const onLine = (n: Node): n is ImageNode & { line: NonNullable<ImageNode["line"]> } =>
  n.kind === "image" && n.line !== undefined && paddingValue(n.box.padding) === undefined && !n.box.background;

// A one-line row's cells placed alike sit in a min-height the way flex places them: the
// row's table moves inside the box cell, each cell inside the row.
export const rowPlace = (n: Node): VAlign => {
  if (n.kind !== "row" || n.wrap) return "top";
  const [first, ...rest] = shownCols(n.cols);
  return first && rest.every((c) => c.valign === first.valign) ? first.valign : "top";
};

// Every column sized by its content or a fixed px, none asking for alignment: the
// items pack at the start like flexbox, so the table shrink-wraps instead of
// handing the spare width to the cells.
export const hugs = (n: RowNode): boolean =>
  !n.box.width && !n.box.maxWidth && shownCols(n.cols).length > 0 && shownCols(n.cols).every((c) => ("auto" in c.width || "px" in c.width) && !c.align);

// A painted, full-width card in a column: it becomes the column cell itself, so it
// stretches to the row's height like every cell does, and its gutters become
// spacer cells (padding would paint the gap).
export const paintedChild = (c: Column): StackNode | undefined => {
  const ch = c.child;
  if (!c.stretch || ch.kind !== "stack" || !isFullWidth(ch.box) || ch.box.clip) return undefined; // a clip needs boxCell's inner cell
  if (!ch.box.background && !ch.box.backgroundImage && borderDecls(ch.box.border).length === 0) return undefined;
  if (c.padding && (c.padding.top || c.padding.bottom)) return undefined;
  return ch;
};

// Stretched rounded cards are cells of this table; a collapsed table drops their corners.
export const roundedCells = (n: RowNode): boolean => shownCols(n.cols).some((c) => !!paintedChild(c)?.box.radius);

// px or content-sized items that justify-content packs to the centre or the end of a set width or a painted
// box: their cells shrink-wrap and the table sits there (a lone cell would take the whole width)
export const packed = (n: RowNode): Align | undefined => {
  const shown = shownCols(n.cols);
  const align = shown[0]?.align;
  if (!(n.box.width || hasBoxCell(n.box)) || n.wrap || (align !== "center" && align !== "right")) return undefined;
  if (!shown.every((c) => ("px" in c.width || "auto" in c.width) && c.align === align)) return undefined;
  const inner = contentWidth(n.box, resolvedWidthOf(n));
  return shown.reduce((sum, c) => sum + (c.resolved?.px ?? 0), 0) < inner ? align : undefined;
};

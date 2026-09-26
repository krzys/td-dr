import type { Ctx } from "../../ctx.ts";
import { emptyBox, withLoc, zeroSides, type Box, type Column, type Node, type RowNode, type StackNode, type VAlign, type WidthSpec } from "../../ir/index.ts";
import { get } from "../../style/props.ts";
import type { StyledElement, StyledNode } from "../../style/types.ts";
import { hasTemplateAttrs, readBlocks, TEMPLATE_ATTRS } from "../../template/hints.ts";
import { buildBox, isBareBox, reportDropped, reportRtlRow, withBox, withoutWidth } from "../box.ts";
import { analyzeChildren } from "../children.ts";
import { isDivTable, parseTable } from "../lint.ts";
import type { Rule } from "../rule.ts";

// display: table on a div. Its table-cell children become the columns of a row, table-row
// children a stack of such rows, and anything else is a block that shrink-wraps its content.
// Cells are lowered as the blocks they are; the row owns their widths, like flex columns.
// Anonymous cells, captions, row groups and spans are E001 (parseTable in lint.ts).

const VALIGN: Readonly<Record<string, VAlign>> = { top: "top", baseline: "top", middle: "middle", bottom: "bottom" };

// what a table-cell / table-row ignores or the row takes over
const rowOwned = (p: string): boolean => p === "vertical-align" || p.startsWith("margin");
const without = (rec: Readonly<Record<string, string>>, drop: (p: string) => boolean): Record<string, string> =>
  Object.fromEntries(Object.entries(rec).filter(([p]) => !drop(p)));

const pxOf = (v: string): number | undefined => {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) && (v.endsWith("px") || n === 0) ? n : undefined;
};

// border-spacing "<h> [<v>]"; border-collapse: collapse has none
const spacing = (el: StyledElement, ctx: Ctx): { h: number; v: number } => {
  const raw = get(el.style, "border-spacing");
  if (raw === undefined || get(el.style, "border-collapse") === "collapse") return { h: 0, v: 0 };
  const parts = raw.trim().split(/\s+/).map(pxOf);
  if (parts.length > 2 || parts.some((p) => p === undefined)) {
    ctx.diagnostics.report("E006", { message: `border-spacing: ${raw} is not supported, use px`, loc: el.loc });
    return { h: 0, v: 0 };
  }
  const h = parts[0] ?? 0;
  return { h, v: parts[1] ?? h };
};

const elementsOf = (el: StyledElement, ctx: Ctx): StyledElement[] =>
  el.children.flatMap((c: StyledNode) => {
    if (c.type !== "element") return [];
    if (get(c.style, "display") === "none") {
      ctx.diagnostics.report("I002", { message: `Hidden <${c.tag}> dropped`, loc: c.loc });
      return [];
    }
    return [c];
  });

const cellPaintable = (n: Node): boolean =>
  n.kind === "stack" && !n.box.width && !n.box.maxWidth && !n.box.align && !n.box.margin.top && !n.box.margin.bottom;

const emptyCell = (): Node => ({ kind: "stack", box: emptyBox(), children: [], gap: 0, collapse: false });

type Cell = { column: Column; set: boolean };

// same message as the template rule's: a row's columns can't depend on data
const reportTemplate = (el: StyledElement, ctx: Ctx): void => {
  if (!hasTemplateAttrs(el.attrs)) return;
  const names = readBlocks(el.attrs).blocks.map((b) => `data-email-${b.op === "if" ? b.name : "each"}`);
  ctx.diagnostics.report("E012", { message: `${names.join(" and ") || "a template attribute"} on an item of a row or grid`, loc: el.loc });
};
const withoutTemplate = (attrs: Readonly<Record<string, string>>): Record<string, string> =>
  Object.fromEntries(Object.entries(attrs).filter(([k]) => !(TEMPLATE_ATTRS as readonly string[]).includes(k)));

// hand-written conditional comments between cells can't be kept in a lowered row
const reportComments = (el: StyledElement, ctx: Ctx): void => {
  for (const c of el.children) {
    if (c.type === "comment" && !c.data.trim().startsWith("tddr")) {
      ctx.diagnostics.report("W001", { message: "a comment between table cells is dropped", hint: "Put the comment inside a cell, or use data-email=\"outlook-only\" for Outlook-only content.", ...(c.loc ? { loc: c.loc } : {}) });
    }
  }
};

// A cell is lowered as a block: its width goes to the column, vertical-align to the cell.
const cellOf = (cell: StyledElement, ctx: Ctx, recurse: (n: StyledElement) => Node, fallback: WidthSpec, several: boolean): Cell | undefined => {
  reportTemplate(cell, ctx);
  if (cell.attrs["data-email"] === "outlook-only") {
    ctx.diagnostics.report("E001", { message: 'data-email="outlook-only" on a table cell is not supported', hint: "Put it on an element inside the cell.", loc: cell.loc });
    return undefined;
  }
  const block: StyledElement = {
    ...cell,
    attrs: withoutTemplate(cell.attrs),
    style: { ...without(cell.style, rowOwned), display: "block" },
    declared: without(cell.declared, rowOwned),
  };
  const lowered = recurse(block);
  const box: Box | undefined = "box" in lowered ? lowered.box : undefined;
  const own = box?.width;
  const node = box ? withBox(lowered, withoutWidth(box)) : lowered;
  const va = cell.style["vertical-align"];
  if (va !== undefined && !(va in VALIGN)) {
    ctx.diagnostics.report("E007", { message: `vertical-align: ${va} is not supported on a table cell`, hint: "Use top, middle or bottom.", loc: cell.loc });
  }
  const valign = VALIGN[va ?? "top"] ?? "top";
  const painted = box && (box.background || box.backgroundImage || box.radius || Object.keys(box.border ?? {}).length > 0);
  if (painted && several && !cellPaintable(node)) {
    ctx.diagnostics.report("W003", { message: "this table cell's background won't stretch to the row's height", hint: "Only full-width boxes stretch to the row in email; drop the cell's max-width.", loc: cell.loc });
  }
  return {
    set: own !== undefined,
    column: {
      width: own ?? fallback,
      valign,
      ...(cellPaintable(node) ? { stretch: true } : {}),
      child: node,
    },
  };
};

const rowBox = (row: StyledElement, ctx: Ctx): Box => {
  reportTemplate(row, ctx);
  reportDropped({ ...row, declared: without(row.declared, (p) => p === "vertical-align" || p === "table-layout") }, ctx);
  const box = buildBox(row, ctx);
  // CSS ignores a row's padding, margin and size; only its background and borders paint
  const { width: _w, maxWidth: _m, align: _a, ...rest } = box;
  return { ...rest, padding: zeroSides(), margin: zeroSides() };
};

const isPainted = (box: Box): boolean => !!box.background || !!box.backgroundImage || !!box.radius || Object.keys(box.border ?? {}).length > 0;

const shrinkWrapped = (box: Box): boolean => !box.width;

// The IR has no cap on a shrink-wrapped box, and a cap on a full-width one would stretch it, so max-width is dropped and said so.
const dropCap = (box: Box, el: StyledElement, ctx: Ctx): Box => {
  if (!box.maxWidth) return box;
  const { maxWidth: _cap, ...uncapped } = box;
  ctx.diagnostics.report("W003", { message: "max-width on a display: table without a width is ignored: the table is as wide as its content, uncapped", hint: "Give the table a width, or put the max-width on a wrapper around it.", loc: el.loc });
  return uncapped;
};

export const tableDisplayRule: Rule = {
  name: "table-display",
  matches: (el) => isDivTable(el),
  analyze: (el, ctx, recurse) => {
    const { mode } = parseTable(el);
    reportDropped({ ...el, declared: without(el.declared, (p) => p === "table-layout" || p === "vertical-align") }, ctx);
    const built = buildBox(el, ctx);

    if (mode === "block") {
      const { align, ...inner } = built;
      // no width: the block is as wide as its content, so a centered one is a one-column row placed by align
      const painted = isPainted(built);
      if (!shrinkWrapped(built) || (!align && !painted)) return withLoc<StackNode>({ kind: "stack", box: built, children: analyzeChildren(el, ctx, recurse), gap: 0, collapse: true }, el.loc);
      const stack = withLoc<StackNode>({ kind: "stack", box: dropCap(inner, el, ctx), children: analyzeChildren(el, ctx, recurse), gap: 0, collapse: true }, el.loc);
      return withLoc<RowNode>({ kind: "row", box: { ...emptyBox(), align: align ?? "left" }, gap: 0, wrap: false, cols: [{ width: { auto: true }, valign: "top", child: stack }] }, el.loc);
    }

    const capped = shrinkWrapped(built) ? dropCap(built, el, ctx) : built;
    const gap = spacing(el, ctx);
    // separated borders leave the spacing around the edge too
    const { padding } = capped;
    const box: Box = gap.h > 0 || gap.v > 0
      ? { ...capped, padding: { top: padding.top + gap.v, right: padding.right + gap.h, bottom: padding.bottom + gap.v, left: padding.left + gap.h } }
      : capped;
    const sized = !shrinkWrapped(box);
    const fallback: WidthSpec = sized ? { grow: 1 } : { auto: true };

    const several = mode === "rows" || el.children.filter((c) => c.type === "element" && get(c.style, "display") !== "none").length > 1;
    const rowElements = mode === "cells" ? [undefined] : elementsOf(el, ctx);
    // painted and as wide as its content: the paint goes on a stack inside a one-column row, which places it
    const shrink = !sized && isPainted(box);
    for (const holder of [el, ...rowElements.filter((r): r is StyledElement => r !== undefined)]) reportComments(holder, ctx);
    const lines = rowElements.map((r) => ({ row: r, cells: elementsOf(r ?? el, ctx).flatMap((c) => cellOf(c, ctx, recurse, fallback, several) ?? []) }));

    // a column keeps the width the first cell in it set, in every row
    const width: WidthSpec[] = [];
    for (const l of lines) l.cells.forEach((c, i) => void (c.set && width[i] === undefined && (width[i] = c.column.width)));
    const count = Math.max(...lines.map((l) => l.cells.length));
    const unset = Array.from({ length: count }, (_, i) => width[i]).filter((w) => w === undefined).length;
    if (sized && unset > 1 && get(el.style, "table-layout") !== "fixed") {
      ctx.diagnostics.report("W003", { message: "the cells without a width are split equally; the browser sizes them by their content", hint: "Set table-layout: fixed or give the cells widths.", loc: el.loc });
    }
    reportRtlRow(el, ctx, count);
    // separated borders (the default) keep both lines of a seam; the emitted row collapses them
    const bordered = (c: Cell | undefined, side: "left" | "right"): boolean => {
      const n = c?.column.child;
      return !!n && "box" in n && !!(n as { box: Box }).box.border?.[side];
    };
    if (gap.h === 0 && get(el.style, "border-collapse") !== "collapse" && lines.some((l) => l.cells.some((c, i) => bordered(c, "right") && bordered(l.cells[i + 1], "left")))) {
      ctx.diagnostics.report("W003", { message: "adjacent cell borders are drawn twice in the browser (border-collapse: separate) and once in email", hint: "Set border-collapse: collapse on the table, or border on one side of the seam only.", loc: el.loc });
    }
    const rows = lines.map((l): RowNode => {
      const cols = Array.from({ length: count }, (_, i): Column => {
        const c = l.cells[i];
        return c ? { ...c.column, width: width[i] ?? c.column.width } : { width: width[i] ?? fallback, valign: "top", child: emptyCell() };
      });
      const b = l.row ? rowBox(l.row, ctx) : shrink ? emptyBox() : box;
      return withLoc<RowNode>({ kind: "row", box: b, gap: gap.h, wrap: false, cols }, (l.row ?? el).loc);
    });

    if (shrink) {
      const { align, ...inner } = box;
      const stack = withLoc<StackNode>({ kind: "stack", box: inner, children: rows, gap: gap.v, collapse: false }, el.loc);
      return withLoc<RowNode>({ kind: "row", box: { ...emptyBox(), align: align ?? "left" }, gap: 0, wrap: false, cols: [{ width: { auto: true }, valign: "top", child: stack }] }, el.loc);
    }
    if (mode === "cells") return rows[0]!;
    const only = rows[0]!;
    if (rows.length === 1 && isBareBox(only.box)) return { ...only, box };
    return withLoc<StackNode>({ kind: "stack", box, children: rows, gap: gap.v, collapse: false }, el.loc);
  },
};


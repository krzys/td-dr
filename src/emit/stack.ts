// A stack: one outer table for sizing and alignment, the box (if any) in a single cell around an
// inner table of rows, one row per child.
import { borderX, locKey, type Node, type RowNode, type Sides, type StackNode, type VAlign } from "../ir/index.ts";
import { paddingValue, styleString, type Decls } from "./attrs.ts";
import { blockLayout, boxCell, cellHeight, ghosted, tableTag, type CellContent } from "./box.ts";
import { conditional, templated } from "./conditional.ts";
import { traced, type EmitContext } from "./context.ts";
import { emitNode } from "./emit.ts";
import { ifNotMso, msoOnly } from "./mso.ts";
import { hasBoxCell, isNothing, onLine, outlookOnlyChild, rowPlace, sharesSlotCell, slotAlign } from "./plan.ts";
import { cellsTable, rowCells } from "./row.ts";
import { open, tableOpen, tr, withBody, wrap } from "./serialize.ts";
import { cellTextDecls, EMPTY_TEXT, textDecls } from "./text.ts";
import { foldWrappers, type Slotted } from "./wrappers.ts";

// What goes inside a box cell: a lone inline child shares the cell, anything else gets rows.
export const boxContent = (e: EmitContext, n: StackNode | RowNode): CellContent => {
  if (n.kind === "row") return { decls: [], html: `\n${withBody(cellsTable(e, n), rowCells(e, n))}\n` };
  if (n.children.length === 0) return { decls: EMPTY_TEXT, html: "&nbsp;" };
  // only Outlook-only children (grid cells): the others get the empty box, Outlook the rows
  if (n.children.every(outlookOnlyChild)) {
    // the cell keeps its own type so Outlook's text isn't zero-sized; the empty row is for the rest
    const empty = tr(wrap(e, "td", [["style", styleString(EMPTY_TEXT)]], "&nbsp;"));
    return { decls: [], html: `\n${withBody(tableOpen(e, "100%", [["width", "100%"], ...blockLayout(e)]), ifNotMso(empty) + msoOnly(rows(e, n.children)))}\n` };
  }
  const only = n.children.length === 1 ? n.children[0] : undefined;
  if (only?.kind === "inline" && !n.justify) return { decls: cellTextDecls(only), html: only.html };
  if (n.justify && cellHeight(n.box)) return { decls: [], html: `\n${justified(e, n, cellHeight(n.box)!)}\n` };
  return { decls: [], html: `\n${withBody(tableOpen(e, "100%", [["width", "100%"], ...blockLayout(e)]), rows(e, n.children))}\n` };
};

// docs/support.md#height-and-vertical-distribution: a table as tall as the cell's content box. Center
// and end, and the space-* values with one item, put the rows in one cell placed by valign. The others give each item a 1px row, which
// the table never grows, and put empty rows around them: every engine shares spare height equally
// between empty rows (% rows it doesn't: Gecko and WebKit fill those first to last), so a gap of N
// rows takes N shares.
const PLACE: Partial<Record<NonNullable<StackNode["justify"]>, VAlign>> = { center: "middle", end: "bottom" };

// empty rows before item i of n (i = n: after the last)
const SPREAD: Readonly<Record<"between" | "around" | "evenly", (i: number, n: number) => number>> = {
  between: (i, n) => (i > 0 && i < n ? 1 : 0),
  around: (i, n) => (i === 0 || i === n ? 1 : 2),
  evenly: () => 1,
};

const justified = (e: EmitContext, n: StackNode, height: number): string => {
  const head = open(e, "table", [
    ["role", "presentation"],
    ["width", "100%"],
    ["height", String(height)],
    ["cellpadding", "0"],
    ["cellspacing", "0"],
    ["border", "0"],
    ["style", styleString([["width", "100%"], ["height", `${height}px`], ...blockLayout(e)])],
  ]);
  const items = n.children.filter((c) => !isNothing(c));
  // an Outlook-only item isn't there in the browsers that share the height, so it adds no gap
  const shown = items.filter((c) => !outlookOnlyChild(c));
  // one item: space-between puts it at the start, space-around and space-evenly in the middle
  const place = PLACE[n.justify!] ?? (shown.length === 1 ? (n.justify === "between" ? "top" : "middle") : undefined);
  // Word honours a cell's height and valign, so Outlook places these too
  if (place) return withBody(head, tr(wrap(e, "td", [["height", String(height)], ["valign", place]], `\n${withBody(tableOpen(e, "100%", [["width", "100%"], ...blockLayout(e)]), rows(e, n.children))}\n`)));
  const spread = SPREAD[n.justify as keyof typeof SPREAD];
  const spacers = (k: number): string[] => Array<string>(k).fill(tr(wrap(e, "td", [["style", styleString(EMPTY_TEXT)]], "&nbsp;")));
  const body = items.flatMap((c) => (outlookOnlyChild(c) ? [row(e, c)] : [...spacers(spread(shown.indexOf(c), shown.length)), row(e, c, true)]));
  return withBody(head, [...body, ...spacers(spread(shown.length, shown.length))].join("\n"));
};

// One cell per child. Wrappers that only add padding (margins turned into padding)
// fold into that cell, and a full-width box shares it, so nesting stays shallow.
// `fixed`: a 1px cell, whose row a table gives none of its spare height (justified).
const row = (e: EmitContext, child: Node, fixed = false): string => {
  if (child.kind === "conditional") return conditional(e, child, row(e, child.child, fixed));
  if (child.kind === "template") return templated(child, (c) => row(e, c, fixed));
  const { node, pad, loc } = foldWrappers(child, (s) => sideBordered(e, s) && !wraps(s));
  return tr(slot(traced(e, loc), node, pad, fixed ? 1 : undefined));
};

// With other screens, the base screen's border decides for all of them, so every compile has one structure
// (a border only another screen adds stays in the shared cell there).
const sideBordered = (e: EmitContext, n: StackNode | RowNode): boolean => {
  const base = e.ctx.otherScreens?.sideBorders;
  return base ? !!n.loc && base.has(locKey(n.loc)) : borderX(n.box) > 0;
};

// A wrapper a pass put around the element it shares a loc with (margin-to-padding), not the element's own box.
const wraps = (s: StackNode): boolean => {
  const inner = s.children[0];
  return !!inner && (inner.kind === "stack" || inner.kind === "row") && !!inner.loc && !!s.loc && locKey(inner.loc) === locKey(s.loc);
};

// the cell a child sits in
const slot = (e: EmitContext, n: Slotted, pad: Sides, height?: number): string => {
  const padding: Decls = [["padding", paddingValue(pad)]];
  if (n.kind === "inline") return wrap(e, "td", [["height", height], ["style", styleString([...padding, ...cellTextDecls(n)]) || undefined]], n.html);
  if ((n.kind === "stack" || n.kind === "row") && sharesSlotCell(n, !!paddingValue(pad), sideBordered(e, n))) return boxCell(e, n, boxContent(e, n), rowPlace(n), height);
  const content = emitNode(e, n);
  const nested = n.kind === "stack" || n.kind === "row";
  const line = onLine(n) ? textDecls(n.line) : [];
  return wrap(e, "td", [["height", height], ["align", slotAlign(n)], ["style", styleString([...padding, ...line]) || undefined]], nested ? `\n${content}\n` : content);
};

export const rows = (e: EmitContext, children: Node[]): string => children.filter((c) => !isNothing(c)).map((c) => row(e, c)).join("\n");

export const emitStack = (e: EmitContext, n: StackNode, skipGhost: boolean): string => {
  if (isNothing(n)) return "";
  // boxContent renders the children, so only a box cell may ask for it (diagnostics would repeat)
  const body = hasBoxCell(n.box) ? tr(boxCell(e, n, boxContent(e, n))) : rows(e, n.children);
  return body ? ghosted(e, n, withBody(tableTag(e, n.box, { fixed: !e.contentSized }), body), skipGhost) : "";
};

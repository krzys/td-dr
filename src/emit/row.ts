// A row: one table row of column cells, or fluid-hybrid columns with Outlook ghost tables when it wraps
// (fluid.ts). Columns of a row that stacks on some screen are written so a head rule can turn them into blocks.
import { borderX, borderY, gutterX, isOutlookOnlyCol, ratioPct, roundPct, type Column, type RowNode, type StackItem, type StackNode } from "../ir/index.ts";
import { borderDecls, HIDE_DECLS, imageDecls, legacyColor, paddingValue, radiusValue, styleString, type Attrs, type Decls } from "./attrs.ts";
import { boxCell, ghosted, tableTag } from "./box.ts";
import { conditional } from "./conditional.ts";
import { inContent, traced, type EmitContext } from "./context.ts";
import { emitNode } from "./emit.ts";
import { emitFluidRow } from "./fluid.ts";
import { ifNotMso, shownCols } from "./mso.ts";
import { hasBoxCell, hugs, isNothing, onLine, packed, paintedChild, roundedCells, rowPlace, slotAlign } from "./plan.ts";
import { tableOpen, tr, withBody, wrap } from "./serialize.ts";
import { boxContent } from "./stack.ts";
import { cellTextDecls, EMPTY_TEXT, textDecls } from "./text.ts";

// What the other columns of a row mean for one column's width.
type RowCtx = { hasPx: boolean; growTotal: number; nowrapAuto: boolean };

// Which gutter halves of a column go because the item beside them is hidden (see gutters()).
type Drop = { left?: boolean; right?: boolean };

// Where a column of a stacked row sits on a screen that stacks it (docs/support.md#what-a-screen-may-change): a block
// `top` px under the one before, or no block at all. Absent: the column is not stacked.
type StackAt = { top: number; item: StackItem } | "gone";

// One column's place in its row: the row-wide facts, the gutters its neighbours leave it, its stacked block.
type Cell = { col: Column; row: RowCtx; drop: Drop; stack: StackAt | undefined };

// A fixed px column stays px when the viewport is narrower than the design width; a flexing
// column takes what is left (no width of its own) unless auto columns share the row, where
// it claims the free space (width:100% across the grow columns) so they hug their content.
const columnWidthCss = (c: Column, r: RowCtx): string | undefined => {
  if ("grow" in c.width && !c.resolved) return r.hasPx ? undefined : `${ratioPct(c.width.grow / r.growTotal)}%`;
  if (!c.resolved) return undefined;
  // CSS width on a cell excludes its padding (gutters); the width attr includes it
  if ("px" in c.width) return `${c.resolved.px - gutterX(c)}px`;
  if ("grow" in c.width && r.hasPx) return undefined;
  return `${c.resolved.pct}%`; // pct and calc columns are shares, never fixed
};

const NO_ITEM: StackItem = { inset: { left: 0, right: 0 } };

const stackPlaces = (n: RowNode): Array<StackAt | undefined> => {
  let first = true;
  return n.cols.map((c, i): StackAt | undefined => {
    if (!n.stacked || c.hidden || isOutlookOnlyCol(c)) return undefined;
    if (isNothing(c.child)) return "gone";
    const top = first ? 0 : n.stacked.gap;
    first = false;
    return { top, item: n.stacked.items?.[i] ?? NO_ITEM };
  });
};

const STACK_GONE: ReadonlyArray<readonly [string, string]> = [["display", "none"]];

const sidePx = (n: number): string => (n ? `${n}px` : "0");

// A stacked column with a px width of its own is capped at it; align-items places a capped one with
// auto margins. A block that paints keeps the gap above it and the item's own side margins as margin;
// a transparent cell takes both as padding instead.
const blockMargin = (at: { top: number; item: StackItem }, paints: boolean): string | undefined => {
  const { item } = at;
  const top = paints ? at.top : 0;
  const t = sidePx(top);
  const { left, right } = paints ? item.inset : { left: 0, right: 0 };
  if (item.cap !== undefined && item.place === "center") return `${t} auto 0`;
  if (item.cap !== undefined && item.place === "right") return `${t} ${sidePx(right)} 0 auto`;
  return top || left || right ? (left || right ? `${t} ${sidePx(right)} 0 ${sidePx(left)}` : `${t} 0 0`) : undefined;
};

// The width of a stacked block: its own % if it has one, else the whole line.
const blockWidth = (item: StackItem, margins = false): string => (item.pct !== undefined ? `${item.pct}%` : margins ? "auto" : "100%");

const columnCell = (e: EmitContext, cell: Cell): string => columnCellOf(traced(e, cell.col.child.loc), cell);

const columnCellOf = (e: EmitContext, { col: c, row: r, drop, stack }: Cell): string => {
  const child = c.child;
  const blocked = stack && stack !== "gone" ? stack : undefined;
  // justify-content is vertical in a column: the block keeps the text-align of its own
  const align = blocked && c.align ? (slotAlign(child) ?? "left") : (c.align ?? slotAlign(child));
  const width = columnWidthCss(c, r);
  const inset = blocked ? blocked.item.inset : NO_ITEM.inset;
  const sides = inset.left + inset.right > 0;
  const cap = blocked?.item.cap !== undefined ? blocked.item.cap + inset.left + inset.right : undefined;
  const style = styleString(
    blocked
      ? [
          ["display", "block"],
          ["width", blockWidth(blocked.item)],
          ["max-width", cap !== undefined ? `${cap}px` : undefined],
          ["margin", blockMargin(blocked, false)],
          // the gutters beside it are gone; the item's own side margins stay
          ["padding", paddingValue({ top: blocked.top + (c.padding?.top ?? 0), right: inset.right, bottom: c.padding?.bottom ?? 0, left: inset.left })],
          ["box-sizing", sides ? "border-box" : undefined],
          ...(child.kind === "inline" ? cellTextDecls(child) : onLine(child) ? textDecls(child.line) : []),
        ]
      : [
          ["width", width],
          // a cell's width gives way to a long word next to it; flex-shrink: 0 doesn't
          ["min-width", c.noShrink ? width : undefined],
          ["padding", c.padding ? paddingValue({ ...c.padding, ...(drop.left ? { left: 0 } : {}), ...(drop.right ? { right: 0 } : {}) }) : undefined],
          // the grow column's width:100% would squeeze a content-sized neighbour to its longest word
          ["white-space", r.nowrapAuto && "auto" in c.width ? "nowrap" : undefined],
          ...(child.kind === "inline" ? cellTextDecls(child) : onLine(child) ? textDecls(child.line) : []),
          ...(c.hidden ? HIDE_DECLS : []),
          ...(stack === "gone" ? STACK_GONE : []),
        ],
  );
  const attrs: Attrs = [
    ["width", "grow" in c.width && r.hasPx ? undefined : c.resolved?.px],
    ["valign", c.valign],
    ["align", align],
    ["style", style || undefined],
  ];
  const nested = child.kind === "stack" || child.kind === "row";
  // a shrink-wrapped row sits where its cell aligns it; without this it falls back to left
  const placed = child.kind === "row" && !child.box.align && (align === "right" || align === "center") ? { ...child, box: { ...child.box, align } } : child;
  const html = child.kind === "inline" ? child.html : emitNode(inContent(e), placed);
  const inner = nested ? `\n${html}\n` : html;
  return wrap(e, "td", attrs, c.hidden ? ifNotMso(inner) : inner);
};

// Gutter cell. In % rows it's a % too, so the row adds up to exactly 100% and no
// browser has leftover space to hand out (WebKit gives it to the gutters). The padding
// is its min-content, so a squeezed row can't shrink the gap (a bare px width on a cell
// does shrink to 0). In px rows border-box keeps the cell at W with that padding inside,
// and never `width:0`, which WebKit ignores. mso-padding-alt:0 leaves Word the plain width.
// `hide`: how it goes on the screens where its column does.
const spacer = (e: EmitContext, w: number, sizing: { pct: number | undefined; hide: Decls }): string => {
  const width: Decls = sizing.pct !== undefined ? [["width", `${sizing.pct}%`]] : [["box-sizing", "border-box"], ["width", `${w}px`]];
  return wrap(e, "td", [["width", w], ["style", styleString([...width, ["padding-left", `${w}px`], ["mso-padding-alt", "0"], ...EMPTY_TEXT, ...sizing.hide])]], "&nbsp;");
};

const paintedCells = (e: EmitContext, cell: Cell, card: StackNode): string[] => paintedCellsOf(traced(e, card.loc), cell, card);

const paintedCellsOf = (e: EmitContext, { col: c, row: r, drop, stack }: Cell, card: StackNode): string[] => {
  const blocked = stack && stack !== "gone" ? stack : undefined;
  const left = c.padding?.left ?? 0;
  const right = c.padding?.right ?? 0;
  const inner = c.resolved ? c.resolved.px - left - right : undefined;
  const b = card.box;
  const fixed = "px" in c.width;
  const flexible = "grow" in c.width && r.hasPx; // takes whatever the fixed columns leave
  // share of the row per px of this column, so cell + gutters add up to resolved.pct
  const perPx = c.resolved && !fixed && !flexible ? c.resolved.pct / c.resolved.px : undefined;
  const bx = borderX(b);
  const widthCss =
    flexible || inner === undefined
      ? columnWidthCss(c, r)
      : fixed
        ? `${inner - bx}px`
        : perPx !== undefined
          ? `${roundPct(inner * perPx)}%`
          : columnWidthCss(c, r);
  // The cell paints and stretches; the card's padding sits on an inner cell so the
  // outer width means the same thing in every browser.
  const { decls, html } = boxContent(inContent(e), card);
  const pad = paddingValue(b.padding);
  const content = pad
    ? `\n${withBody(tableOpen(e, "100%", [["width", "100%"]]), tr(wrap(e, "td", [["style", styleString([["padding", pad], ...decls])]], html)))}\n`
    : html;
  // A stretched cell can't hold Outlook's VML rect (its height is the row's), so a photo shows as bgcolor there.
  if (b.backgroundImage?.url !== undefined) {
    e.ctx.diagnostics.report("W001", {
      message: "Outlook shows the background colour in stretched columns, not the photo",
      hint: "VML needs a px height; a column that stretches to its row has none. Give the card its own row to get the photo.",
      loc: card.loc,
    });
  }
  const minH = b.minHeight ? Math.max(0, b.minHeight - borderY(b)) : undefined;
  const td = wrap(
    e,
    "td",
    [
      ["width", flexible ? undefined : inner],
      ["height", minH],
      ["valign", c.valign],
      ["align", blocked && c.align ? "left" : c.align],
      ["bgcolor", legacyColor(b.background)],
      ["background", b.backgroundImage?.url],
      [
        "style",
        styleString([
          ...((blocked
            ? [
                ["display", "block"],
                ["width", blockWidth(blocked.item, blocked.item.inset.left + blocked.item.inset.right > 0)],
                ["max-width", blocked.item.cap !== undefined ? `${blocked.item.cap - bx}px` : undefined],
                // the gap above sits outside the paint
                ["margin", blockMargin(blocked, true)],
                // a block takes its height from its content, not the row
                ["height", minH !== undefined ? "auto" : undefined],
              ]
            : [
                ["width", widthCss],
                ["min-width", c.noShrink && fixed ? widthCss : undefined],
                ["height", minH !== undefined ? `${minH}px` : undefined],
              ]) as Array<[string, string | undefined]>),
          ["background-color", b.background],
          ...imageDecls(b),
          ...borderDecls(b.border),
          ["border-radius", radiusValue(b)],
          ...(pad ? [] : decls),
          ...(c.hidden ? HIDE_DECLS : []),
          ...(stack === "gone" ? STACK_GONE : []),
        ]),
      ],
    ],
    c.hidden ? ifNotMso(content) : content,
  );
  const gutter = (w: number, gone?: boolean): string =>
    spacer(e, w, { pct: perPx !== undefined ? roundPct(w * perPx) : undefined, hide: c.hidden || gone ? HIDE_DECLS : stack !== undefined ? STACK_GONE : [] });
  return [...(left ? [gutter(left, drop.left)] : []), td, ...(right ? [gutter(right, drop.right)] : [])];
};

// A flex gap sits between the items that show. Each column carries half of it on each side, so a
// half with no showing column on its far side goes too (a hidden item's own halves go with its cell).
const gutters = (cols: readonly Column[]): Drop[] => {
  const open = cols.map((c) => !isOutlookOnlyCol(c) && !c.hidden);
  return cols.map((c, i) => {
    if (c.hidden || isOutlookOnlyCol(c)) return {};
    const hiddenBefore = cols.slice(0, i).some((o) => o.hidden);
    const hiddenAfter = cols.slice(i + 1).some((o) => o.hidden);
    return {
      ...(hiddenBefore && !open.slice(0, i).some(Boolean) ? { left: true } : {}),
      ...(hiddenAfter && !open.slice(i + 1).some(Boolean) ? { right: true } : {}),
    };
  });
};

export const rowCells = (e: EmitContext, n: RowNode): string => {
  const filler = wrap(e, "td", [["style", styleString(EMPTY_TEXT)]], "&nbsp;");
  if (n.cols.length === 0) return tr(filler);
  const shown = shownCols(n.cols);
  // the others see the row as if it were empty; the Outlook-only cells come on top
  const lead = shown.length === 0 ? ifNotMso(filler) : "";
  const hasGrow = shown.some((c) => "grow" in c.width);
  const hasPx = shown.some((c) => "px" in c.width);
  const r: RowCtx = {
    hasPx,
    growTotal: shown.reduce((sum, c) => sum + ("grow" in c.width ? c.width.grow : 0), 0) || 1,
    nowrapAuto: hasGrow && !hasPx && shown.some((c) => "auto" in c.width),
  };
  const drops = gutters(n.cols);
  const places = stackPlaces(n);
  const cells = n.cols.flatMap((c, i) => {
    // the whole cell is Outlook's alone; the others' widths were worked out without it
    if (c.child.kind === "conditional" && isOutlookOnlyCol(c)) return [conditional(e, c.child, columnCell(e, { col: { ...c, child: c.child.child }, row: r, drop: {}, stack: undefined }))];
    const cell: Cell = { col: c, row: r, drop: drops[i]!, stack: places[i] };
    const card = paintedChild(c);
    return card ? paintedCells(e, cell, card) : [columnCell(e, cell)];
  });
  return tr(`${lead}${cells.join("\n")}`);
};

// Stacked, the blocks fill the line (align-items: stretch); a shrink-wrapped table would size them all to the widest.
const hugTable = (e: EmitContext, n: RowNode, sep: Decls): string =>
  tableOpen(e, "", [...(n.stacked ? [["width", "100%"] as const] : []), ...sep], n.box.align ?? "left");

export const cellsTable = (e: EmitContext, n: RowNode): string => {
  const sep: Decls = [["border-collapse", roundedCells(n) ? "separate" : undefined]];
  const pack = packed(n);
  if (pack) return tableOpen(e, "", sep, pack);
  return hugs(n) ? hugTable(e, n, sep) : tableOpen(e, "100%", [["width", "100%"], ...sep]);
};

export const emitRow = (e: EmitContext, n: RowNode, skipGhost: boolean): string => {
  if (isNothing(n)) return "";
  // with only Outlook-only items there is nothing to wrap for the others
  if (n.wrap && shownCols(n.cols).length > 0) {
    const fluid = emitFluidRow(e, n, (child) => emitNode(inContent(e), child), (c, html) => conditional(e, c, html));
    e.headCss.push(...fluid.css.filter((c) => !e.headCss.includes(c)));
    const cell = hasBoxCell(n.box) ? boxCell(e, n, { decls: [], html: fluid.html }) : wrap(e, "td", [], fluid.html);
    return ghosted(e, n, withBody(tableTag(e, n.box), tr(cell)), skipGhost);
  }
  const body = hasBoxCell(n.box)
    ? tr(boxCell(e, n, { decls: [], html: boxContent(e, n).html }, rowPlace(n)))
    : packed(n)
      ? tr(wrap(e, "td", [], boxContent(e, n).html))
      : rowCells(e, n);
  // stretched cards are cells of this table, so their corners need separate borders too
  const rounded = !hasBoxCell(n.box) && roundedCells(n);
  const sep: Decls = [["border-collapse", rounded ? "separate" : undefined]];
  const table = !hasBoxCell(n.box) && hugs(n) ? hugTable(e, n, sep) : tableTag(e, n.box, { roundedCells: rounded });
  return ghosted(e, n, withBody(table, body), skipGhost);
};

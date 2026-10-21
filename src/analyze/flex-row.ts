// A flex row: its items become the columns of one row (or the lines of a wrapping one). Each step
// takes what it needs and returns new columns or a new box; diagnostics come out in step order.
import type { Ctx } from "../ctx.ts";
import { withLoc, type Align, type Box, type Column, type ConditionalNode, type Node, type RowNode, type Sides, type StackItem, type VAlign } from "../ir/index.ts";
import { get } from "../style/props.ts";
import type { StyledElement } from "../style/types.ts";
import { buildBox, isBareBox } from "./box.ts";
import { ALIGN, containerAlign, frameX, gapPx, hasBg, isPainted, isStretch, pxOf, selfAlign, unsupported, VALIGN, widthOf } from "./flex-items.ts";
import { hideWrap } from "./hide.ts";
import { msoItem, type Item } from "./order.ts";

// What the container sets for all its items, read (and reported) once.
type Line = { align: string; gap: number; wrap: boolean; rowGap: number };

const lineOf = (el: StyledElement, ctx: Ctx): Line => {
  const align = containerAlign(el, ctx, true);
  const gap = gapPx(el, ctx, "column-gap");
  const wrap = get(el.style, "flex-wrap") === "wrap";
  // row-gap goes into each column as bottom spacing (the IR only has the column gap); the
  // row's own bottom padding gives back what the last line doesn't need. Without that much
  // padding the last line keeps a trailing row-gap (no negative margins in email).
  const rowGap = wrap ? gapPx(el, ctx, "row-gap") : 0;
  return { align, gap, wrap, rowGap };
};

// a calc column is a share of the row like a % one
type WidthKind = "px" | "pct" | "grow" | "auto";
const kind = (c: Column): WidthKind => ("px" in c.width ? "px" : "pct" in c.width || "calc" in c.width ? "pct" : "grow" in c.width ? "grow" : "auto");

// An item's side margins are transparent space beside it: they become its cell's
// padding, so they don't flex (grow items) and don't stop the card from stretching.
const liftSideMargins = (n: Node): { node: Node; left: number; right: number } => {
  if (n.kind === "inline") return { node: { ...n, margin: { ...n.margin, left: 0, right: 0 } }, left: n.margin.left, right: n.margin.right };
  if (n.kind === "stack" || n.kind === "row" || n.kind === "image" || n.kind === "button") {
    const m = n.box.margin;
    return { node: { ...n, box: { ...n.box, margin: { ...m, left: 0, right: 0 } } } as Node, left: m.left, right: m.right };
  }
  return { node: n, left: 0, right: 0 };
};

const cellPadding = (left: number, right: number, line: Line): { padding?: Sides } =>
  left || right || line.rowGap ? { padding: { top: 0, right, bottom: line.rowGap, left } } : {};

// What the emitter can stretch: a full-width painted stack with no vertical margins.
const cellPaintable = (n: Node): boolean =>
  n.kind === "stack" && !n.box.width && !n.box.maxWidth && !n.box.align && !n.box.margin.top && !n.box.margin.bottom;

const valignOf = (v: string, it: Item, several: boolean, ctx: Ctx): VAlign => {
  // The emitter stretches a full-width painted box by painting the cell; anything
  // else (images, fixed-width boxes, boxes with vertical margins) keeps its own height.
  const n = it.node;
  if (isStretch(v) && several && hasBg(it) && !cellPaintable(n)) {
    ctx.diagnostics.report("W003", { message: "shorter items' backgrounds won't stretch", hint: "Only full-width boxes can stretch to the row's height in email; drop the item's width or align it to the top.", loc: it.el?.loc ?? it.node.loc });
  }
  return VALIGN[v] ?? "top";
};

// One column per visible item, and the alignment each one asked for.
const columnsOf = (el: StyledElement, items: readonly Item[], line: Line, ctx: Ctx): { cols: Column[]; aligns: string[] } => {
  // Lines of a wrapping row are inline-blocks: they can't share a height, so painted
  // items on one line that stretch in the source come out ragged. Say so once per row. Inline
  // chips are one line tall and equal in height, so they stay silent.
  const ragged = line.wrap && items.length > 1 && items.some((i) => i.node.kind !== "inline" && isPainted(i));
  let raggedReported = false;
  const aligns: string[] = [];
  const cols = items.map((it): Column => {
    const v = selfAlign(it, ctx) ?? line.align;
    aligns.push(v);
    if (ragged && !raggedReported && isStretch(v)) {
      raggedReported = true;
      ctx.diagnostics.report("W003", { message: "shorter items' backgrounds won't stretch in a wrapping row", hint: "Wrapped items are separate inline blocks, so painted cards of different heights on one line stay ragged. Use align-items: flex-start to make that explicit.", loc: el.loc });
    }
    const { width, node: sized } = widthOf(it, ctx, line.wrap);
    const valign = valignOf(v, { ...it, node: sized }, items.length > 1 && !line.wrap, ctx); // lines of a wrapping row never stretch
    const { node, left, right } = liftSideMargins(sized);
    return {
      width,
      valign,
      ...cellPadding(left, right, line),
      // inline-block columns don't share a height, so nothing stretches in a wrapping row
      ...(!line.wrap && isStretch(v) && cellPaintable(node) ? { stretch: true } : {}),
      ...(!line.wrap && "px" in width && !("grow" in width) && it.el && get(it.el.style, "flex-shrink") === "0" ? { noShrink: true } : {}),
      // a wrapping row's columns are fluid divs: the div itself is hidden, and leaves no empty box in the line
      ...(line.wrap && it.hide === "hidden" ? { hidden: true } : {}),
      child: node,
    };
  });
  return { cols, aligns };
};

// Columns hidden on some screens only. Without a growing neighbour to take its room, a column's cell
// stays so the others don't stretch; that's exact only for the last column.
const hideColumns = (el: StyledElement, cols: readonly Column[], items: readonly Item[], ctx: Ctx): Column[] =>
  cols.map((col, i) => {
    const it = items[i]!;
    if (!it.hide) return col;
    if (cols.some((o, j) => j !== i && "grow" in o.width)) return it.hide === "hidden" ? { ...col, hidden: true } : col;
    if (i < cols.length - 1) {
      ctx.diagnostics.report("W014", {
        message: "a column hidden on some screens leaves its room empty, so the columns after it don't move up",
        hint: "Flex closes the gap when an item is display:none; a table row can only do that when another column grows to take the space. Give a neighbouring column flex: 1, or hide the last column.",
        loc: it.el?.loc ?? el.loc,
      });
    }
    return { ...col, child: hideWrap(col.child, it.hide, it.el?.loc) };
  });

// The row's padding once a wrapping row's gaps are in the columns: the bottom padding gives back the
// row gap under the last line, the side padding has to hold half the column gap at each edge.
const wrapPadding = (el: StyledElement, box: Box, cols: readonly Column[], line: Line, ctx: Ctx): Sides => {
  // rows of shares (% or calc) usually keep exact widths and known lines; gap-to-padding handles
  // their gaps (and reports when it can't), so the row padding stays as authored for it
  const shares = line.wrap && cols.length > 0 && cols.every((c) => "pct" in c.width || "calc" in c.width);
  if (shares) return box.padding;
  const { padding } = box;
  if (line.wrap && padding.bottom < line.rowGap) {
    ctx.diagnostics.report("W003", {
      message: "extra space is left under the last line of this wrapping row",
      hint: `The row gap becomes bottom spacing on every item; a padding-bottom of ${line.rowGap}px on the row absorbs it.`,
      loc: el.loc,
    });
  }
  const inset = line.wrap ? [padding.left, padding.right].map((p) => Math.max(0, line.gap / 2 - p)) : [0, 0];
  if (inset[0]! + inset[1]! > 0) {
    // sized items give the shortfall back out of their width (gap-to-padding); auto ones just sit inset
    const sized = cols.some((c) => "px" in c.width || "pct" in c.width || "calc" in c.width);
    const autos = cols.some((c) => "auto" in c.width);
    const most = Math.max(...inset);
    ctx.diagnostics.report("W003", {
      message: !sized
        ? `items in this wrapping row sit up to ${most}px in from its edges`
        : autos
          ? `items in this wrapping row sit up to ${most}px in from its edges, and the first and last sized items lose that from their width`
          : `items in this wrapping row sit up to ${most}px in from its edges, and a line that fills the row loses that from its first and last item`,
      hint: `Email has no negative margins, so the row's side padding has to absorb half the gap at each edge. Add padding: 0 ${line.gap / 2}px to the row.`,
      loc: el.loc,
    });
  }
  return line.rowGap > 0 ? { ...padding, bottom: Math.max(0, padding.bottom - line.rowGap) } : padding;
};

// beside a px column the grow columns get what's left as one auto-layout table splits it: by content
const reportGrowSharing = (el: StyledElement, cols: readonly Column[], line: Line, ctx: Ctx): void => {
  if (line.wrap || !cols.some((c) => kind(c) === "px") || cols.filter((c) => kind(c) === "grow").length <= 1) return;
  ctx.diagnostics.report("W003", {
    message: "flex-grow columns beside a px column share the space by their content, not by flex-grow",
    hint: "Give the growing columns a % flex-basis (or px widths), or keep a single growing column next to the px one.",
    loc: el.loc,
  });
};

const START_JC = ["normal", "flex-start", "start", "left", "stretch"];
const END_JC = ["center", "flex-end", "end", "right"];
const SPACE_JC = ["space-between", "space-around", "space-evenly"];

const isPaintedBox = (box: Box, image: boolean): boolean =>
  !!box.background || (image && !!box.backgroundImage) || !!box.radius || Object.keys(box.border ?? {}).length > 0;

// justify-content as column alignment, or as the row's own width and place when the row can shrink to its columns.
const justifyRow = (el: StyledElement, cols: readonly Column[], box: Box, line: Line, ctx: Ctx): { cols: readonly Column[]; box: Box } => {
  const jc = get(el.style, "justify-content") ?? "normal";
  const warn = (msg: string): void => void ctx.diagnostics.report("W003", { message: msg, loc: el.loc });
  const aligned = (align: Align, which: (c: Column) => boolean = () => true): Column[] => cols.map((c) => (which(c) ? { ...c, align } : c));
  // content already sits at the start
  if (START_JC.includes(jc)) return { cols, box };
  if (line.wrap && jc.startsWith("space-")) {
    warn(`justify-content: ${jc} on a wrapping row is approximated as flex-start`);
    return { cols, box };
  }
  // the emitter text-aligns the wrapped lines, which moves them as a group like justify-content
  if (line.wrap && END_JC.includes(jc)) return { cols: aligned(jc === "center" ? "center" : "right"), box };
  if (SPACE_JC.includes(jc)) {
    const allGrow = cols.length > 0 && cols.every((c) => kind(c) === "grow");
    if (jc !== "space-between" && !allGrow) warn(`justify-content: ${jc} is approximated as space-between`);
    if (allGrow) return { cols, box };
    const spread = cols.map((c, i): Column => (kind(c) === "grow" || kind(c) === "pct" ? c : { ...c, align: i === 0 ? "left" : i === cols.length - 1 ? "right" : "center" }));
    return { cols: spread, box };
  }
  if (!END_JC.includes(jc)) {
    unsupported(el, ctx, "justify-content", jc);
    return { cols, box };
  }
  const align: Align = jc === "center" ? "center" : "right";
  // no free space to distribute
  if (cols.some((c) => kind(c) === "grow")) return { cols, box };
  if (cols.some((c) => kind(c) === "auto")) {
    // content-sized items packed together: a shrink-wrapped row placed like justify-content does
    const painted = isPaintedBox(box, true);
    const packs = !line.wrap && cols.every((c) => kind(c) === "auto" || kind(c) === "px");
    if (packs && !box.width && !box.maxWidth && !box.align && !painted) return { cols, box: { ...box, align } };
    // a set width or a painted box keeps its size; the emitter packs the cells inside it
    if (packs && (box.width || painted)) return { cols: aligned(align), box };
    warn(`justify-content: ${jc} with content-sized columns is approximated`);
    return { cols, box };
  }
  if (cols.length > 0 && cols.every((c) => kind(c) === "px")) {
    // a set width or a painted box keeps its size; the emitter packs the cells inside it
    if (box.width || isPaintedBox(box, false)) return { cols: aligned(align), box };
    const sum = cols.reduce((s, c) => s + ("px" in c.width ? c.width.px : 0), 0);
    const own = box.padding.left + box.padding.right + (box.border?.left?.width ?? 0) + (box.border?.right?.width ?? 0);
    return { cols: aligned(align), box: { ...box, width: { px: sum + (cols.length - 1) * line.gap + own }, align } };
  }
  // percentage columns: the share of the row can't be shrunk to the content
  warn(`justify-content: ${jc} with percentage columns is approximated`);
  return { cols: aligned(align, (c) => kind(c) === "px"), box };
};

const autoMargin = (it: Item, side: "left" | "right"): boolean => it.el?.style[`margin-${side}`] === "auto";

const reportWrapLimits = (el: StyledElement, cols: readonly Column[], items: readonly Item[], line: Line, ctx: Ctx): void => {
  if (!line.wrap) return;
  const warn = (msg: string): void => void ctx.diagnostics.report("W003", { message: msg, loc: el.loc });
  if (cols.some((c) => kind(c) === "auto")) warn("Outlook can't wrap auto-width items in a wrapping row; give them a px width or flex-basis");
  if (items.some((it) => autoMargin(it, "left") || autoMargin(it, "right"))) warn("auto margins on an item of a wrapping row are not supported and are ignored");
};

// auto margins: both sides centers the item; one side splits the free space, so every
// column after the gap goes right (the ones before stay left). Alignment already set wins.
const autoMarginAlign = (cols: readonly Column[], items: readonly Item[], line: Line): readonly Column[] => {
  if (line.wrap || cols.some((c) => kind(c) === "grow" || kind(c) === "pct")) return cols;
  const oneSided = items.findIndex((it) => autoMargin(it, "left") !== autoMargin(it, "right"));
  const boundary = oneSided < 0 ? Infinity : autoMargin(items[oneSided]!, "left") ? oneSided : oneSided + 1;
  return cols.map((c, i): Column => {
    if (c.align) return c;
    const it = items[i]!;
    if (autoMargin(it, "left") && autoMargin(it, "right")) return { ...c, align: "center" };
    return i >= boundary ? { ...c, align: "right" } : c;
  });
};

// Outlook's own cells go back where they stood; passes and emitters skip them (docs/support.md#outlook-only-content)
const msoColumnOf = (it: Item & { node: ConditionalNode }, line: Line, ctx: Ctx): Column => {
  const inner: Item = { ...it, node: it.node.child };
  const v = selfAlign(inner, ctx) ?? line.align;
  const { width, node: sized } = widthOf(inner, ctx, line.wrap);
  const { node, left, right } = liftSideMargins(sized);
  return { width, valign: VALIGN[v] ?? "top", ...cellPadding(left, right, line), child: { ...it.node, child: node } };
};

// The width an item declares itself, outer (padding and border included).
const ownWidth = (it: Item): { px?: number; pct?: number } | undefined => {
  const el = it.el;
  const w = el?.style["width"];
  if (!el || w === undefined) return undefined;
  if (w.endsWith("%")) return { pct: Number.parseFloat(w) };
  const px = pxOf(w);
  if (px === undefined) return undefined;
  return { px: get(el.style, "box-sizing") === "border-box" ? px : px + frameX(el) };
};

// Stacked, a column keeps the width of its own (not a basis: that is a height in a column), the
// side margins, and where align-items puts it when it has a width (block layout ignores align-items)
const stackItemOf = (el: StyledElement, it: Item, col: Column, align: string): StackItem => {
  const own = ownWidth(it);
  return {
    ...(own?.px !== undefined ? { cap: own.px } : {}),
    ...(own?.pct !== undefined ? { pct: own.pct } : {}),
    ...(own?.px !== undefined && el.stacked === "column" ? { place: ALIGN[align] } : {}),
    inset: { left: col.padding?.left ?? 0, right: col.padding?.right ?? 0 },
  };
};

export const rowOf = (el: StyledElement, all: readonly Item[], ctx: Ctx): Node => {
  // everything below (widths, gaps, justify-content) is worked out as if those items weren't there
  const items = all.filter((it) => !msoItem(it));
  const own = buildBox(el, ctx);
  const line = lineOf(el, ctx);
  const built = columnsOf(el, items, line, ctx);
  const cols = line.wrap ? built.cols : hideColumns(el, built.cols, items, ctx);
  const padded: Box = { ...own, padding: wrapPadding(el, own, cols, line, ctx) };
  reportGrowSharing(el, cols, line, ctx);
  const justified = justifyRow(el, cols, padded, line, ctx);
  reportWrapLimits(el, justified.cols, items, line, ctx);
  const placed = autoMarginAlign(justified.cols, items, line);
  const { box } = justified;

  // the Outlook-only items go back between the visible columns, in source order
  let seen = 0;
  const slots = all.map((it) => (msoItem(it) ? { column: msoColumnOf(it, line, ctx) } : { column: placed[seen]!, at: seen++ }));
  const stacked = el.stacked
    ? { stacked: { gap: gapPx(el, ctx, "row-gap"), items: slots.map((s) => (s.at === undefined ? undefined : stackItemOf(el, items[s.at]!, s.column, built.aligns[s.at]!))) } }
    : {};
  const row = withLoc<RowNode>({ kind: "row", box, gap: line.gap, wrap: line.wrap, cols: slots.map((s) => s.column), ...stacked }, el.loc);
  // nothing but Outlook-only items and a box that adds nothing: the row itself is Outlook's alone
  return all.length > 0 && items.length === 0 && isBareBox(box) ? withLoc<ConditionalNode>({ kind: "conditional", target: "mso", child: row }, el.loc) : row;
};

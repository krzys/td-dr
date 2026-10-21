import { negativeGap } from "../flex-items.ts";
import type { Ctx } from "../../ctx.ts";
import { emptyBox, withLoc, type Align, type Column, type Node, type RowNode, type StackNode, type VAlign } from "../../ir/index.ts";
import { get } from "../../style/props.ts";
import type { StyledElement } from "../../style/types.ts";
import { buildBox, isBareBox, reportDropped, reportRtlRow, withBox, withoutWidth } from "../box.ts";
import { analyzeItems } from "../children.ts";
import { isGrid, isTransparent } from "../classify.ts";
import { hideWrap } from "../hide.ts";
import { throughLink } from "../link-leaves.ts";
import { msoItem, reorder, type Item } from "../order.ts";
import { parseGrid } from "../lint.ts";
import type { Rule } from "../rule.ts";

// A simple grid: px / fr / % column tracks, items auto-placed in source order, one cell each.
// It becomes a stack of rows, one per implicit row, all with the same column widths so the
// columns line up; a short last row is padded with empty cells. Like a non-wrapping flex row,
// a grid does NOT stack on phones. For a grid that does, use flex-wrap with a px flex-basis.
// Placement (areas, spans, grid-column/row), auto-fill/minmax() and fixed row heights are
// E001 (see parseGrid in lint.ts and checkItem below).

const V: Readonly<Record<string, VAlign>> = {
  start: "top", "flex-start": "top", "self-start": "top", baseline: "top", stretch: "top", normal: "top",
  center: "middle", end: "bottom", "flex-end": "bottom", "self-end": "bottom",
};
const H: Readonly<Record<string, Align | undefined>> = {
  start: undefined, left: undefined, "flex-start": undefined, "self-start": undefined, stretch: undefined, normal: undefined,
  center: "center", end: "right", right: "right", "flex-end": "right", "self-end": "right",
};
const isStretch = (v: string): boolean => v === "stretch" || v === "normal";

// grid-gap and its longhands are the legacy names; nothing expands them, so read them here.
const legacyGap = (el: StyledElement, prop: "column-gap" | "row-gap"): string | undefined => {
  const own = get(el.style, `grid-${prop}`);
  if (own !== undefined) return own;
  const parts = (get(el.style, "grid-gap") ?? "").trim().split(/\s+/).filter(Boolean);
  return parts[prop === "row-gap" ? 0 : 1] ?? parts[0];
};

const gapPx = (el: StyledElement, ctx: Ctx, prop: "column-gap" | "row-gap"): number => {
  const modern = get(el.style, prop);
  const v = modern === undefined || modern === "normal" ? legacyGap(el, prop) : modern;
  if (v === undefined || v === "normal") return 0;
  const n = Number.parseFloat(v);
  if (Number.isFinite(n) && (v.endsWith("px") || n === 0)) return n < 0 ? negativeGap(el, ctx, prop, v) : n;
  ctx.diagnostics.report("E006", { message: `${prop}: ${v} is not supported, use px`, loc: el.loc });
  return 0;
};

// What the emitter can stretch: a full-width stack with no vertical margins.
const cellPaintable = (n: Node): boolean =>
  n.kind === "stack" && !n.box.width && !n.box.maxWidth && !n.box.align && !n.box.margin.top && !n.box.margin.bottom;

const hasBg = (it: Item): boolean => {
  const bg = it.el?.style["background-color"];
  return (bg !== undefined && !isTransparent(bg)) || ("box" in it.node && !!it.node.box.background);
};

const painted = (it: Item): boolean =>
  hasBg(it) || ("box" in it.node && (!!it.node.box.radius || Object.values(it.node.box.border ?? {}).some((b) => !!b?.width)));

// unknown keywords are E007, like flex's align-items; auto defers to the container
const keyword = (el: StyledElement, ctx: Ctx, prop: string, table: Readonly<Record<string, unknown>>): string | undefined => {
  const v = get(el.style, prop);
  if (v === undefined || v === "auto") return undefined;
  if (v in table) return v;
  ctx.diagnostics.report("E007", { message: `${prop}: ${v} is not supported`, loc: el.loc });
  return undefined;
};

// place-items / place-self: "<align> [<justify>]"; nothing expands them yet
const placed = (el: StyledElement, ctx: Ctx, prop: "place-items" | "place-self", axis: 0 | 1, table: Readonly<Record<string, unknown>>): string | undefined => {
  const parts = (get(el.style, prop) ?? "").trim().split(/\s+/).filter(Boolean);
  const v = parts[axis] ?? parts[0];
  if (v === undefined || v === "auto") return undefined;
  if (v in table) return v;
  ctx.diagnostics.report("E007", { message: `${prop}: ${v} is not supported`, loc: el.loc });
  return undefined;
};

// free-space distribution isn't modelled; flex's checkUnsupported does the same
const unsupported = (el: StyledElement, ctx: Ctx, prop: string, value: string, hint?: string): void =>
  void ctx.diagnostics.report("E007", { message: `${prop}: ${value} is not supported on a grid`, ...(hint ? { hint } : {}), loc: el.loc });

const PLACEMENT = /^grid-(area|column|row)(-start|-end)?$/;

const checkItem = (el: StyledElement, ctx: Ctx): void => {
  for (const [p, v] of Object.entries(el.declared)) {
    if (!PLACEMENT.test(p) || v === "auto" || v === "auto / auto" || v === "span 1") continue;
    ctx.diagnostics.report("E001", {
      message: `${p}: ${v} is not supported`,
      hint: "Items are placed in source order, one cell each; reorder the HTML instead of placing or spanning.",
      loc: el.loc,
    });
  }
};

// Grid props this rule reads (or reports itself); anything else goes through reportDropped.
const READ: ReadonlySet<string> = new Set([
  "grid-template-columns", "grid-template-rows", "grid-auto-flow", "grid-auto-rows", "grid-auto-columns",
  "grid-gap", "grid-row-gap", "grid-column-gap", "justify-items", "place-items", "justify-content", "align-content",
]);

const emptyCell = (): Node => ({ kind: "stack", box: emptyBox(), children: [], gap: 0, collapse: false });

export const gridRule: Rule = {
  name: "grid",
  matches: (el) => isGrid(el),
  analyze: throughLink((el, ctx, recurse) => {
    const all: Item[] = reorder(analyzeItems(el, ctx, recurse), (it, v, why) => unsupported(it, ctx, "order", v, why));
    // data-email="outlook-only" cells take no place in the grid; they ride along as Outlook-only cells
    const items = all.filter((it) => !msoItem(it));
    if (get(el.style, "display") === "inline-grid") {
      ctx.diagnostics.report("W003", { message: "inline-grid is laid out as a block-level grid", hint: "Text around it moves to its own lines; use display: grid and put the text inside.", loc: el.loc });
    }
    reportDropped({ ...el, declared: Object.fromEntries(Object.entries(el.declared).filter(([p]) => !READ.has(p))) }, ctx);
    for (const p of ["justify-content", "align-content"]) {
      const v = get(el.style, p);
      if (v !== undefined && !["normal", "start", "stretch", "flex-start"].includes(v)) unsupported(el, ctx, p, v);
    }
    const box = buildBox(el, ctx);
    const widths = parseGrid(el).cols;
    reportRtlRow(el, ctx, Math.min(widths.length, items.length));
    // beside a px column the emitter lets fr columns take what's left by content, not by ratio, and
    // every row is its own table, so the columns can drift apart between rows
    if (widths.some((w) => "px" in w) && widths.filter((w) => "grow" in w).length > 1) {
      ctx.diagnostics.report("W003", {
        message: "fr columns beside a px column are sized by their content, not by their fr ratio",
        hint: "Rows are separate tables, so such columns may not line up across rows. Use px or % for every column, or a single fr column.",
        loc: el.loc,
      });
    }
    const colGap = gapPx(el, ctx, "column-gap");
    const rowGap = gapPx(el, ctx, "row-gap");
    // "normal" is the initial value, so it must not hide a place-items shorthand
    const explicit = (v: string | undefined): string | undefined => (v === "normal" ? undefined : v);
    const alignItems = explicit(keyword(el, ctx, "align-items", V)) ?? placed(el, ctx, "place-items", 0, V) ?? "normal";
    const justifyItems = explicit(keyword(el, ctx, "justify-items", H)) ?? placed(el, ctx, "place-items", 1, H) ?? "normal";
    if (alignItems === "baseline") ctx.diagnostics.report("W003", { message: "align-items: baseline is approximated as top", loc: el.loc });

    // An Outlook-only cell sits right after the visible cell before it in the same row, with no track
    // of its own (`lead`: before the first one). Other clients never see it.
    const after = new Map<number, Column[]>();
    const lead: Column[] = [];
    let visible = 0;
    for (const it of all) {
      if (msoItem(it) && it.el) checkItem(it.el, ctx);
      if (!msoItem(it)) visible++;
      else if (visible === 0) lead.push({ width: { auto: true }, valign: "top", child: it.node });
      else after.set(visible - 1, [...(after.get(visible - 1) ?? []), { width: { auto: true }, valign: "top", child: it.node }]);
    }

    const rows: RowNode[] = [];
    const stacked = el.stacked ? { stacked: { gap: rowGap } } : {};
    for (let start = 0; start < items.length; start += widths.length) {
      const line = items.slice(start, start + widths.length);
      const cols: Column[] = widths.map((width, i) => {
        const it = line[i];
        if (!it) return { width, valign: "top", child: emptyCell() };
        const own = it.el;
        const loc = own?.loc ?? el.loc;
        if (own) checkItem(own, ctx);
        if (it.hide && start + i < items.length - 1) {
          ctx.diagnostics.report("W014", {
            message: "an item hidden on some screens leaves its track empty, so the items after it don't move up",
            hint: "A grid fills a display:none item's cell with the next item; a table keeps it empty. Hide the last item, or place the items in explicit cells.",
            loc,
          });
        }
        const va = (own && (keyword(own, ctx, "align-self", V) ?? placed(own, ctx, "place-self", 0, V))) || alignItems;
        const ha = (own && (keyword(own, ctx, "justify-self", H) ?? placed(own, ctx, "place-self", 1, H))) || justifyItems;
        if (own && va === "baseline" && va !== alignItems) ctx.diagnostics.report("W003", { message: "align-self: baseline is approximated as top", loc });
        // a sized item keeps its width inside the track; a full-width one is just the cell
        const w = "box" in it.node ? it.node.box.width : undefined;
        const full = "box" in it.node && !!w && "pct" in w && w.pct === 100;
        const node = full && "box" in it.node ? withBox(it.node, withoutWidth(it.node.box)) : it.node;
        if (isStretch(va) && line.length > 1 && hasBg(it) && !cellPaintable(node)) {
          ctx.diagnostics.report("W003", { message: "shorter items' backgrounds won't stretch", hint: "Only full-width boxes can stretch to the row's height in email; align the items to the top.", loc });
        }
        const align = H[ha];
        // a cell can place a sized box, but not shrink one to its content
        if (!isStretch(ha) && !(w && !("pct" in w && w.pct === 100)) && painted(it)) {
          ctx.diagnostics.report("W003", { message: `justify: ${ha} would not shrink this item's box`, hint: "The painted box still fills its column; give the item a px width to size and place it.", loc });
        }
        return {
          width,
          valign: V[va] ?? "top",
          ...(align ? { align } : {}),
          ...(isStretch(va) && cellPaintable(node) ? { stretch: true } : {}),
          // an empty track stays where an item is display:none, so the column keeps its cell and width
          child: it.hide ? hideWrap(node, it.hide, own?.loc) : node,
        };
      });
      const withOutlook = cols.flatMap((c, i) => [...(start === 0 && i === 0 ? lead : []), c, ...(line[i] ? (after.get(start + i) ?? []) : [])]);
      rows.push(withLoc<RowNode>({ kind: "row", box: emptyBox(), gap: colGap, wrap: false, cols: withOutlook, ...stacked }, el.loc));
    }
    if (rows.length === 0 && lead.length > 0) {
      rows.push(withLoc<RowNode>({ kind: "row", box: emptyBox(), gap: colGap, wrap: false, cols: lead, ...stacked }, el.loc));
    }
    const grid = withLoc<StackNode>({ kind: "stack", box, children: rows, gap: rowGap, collapse: false }, el.loc);
    // only Outlook-only cells and a box that adds nothing: the grid itself is Outlook's alone
    return all.length > 0 && items.length === 0 && isBareBox(box) ? withLoc<Node>({ kind: "conditional", target: "mso", child: grid }, el.loc) : grid;
  }),
};

// flex-wrap rows as fluid-hybrid columns (docs/layout.md#fluid-hybrid-columns-wrapping-rows) with an Outlook
// ghost table per line (docs/outlook.md#ghost-tables).
import { columnCap, contentWidth, floorPct, isOutlookOnlyCol, resolvedWidthOf, type Align, type Column, type ConditionalNode, type Node, type RowNode } from "../ir/index.ts";
import { HIDE_DECLS, paddingValue, styleString } from "./attrs.ts";
import { ghostCell, ghostCellOpen, ghostClose, ghostRowOpen, ifNotMso, msoOnly, shownCols } from "./mso.ts";
import { open, wrap } from "./serialize.ts";
import { cellTextDecls } from "./text.ts";
import type { TraceScope } from "./trace.ts";

const EPS = 0.01;

// Wrapped lines of one row share a text-align, which is how justify-content moves them as a group.
const rowAlign = (all: Column[]): Align => {
  const cols = shownCols(all);
  const a = cols[0]?.align;
  return (a === "center" || a === "right") && cols.every((c) => c.align === a) ? a : "left";
};

// The browser breaks lines where the columns stop fitting; Outlook can't, so its ghost
// tables are cut at the same places (otherwise it would run one wide row off the page).
const linesOf = (cols: Column[], inner: number): Column[][] => {
  if (shownCols(cols).some((c) => !c.resolved)) return [cols];
  const lines: Column[][] = [];
  let used = 0;
  for (const c of cols) {
    // an Outlook-only item is no wider than the line it joins as far as other clients go
    const w = isOutlookOnlyCol(c) ? 0 : c.resolved!.px;
    if (lines.length === 0 || used + w > inner + EPS) {
      lines.push([]);
      used = 0;
    }
    lines.at(-1)!.push(c);
    used += w;
  }
  return lines;
};

const textDecls = (n: Node): Array<readonly [string, string]> => (n.kind === "inline" ? cellTextDecls(n) : []);


// A % or calc() column keeps its share of the line at every width, so it stays beside its neighbour
// on a phone like the source does; everything else is a cap that stacks when the line is narrower.
// A share column with a max-width the share outgrows keeps both (width:P%; max-width:Npx), as the
// source's min(P%, max-width) does.
const column = (s: TraceScope, c: Column, emitChild: (n: Node) => string, inner: number): string => {
  const px = c.resolved?.px;
  const fixed = px !== undefined;
  const share = fixed && ("pct" in c.width || "calc" in c.width) && !!inner;
  const cap = columnCap(c);
  const capped = share && cap !== undefined && cap < (c.resolved!.pct / 100) * inner - 0.5;
  const pct = share ? (capped ? floorPct(c.resolved!.pct) : floorPct((px / inner) * 100)) : undefined;
  const div = open(s, "div", [
    ["class", "tddr-col"],
    [
      "style",
      styleString([
        ["display", c.hidden ? "none" : "inline-block"],
        ["vertical-align", c.valign],
        ["width", pct !== undefined ? `${pct}%` : fixed ? "100%" : undefined],
        ["max-width", fixed && (pct === undefined || capped) ? `${px}px` : undefined],
        // docs/email-shell.md#preheader: hidden on some screens only; Outlook gets neither the content nor the box
        ...(c.hidden ? HIDE_DECLS.filter(([p]) => p !== "display") : []),
      ]),
    ],
  ]);
  // the row is font-size:0 to kill the inline-block gaps, so every cell sets its size back
  const own = c.child.kind === "inline" ? c.child.restated : undefined;
  const text = { ...(own?.["font-size"] ? {} : { "font-size": "16px" }), ...(own?.["text-align"] ? {} : { "text-align": "left" }), ...Object.fromEntries(textDecls(c.child)) };
  const cell = wrap(
    s,
    "td",
    [["style", styleString([["padding", c.padding ? paddingValue(c.padding) : undefined], ...Object.entries(text)])]],
    c.child.kind === "inline" ? c.child.html : `\n${emitChild(c.child)}\n`,
  );
  const table = open(s, "table", [
    ["role", "presentation"],
    ["width", fixed ? "100%" : undefined],
    ["cellpadding", "0"],
    ["cellspacing", "0"],
    ["border", "0"],
    ["style", fixed ? "width:100%;" : undefined],
  ]);
  const body = `${table}\n<tr>\n${cell}\n</tr>\n</table>`;
  return `${div}\n${c.hidden ? ifNotMso(body) : body}\n</div>`;
};

export const emitFluidRow = (
  s: TraceScope,
  row: RowNode,
  emitChild: (n: Node) => string,
  outlookOnly: (n: ConditionalNode, html: string) => string = (_, html) => msoOnly(html),
): { html: string; css: string[] } => {
  const { box } = row;
  const inner = contentWidth(box, resolvedWidthOf(row));
  const align = rowAlign(row.cols);
  const parts = linesOf(row.cols, inner).map((line) => {
    // exact % widths round to the nearest pixel (per line: a line is a separate ghost table, so one
    // line's rounding never has to agree with its neighbour's), but never to more than the row holds
    const round = shownCols(line).reduce((s, c) => s + Math.round(c.resolved?.px ?? 0), 0) > Math.floor(inner + EPS) ? Math.floor : Math.round;
    const widths = line.map((c) => (c.resolved ? round(c.resolved.px + 1e-6) : undefined));
    const known = widths.reduce<number>((s, w) => s + (w ?? 0), 0);
    // with an unknown width Word spreads the leftover room over the auto cells, so no table width then
    const tableWidth = widths.every((w) => w !== undefined) ? known : undefined;
    const cols = line.map((c, i) => {
      if (c.child.kind !== "conditional" || !isOutlookOnlyCol(c)) return `${ghostCell(widths[i], c.valign, i === 0)}${column(s, c, emitChild, inner)}`;
      // other clients get neither the column nor its ghost cell: both sit in one conditional
      return outlookOnly(c.child, `${ghostCellOpen(widths[i], c.valign, i === 0)}${column(s, { ...c, child: c.child.child }, emitChild, inner)}`);
    });
    return `${ghostRowOpen(tableWidth, align === "left" ? undefined : align)}${cols.join("")}${ghostClose()}`;
  });
  const style = styleString([["font-size", "0"], ["text-align", align]]);
  // No media query: forcing max-width:100% on phones would stretch columns whose source keeps a fixed width there.
  return { html: `<div style="${style}">${parts.join("")}</div>`, css: [] };
};

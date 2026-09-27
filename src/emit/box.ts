// The table and cell a box is written as: sizing, alignment, paint (and its VML photo), clip, ghost.
import { borderX, borderY, insetX, insetY, resolvedWidthOf, type Box, type RowNode, type StackNode, type VAlign } from "../ir/index.ts";
import { borderDecls, HIDE_DECLS, imageDecls, legacyColor, paddingValue, radiusValue, styleString, type Attrs, type Decls } from "./attrs.ts";
import type { EmitContext } from "./context.ts";
import { ghostClose, ghostOpen, ifNotMso, vmlBackgroundClose, vmlBackgroundOpen } from "./mso.ts";
import { tableOpen, tr, withBody, wrap } from "./serialize.ts";
import type { TraceScope } from "./trace.ts";

// What goes inside a box cell, and the text declarations the cell takes on for it.
export type CellContent = { decls: ReadonlyArray<readonly [string, string]>; html: string };

// Fixed layout has no content width to measure, so only blocks outside every row column use it.
export const blockLayout = (e: EmitContext): Decls => [["table-layout", e.contentSized ? undefined : "fixed"]];

// A block takes its width from its parent, never from its content: fixed layout keeps a stack's single
// column at the box width, so a row too wide for a phone overflows instead of widening the email.
export const tableTag = (s: TraceScope, b: Box, opts: { roundedCells?: boolean; fixed?: boolean } = {}): string => {
  const w = b.width;
  const widthAttr = w ? ("px" in w ? String(w.px) : `${w.pct}%`) : "100%";
  const widthCss = w ? ("px" in w ? `${w.px}px` : `${w.pct}%`) : "100%";
  return tableOpen(
    s,
    widthAttr,
    [
      ["width", widthCss],
      ["max-width", b.maxWidth ? `${b.maxWidth}px` : undefined],
      // a centered fluid table has no fixed width to center by attribute alone
      ["margin", b.align === "center" && !(w && "px" in w) ? "0 auto" : undefined],
      // browsers ignore border-radius on cells of a collapsed table (the shell's reset)
      ["border-collapse", b.radius || opts.roundedCells ? "separate" : undefined],
      // a px-wide box already has its width; its cell's width plus padding would grow a fixed table
      ["table-layout", opts.fixed && !(w && "px" in w) ? "fixed" : undefined],
    ],
    b.align,
  );
};

// A td's height is its content height; the IR's min-height is the whole painted box.
export const cellHeight = (b: Box): number | undefined =>
  b.minHeight
    ? Math.max(0, b.minHeight - insetY(b))
    : undefined;

const boxDecls = (b: Box, px?: number): Decls => [
  ["width", px ? `${px}px` : undefined],
  ["padding", paddingValue(b.padding)],
  ["background-color", b.background],
  ...imageDecls(b),
  ...borderDecls(b.border),
  ["border-radius", radiusValue(b)],
  // a td's height is a minimum, which is what min-height means
  ["height", cellHeight(b) ? `${cellHeight(b)}px` : undefined],
  ...(b.hide === "hidden" ? HIDE_DECLS : []),
];

// Cell that carries the box: padding, background, borders, radius (and the px width, like any fixed-width cell).
// A background photo also gets Outlook's VML: the cell then holds a padded inner table instead of the padding itself.
// `place`: where a min-height box puts its content.
export const boxCell = (e: EmitContext, n: StackNode | RowNode, content: CellContent, place: VAlign = "top"): string => {
  const b = n.box;
  const px = b.width && "px" in b.width ? b.width.px : undefined;
  const width = px ?? resolvedWidthOf(n);
  // Outlook doesn't carry a td's display:none to the tables inside it, so they aren't written for it
  const body = b.hide === "hidden" ? ifNotMso(content.html) : content.html;
  let inner = body;
  let extra = content.decls;
  // docs/layout.md#clipping-overflow-hidden-and-rounded-corners: a fixed-layout table gives the inner cell the box's width whatever
  // its content, and that cell cuts off what is wider. The text styles move in with the content.
  if (b.clip) {
    const cell = wrap(e, "td", [["style", styleString([["overflow", "hidden"], ["white-space", "nowrap"], ...content.decls.filter(([p]) => p !== "white-space")])]], body);
    const clipped = Math.max(0, width - insetX(b)); // a box narrower than its own padding has no room left
    inner = `\n${withBody(tableOpen(e, clipped ? String(clipped) : "100%", [["width", "100%"], ["table-layout", "fixed"]]), tr(cell))}\n`;
    extra = [];
  }
  const url = b.backgroundImage?.url;
  const attrs = (cell: Box, decls: Decls): Attrs => [
    ["width", px],
    ["bgcolor", legacyColor(b.background)],
    ["background", url],
    ["height", cellHeight(cell)],
    ["valign", b.minHeight ? place : undefined],
    ["style", styleString(decls)],
  ];
  // VML needs a px box: a rect without a height is a guess (docs/outlook.md#vml-background-images says to skip it)
  if (url === undefined || !b.minHeight) {
    if (url !== undefined) {
      e.ctx.diagnostics.report("W001", {
        message: "Outlook shows the background colour; set a px min-height to get the photo in Outlook",
        hint: "Outlook draws a background photo through VML, which needs a px width and height.",
        loc: n.loc,
      });
    }
    return wrap(e, "td", attrs(b, [...boxDecls(b, px), ...extra]), inner);
  }

  const img = b.backgroundImage!;
  const padded = wrap(e, "td", [["style", styleString([["padding", paddingValue(b.padding)], ...extra])]], inner);
  const table = withBody(tableOpen(e, "100%", [["width", "100%"], ...blockLayout(e)]), tr(padded));
  // tile only what CSS would repeat at its own size; a stretched or single photo is a frame
  const tile = /^(repeat|repeat-x|repeat-y)?$/.test(img.repeat ?? "") && !/cover|contain|100%/.test(img.size ?? "");
  const color = legacyColor(b.background);
  const vml = {
    src: url,
    ...(color ? { color } : {}),
    width: width - borderX(b),
    height: b.minHeight - borderY(b),
    tile,
  };
  const bare = { ...b, padding: { top: 0, right: 0, bottom: 0, left: 0 } };
  return wrap(e, "td", attrs(bare, boxDecls(bare, px)), `${vmlBackgroundOpen(vml)}\n${table}\n${vmlBackgroundClose()}`);
};

// docs/outlook.md#ghost-tables: Outlook ignores max-width, so a capped box gets a fixed-width ghost table.
// `skip`: the shell's own ghost already holds it.
export const ghosted = (e: EmitContext, n: StackNode | RowNode, table: string, skip: boolean): string => {
  const b = n.box;
  if (!b.maxWidth || skip) return table;
  const w = Math.min(resolvedWidthOf(n), b.maxWidth, e.pageWidth);
  return w >= e.pageWidth ? table : `${ghostOpen(w, b.align)}\n${table}\n${ghostClose()}`;
};

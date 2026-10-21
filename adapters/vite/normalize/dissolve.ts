// Plain wrapper tables dissolve: their padding joins the cell around them, or becomes the outside
// gap of the painted cell they wrap (docs/templates.md#spacing-around-blocks).
import { children, isComment, isElement, type DomElement, type DomNode } from "../../../src/parse/dom.ts";
import { add, adopt, CELL, gapOf, type Gaps, kidsOf, only, paddingOf, painted, paints, plainTable, SECTION, setGap, setPadding, spansRows, styleOf } from "./boxes.ts";

const WRAPPER_ATTRS: Record<string, string> = { border: "0", cellpadding: "0", cellspacing: "0", role: "presentation", width: "100%" };

// one cell, no borders: neither changes anything; a fixed layout is checked on its own
const SAME_IN_ONE_CELL = new Set(["table-layout", "border-collapse"]);

// A fixed layout keeps wide content from widening the table. Flat, the content is held the same way
// only by an outer table with a fixed layout and a width (without one the layout is auto).
const fixedLayout = (t: DomElement | undefined): boolean =>
  !!t &&
  styleOf(t).some(([p, v]) => p === "table-layout" && v.toLowerCase() === "fixed") &&
  ("width" in t.attribs || styleOf(t).some(([p, v]) => p === "width" && v !== "auto"));

// the table a cell sits in, through its row and section
const tableOf = (td: DomElement): DomElement | undefined => {
  const tr = td.parent;
  const rows = tr && isElement(tr) ? tr.parent : undefined;
  const table = rows && isElement(rows) ? rows.parent : undefined;
  return table && isElement(table) && table.name === "table" ? table : undefined;
};

// padding on a cell that sits in a table which doesn't add its own (cellpadding, borders)
const inPlainTable = (td: DomElement): boolean => {
  const table = tableOf(td);
  return !!table && plainTable(table);
};

// a cell with nothing but padding: no attributes, no inherited text styles to lose, not a header (bold, centred)
const bareCell = (td: DomElement): boolean =>
  td.name === "td" &&
  !paints(td) &&
  paddingOf(td) !== undefined &&
  Object.keys(td.attribs).every((k) => k === "style") &&
  styleOf(td).every(([p]) => p.startsWith("padding"));

// the one cell of a plain full-width table that is only a wrapper; one without width shrinks to its content
const wrapped = (td: DomElement): DomElement | undefined => {
  const table = only(td, ["table"]);
  if (!table || !plainTable(table)) return undefined;
  if (!Object.entries(table.attribs).every(([k, v]) => k === "style" || WRAPPER_ATTRS[k] === v)) return undefined;
  const style = styleOf(table);
  if (!style.every(([p, v]) => (p === "width" && v === "100%") || SAME_IN_ONE_CELL.has(p))) return undefined;
  if (table.attribs["width"] !== "100%" && !style.some(([p]) => p === "width")) return undefined;
  if (fixedLayout(table) && !fixedLayout(tableOf(td))) return undefined;
  const rows = only(table, SECTION);
  const tr = rows && only(rows, ["tr"]);
  const cell = tr && only(tr, CELL);
  // its section and row add nothing (paint, hiding, alignment); markup for MSO inside it may depend on it
  if (!rows || !tr || !cell || Object.keys(rows.attribs).length || Object.keys(tr.attribs).length || children(cell).some(isComment)) return undefined;
  return cell;
};

// Text styles that a nested table may not pass on (Outlook; any browser in quirks mode), mso-* only
// Outlook reads, a class a head rule may restyle: on the cell, its row, its section or its table, they
// would reach content moved out of the wrapper differently. A table's own align only places it.
const KEEPS_OUTER = /^(?:font|color|text-|letter-spacing|word-spacing|white-space|direction|line-height|mso-)/;
const TEXT_ATTRS = ["align", "dir", "class", "nowrap"];
const keepsText = (el: DomNode | null | undefined, attrs: string[]): boolean =>
  !!el && isElement(el) && (attrs.some((a) => a in el.attribs) || styleOf(el).some(([p]) => KEEPS_OUTER.test(p)));
const keepsOuter = (td: DomElement): boolean =>
  keepsText(td, TEXT_ATTRS) || keepsText(td.parent, TEXT_ATTRS) || keepsText(td.parent?.parent, TEXT_ATTRS) || keepsText(tableOf(td), ["dir", "class"]);

// an own width means something different in a one-cell table than as a column
const widthy = (el: DomElement): boolean => "width" in el.attribs || styleOf(el).some(([p]) => p === "width");

const sized = (el: DomElement): boolean => "height" in el.attribs || styleOf(el).some(([p]) => /^(?:min-|max-)?height$|^line-height$/.test(p));

// the cell's own padding grows by the padding of the bare wrapper cells inside it
const merge = (el: DomElement): void => {
  let box = paddingOf(el);
  // a header's text is bold and centred, which content moved into it would take on
  const open = box && el.name === "td" && !sized(el) && !keepsOuter(el);
  let w = open ? wrapped(el) : undefined;
  while (w && box && bareCell(w)) {
    box = add(box, paddingOf(w)!);
    adopt(el, [...children(w)]);
    setPadding(el, box);
    w = wrapped(el);
  }
  // one spelling, so a cell that merged and one that didn't still compare
  if (box && styleOf(el).some(([p]) => p.startsWith("padding"))) setPadding(el, box);
};

const spanning = (td: DomElement): boolean => (td.attribs["rowspan"] ?? "1") !== "1" || (td.attribs["colspan"] ?? "1") !== "1";

// An unpainted cell holding only a painted cell: the painted cell takes its place, the padding is its gap.
// Only where nothing can stretch the row past the box, which would then paint all of it: no other
// column, no rowspan reaching into the row, no height or paint on the row, no span on the box.
const hoist = (tr: DomElement, gaps: Gaps): void => {
  const section = tr.parent;
  if (kidsOf(tr).length !== 1 || Object.keys(tr.attribs).length || !section || !isElement(section) || spansRows(section)) return;
  adopt(
    tr,
    children(tr).map((p) => {
      if (!isElement(p) || !bareCell(p) || !inPlainTable(p) || keepsOuter(p)) return p;
      const w = wrapped(p);
      if (!w || !painted(gaps, w) || widthy(w) || spanning(w)) return p;
      setGap(gaps, w, add(gapOf(gaps, w), paddingOf(p)!));
      return w;
    }),
  );
};

// In place, innermost first, on a tree normalize() owns; the gaps it makes go into `gaps`.
export const dissolveWrappers = (el: DomElement, gaps: Gaps): void => {
  for (const c of children(el)) if (isElement(c)) dissolveWrappers(c, gaps);
  if (CELL.includes(el.name) && inPlainTable(el)) merge(el);
  if (el.name === "tr") hoist(el, gaps);
};

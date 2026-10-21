// Between stacked single-cell rows a reader sees the sum of the two gaps, so it is kept on the upper row.
import { children, isElement, type DomElement } from "../../../src/parse/dom.ts";
import { blank, type Box, CELL, gapOf, type Gaps, only, paddingOf, painted, paints, plainTable, setGap, setPadding, spansRows } from "./boxes.ts";

// A head rule may restyle what has a class (hide a row, pad a cell for narrow screens), so it keeps
// its own padding. A painted cell's class reaches its box, not the space outside it.
const pinned = (el: DomElement): boolean => "class" in el.attribs;

// In place, on a tree normalize() owns, after dissolveWrappers made `gaps`.
export const foldGaps = (el: DomElement, gaps: Gaps): void => {
  // the one cell of a row that is nothing else, plain or painted
  const soleCell = (tr: DomElement): DomElement | undefined => {
    if (tr.name !== "tr" || paints(tr) || pinned(tr)) return undefined;
    const td = only(tr, CELL);
    return td && (painted(gaps, td) || (paddingOf(td) && !pinned(td))) ? td : undefined;
  };
  // the space above and below a cell: its padding when it paints nothing, else what sits outside it
  const spaceOf = (td: DomElement): Box => (painted(gaps, td) ? gapOf(gaps, td) : paddingOf(td)!);
  const setSpace = (td: DomElement, box: Box): void => (painted(gaps, td) ? setGap(gaps, td, box) : setPadding(td, box));

  let run: DomElement[] = [];
  const flush = (): void => {
    const boxes = run.map(spaceOf);
    for (let i = 1; i < run.length; i++) {
      boxes[i - 1]![2] += boxes[i]![0];
      boxes[i]![0] = 0;
    }
    if (run.length > 1) run.forEach((td, i) => setSpace(td, boxes[i]!));
    run = [];
  };
  for (const c of children(el)) if (isElement(c)) foldGaps(c, gaps);
  const table = el.name === "table" ? el : el.name === "tbody" && el.parent && isElement(el.parent) ? el.parent : undefined;
  if (!table || !plainTable(table) || spansRows(el)) return;
  // a comment (MSO ghost markup, a template's own) or anything but a plain row ends the run
  for (const c of children(el)) {
    if (blank(c)) continue;
    const td = isElement(c) ? soleCell(c) : undefined;
    if (td) run.push(td);
    else flush();
  }
  flush();
};

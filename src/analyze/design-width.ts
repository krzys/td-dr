// The email's own root container decides the design width (docs/layout.md#design-width).
import { transparentColour } from "./box.ts";
import { INLINE_TAGS, isTextBlock } from "./classify.ts";
import type { Ctx, WidthDecision } from "../ctx.ts";
import { locKey } from "../ir/index.ts";
import { get } from "../style/props.ts";
import type { StyledElement, StyledNode } from "../style/types.ts";

const LAYOUT_DISPLAY: ReadonlySet<string> = new Set(["block", "flow-root", "flex", "grid", "table", "list-item"]);
const FLOWS: ReadonlySet<string> = new Set(["block", "flow-root", "list-item"]);
const PX = /^(\d+(?:\.\d+)?)px$/;

const px = (v: string | undefined): number | undefined => {
  const m = v === undefined ? undefined : PX.exec(v.trim());
  return m ? Number(m[1]) : undefined;
};

const NOT_LAYOUT = new Set(["preheader", "outlook-only"]);
const hiddenTag = (el: StyledElement): boolean => NOT_LAYOUT.has(el.attrs["data-email"] ?? "");

// Could size the email: a block-level box, text blocks included.
const candidate = (el: StyledElement): boolean =>
  LAYOUT_DISPLAY.has(get(el.style, "display") ?? "inline") && (!INLINE_TAGS.has(el.tag) || el.tag === "a") && !hiddenTag(el);

// Made of layout, so it can be walked through.
const layoutBlock = (el: StyledElement): boolean => candidate(el) && (el.tag === "table" || !isTextBlock(el));

// a table's width attribute is already border-box
const attrWidth = (el: StyledElement): number | undefined => {
  const m = el.tag === "table" ? /^\s*(\d+)(?:px)?\s*$/.exec(el.attrs["width"] ?? "") : null;
  return m && Number(m[1]) >= 1 ? Number(m[1]) : undefined;
};

// Border-box width, like the Box rule computes it.
// A vw width is the viewport's, not the email's, so it is no candidate.
const widthOf = (el: StyledElement): number | undefined => {
  const sizes = (["max-width", "width"] as const).filter((p) => !el.vwProps?.has(p)).map((p) => px(el.style[p])).filter((v) => v !== undefined);
  if (sizes.length === 0) return attrWidth(el);
  const w = Math.min(...sizes);
  const extra = get(el.style, "box-sizing") === "border-box" ? 0 : (["left", "right"] as const).reduce(
    (sum, s) => sum + (px(el.style[`padding-${s}`]) ?? 0) + (px(el.style[`border-${s}-width`]) ?? 0), 0);
  const total = Math.round(w + extra);
  return total >= 1 ? total : undefined;
};

type Root = { width: number; el: StyledElement; parent: StyledElement };

// Which element of the source an element is, for handing the decision to the analyzer (which sees another
// cascade of the same document): its loc, and for a ::before / ::after, which shares its host's loc, which
// of the host's generated children it is.
export const identityKey = (el: StyledElement, parent: StyledElement | undefined): string | undefined => {
  if (!el.loc) return undefined;
  const key = locKey(el.loc);
  if (!parent?.loc || locKey(parent.loc) !== key) return key;
  const generated = parent.children.filter((c) => c.type === "element" && c.loc && locKey(c.loc) === key);
  return `${key}#${generated.indexOf(el)}`;
};
type Found = { roots: Root[]; floor: boolean };

const DEFAULT = 600;

const skipped = (n: StyledNode): boolean =>
  n.type === "comment" ||
  (n.type === "text" && n.text.trim() === "") ||
  (n.type === "element" && (get(n.style, "display") === "none" || hiddenTag(n)));

// Only a block made of nothing but layout blocks is walked through. Text, inline content or an
// image make it content, and a small badge inside it is not the email's width. Flex and grid
// children are items, not roots.
// A sized text block counts as a candidate root; an unsized one is content.
const holdsLayout = (el: StyledElement): boolean =>
  el.children.every((c) => skipped(c) || (c.type === "element" && (layoutBlock(c) || (candidate(c) && widthOf(c) !== undefined))));
const wrapper = (el: StyledElement): boolean => FLOWS.has(get(el.style, "display") ?? "") && holdsLayout(el);

const zero = (v: string | undefined): boolean => v === undefined || /^(0|0px|none|)$/.test(v.trim());

const painted = (el: StyledElement): boolean =>
  ["border-left-width", "border-right-width", "padding-left", "padding-right", "background-image"].some((p) => !zero(el.style[p])) ||
  (!zero(el.style["background-color"]) && !transparentColour(el.style["background-color"]!.trim())) ||
  !zero(el.attrs["bgcolor"]) ||
  (el.tag === "table" && ["cellpadding", "border"].some((a) => /^[1-9]/.test(el.attrs[a] ?? "")));

const centred = (el: StyledElement, inCenter: boolean): boolean =>
  inCenter || (el.style["margin-left"] === "auto" && el.style["margin-right"] === "auto") || (el.tag === "table" && el.attrs["align"] === "center");

// table > tbody > tr > one td: the classic skeleton's outer layer.
const soleCell = (t: StyledElement): StyledElement | undefined => {
  const live = (el: StyledElement): StyledElement[] => el.children.filter((c): c is StyledElement => c.type === "element" && !skipped(c));
  if (t.tag !== "table") return undefined;
  const [body, ...more] = live(t);
  const rows = body?.tag === "tbody" && more.length === 0 ? live(body) : body ? [body, ...more] : [];
  const cells = rows.length === 1 && rows[0]!.tag === "tr" ? live(rows[0]!) : [];
  return cells.length === 1 && cells[0]!.tag === "td" ? cells[0] : undefined;
};

// Anything the walk meets that is not a centred sized root still fills the column in a browser,
// so it adds a default-width floor: a 400px card beside a footer is a 600px email, not 400.
const roots = (el: StyledElement, found: Found, inCenter = false): Found => {
  for (const c of el.children) {
    if (skipped(c)) continue;
    if (c.type !== "element" || !candidate(c)) { found.floor = true; continue; }
    // a link box is only walked through: its own width is a button or card, not the column
    const width = c.tag === "a" ? undefined : widthOf(c);
    const cell = soleCell(c);
    if (width !== undefined) {
      // a left-aligned box narrower than the default is not the column (the shell would centre it)
      if (centred(c, inCenter) || width > DEFAULT) found.roots.push({ width, el: c, parent: el });
      else found.floor = true;
    } else if (layoutBlock(c) && wrapper(c)) {
      if (painted(c)) found.floor = true;
      roots(c, found, c.tag === "center");
    } else if (cell && holdsLayout(cell)) {
      if (painted(c) || painted(cell)) found.floor = true;
      roots(cell, found, cell.attrs["align"] === "center");
    } else found.floor = true;
  }
  return found;
};

export const widthDecision = (body: StyledElement, ctx: Ctx): WidthDecision => {
  const { roots: found, floor } = roots(body, { roots: [], floor: false });
  if (!ctx.options.widthGiven) {
    const widest = Math.max(...found.map((r) => r.width));
    return { width: found.length === 0 || floor ? Math.max(DEFAULT, widest) : widest, reportedWide: new Set() };
  }
  const given = ctx.options.width;
  const reportedWide = new Set<string>();
  for (const r of found) {
    if (r.width > given) {
      ctx.diagnostics.report("W011", { message: `Container is ${r.width}px wide but the width option is ${given}px; it is laid out at ${given}px`, loc: r.el.loc });
      const key = identityKey(r.el, r.parent);
      if (key) reportedWide.add(key);
    }
  }
  return { width: given, reportedWide };
};

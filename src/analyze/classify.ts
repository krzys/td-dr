// Which elements are layout containers and which pass through as text.
// Registry order: unsupported → image → button → grid → flex → block → inline.
import { get } from "../style/props.ts";
import type { StyledElement } from "../style/types.ts";

// Always text-level, whatever their display (a blockified <a> is still a link).
export const INLINE_TAGS: ReadonlySet<string> = new Set([
  "a", "abbr", "b", "bdi", "bdo", "br", "cite", "code", "data", "dfn", "em", "font", "i", "img", "kbd",
  "label", "mark", "q", "s", "samp", "small", "span", "strike", "strong", "sub", "sup", "time", "u", "var", "wbr",
]);

// Block-level, but passed through as text instead of being lowered.
export const TEXT_BLOCK_TAGS: ReadonlySet<string> = new Set([
  "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "dl", "blockquote", "pre", "hr", "table", "address",
]);

const display = (el: StyledElement): string => get(el.style, "display") ?? "inline";

export const isHidden = (el: StyledElement): boolean => display(el) === "none";

// A <span style="display:flex"> really is a flex container; links and images stay what they are.
const NEVER_FLEX: ReadonlySet<string> = new Set(["a", "img", "br", "wbr"]);

const layoutTag = (el: StyledElement): boolean => !NEVER_FLEX.has(el.tag) || isLinkBox(el);

export const isFlex = (el: StyledElement): boolean => (display(el) === "flex" || display(el) === "inline-flex") && layoutTag(el);

export const isGrid = (el: StyledElement): boolean => (display(el) === "grid" || display(el) === "inline-grid") && layoutTag(el);

const BLOCKY: ReadonlySet<string> = new Set(["block", "list-item", "table", "flow-root"]);

const SIDES = ["top", "right", "bottom", "left"] as const;

export const isTransparent = (c: string): boolean =>
  c === "transparent" || /^(rgba|hsla)\(.*[,/]\s*0(\.0+)?%?\s*\)$/.test(c);

const hasFill = (el: StyledElement): boolean => {
  const bg = el.style["background-color"];
  const bi = el.style["background-image"];
  return (bg !== undefined && !isTransparent(bg)) || (bi !== undefined && bi !== "none");
};

const hasBorder = (el: StyledElement): boolean =>
  SIDES.some((s) => {
    const style = el.style[`border-${s}-style`] ?? "none";
    return style !== "none" && style !== "hidden" && Number.parseFloat(el.style[`border-${s}-width`] ?? "3") > 0;
  });

const padOf = (el: StyledElement, side: (typeof SIDES)[number]): number => Number.parseFloat(el.style[`padding-${side}`] ?? "0") || 0;

// A fill or a border, and padding: what ctx.otherScreens compares across screens (painted).
export const paints = (el: StyledElement): boolean => hasFill(el) || hasBorder(el);
export const hasPadding = (el: StyledElement): boolean => SIDES.some((s) => padOf(el, s) > 0);

// Content-sized links need side padding to look like buttons; a block or fixed-width link is
// already a box, so vertical padding alone makes it one.
const padded = (el: StyledElement): boolean => {
  const sized = el.style["display"] === "block" || (el.style["width"] !== undefined && el.style["width"] !== "auto");
  return padOf(el, "left") > 0 || padOf(el, "right") > 0 || (sized && (padOf(el, "top") > 0 || padOf(el, "bottom") > 0));
};

// A link around layout (a clickable card): lowered like the box it is, with the link moved
// onto the text and images inside. Links around text, images or text blocks stay text.
// Layout inside a link: flex, grid, or a block that is a box of its own or holds blocks.
// A plain <div> label (a button's text) is not.
const isLayout = (c: StyledElement): boolean =>
  isFlex(c) || isGrid(c) ||
  (isContainer(c) && (paints(c) || SIDES.some((s) => padOf(c, s) > 0) || (c.style["width"] ?? "auto") !== "auto" ||
    c.children.some((k) => k.type === "element" && !isInlineLevel(k))));

// An inline-block link sits on a line next to its siblings; lowering it would stack them.
export const isLinkBox = (el: StyledElement): boolean =>
  el.tag === "a" &&
  el.attrs["href"] !== undefined &&
  el.attrs["data-email"] !== "button" &&
  display(el) !== "inline-block" &&
  el.children.some((c) => c.type === "element" && isLayout(c));

// A box that is not a cell (an <img>, a plain link) can't carry a background image or a height.
export const carries = (el: StyledElement): boolean => el.tag !== "img" && (el.tag !== "a" || isLinkBox(el));

// A link styled as a button: what the button rule lowers, and what the lint flags when
// it rides inside text instead.
export const looksLikeButton = (el: StyledElement): boolean => {
  if (el.tag !== "a" || el.attrs["href"] === undefined || isLinkBox(el)) return false;
  if (el.attrs["data-email"] === "button") return true;
  const d = el.style["display"];
  return (d === "inline-block" || d === "block") && paints(el) && padded(el);
};

// Just an image, maybe wrapped in a link: <img> or <a><img></a> (whitespace aside).
const isImageOnly = (el: StyledElement): boolean => {
  if (el.tag === "img") return true;
  const kids = el.children.filter((c) => c.type === "element" || (c.type === "text" && c.text.trim() !== ""));
  return el.tag === "a" && kids.length === 1 && kids[0]?.type === "element" && kids[0].tag === "img";
};

// A display:block image (or linked image) breaks the line, so it's its own child and
// gets the image rule (width attrs, fluid sizing) instead of riding in a text run.
export const isInlineLevel = (el: StyledElement): boolean => {
  if (isFlex(el) || isGrid(el) || isLinkBox(el)) return false;
  const d = display(el);
  if (BLOCKY.has(d) && (isImageOnly(el) || looksLikeButton(el))) return false;
  return INLINE_TAGS.has(el.tag) || d === "inline" || d === "inline-block";
};

// A list (or any text block) whose children are flex rows is layout, not text.
const holdsLayout = (el: StyledElement): boolean => el.children.some((c) => c.type === "element" && (isFlex(c) || isGrid(c)));

export const isTextBlock = (el: StyledElement): boolean =>
  TEXT_BLOCK_TAGS.has(el.tag) && !isFlex(el) && !isGrid(el) && !holdsLayout(el);

// What the inline rule takes: text blocks plus any inline element that reaches the
// registry on its own (a lone <span>, a flex item <a>).
export const isPassThrough = (el: StyledElement): boolean =>
  !isLinkBox(el) && (isTextBlock(el) || isInlineLevel(el) || (INLINE_TAGS.has(el.tag) && !isFlex(el) && !isGrid(el)));

export const isContainer = (el: StyledElement): boolean =>
  isLinkBox(el) || (!INLINE_TAGS.has(el.tag) && !isTextBlock(el) && ["block", "flow-root", "list-item"].includes(display(el)));

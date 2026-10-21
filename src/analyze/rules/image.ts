import type { Ctx } from "../../ctx.ts";
import { withLoc, zeroSides, type Box, type ImageNode, type Sides } from "../../ir/index.ts";
import { get, lineHeightPx } from "../../style/props.ts";
import type { StyledElement } from "../../style/types.ts";
import { buildBox, reportDropped } from "../box.ts";
import { isBlank, textStyle } from "../children.ts";
import { isTransparent } from "../classify.ts";
import { floatOf } from "../float.ts";
import { lintElement } from "../lint.ts";
import type { Rule } from "../rule.ts";
import { serializeStyled } from "../serialize-styled.ts";


const intAttr = (v: string | undefined): number | undefined => {
  if (v === undefined || !/^\s*\d+\s*(px)?\s*$/.test(v)) return undefined;
  const n = Number.parseInt(v, 10);
  return n > 0 ? n : undefined;
};

type Len = { px: number } | { pct: number } | "auto" | undefined;
const len = (v: string | undefined): Len => {
  if (v === undefined || v === "auto" || v === "none") return "auto";
  const n = Number.parseFloat(v);
  if (!Number.isFinite(n)) return undefined;
  if (v.endsWith("%")) return { pct: n };
  if (v.endsWith("px") || n === 0) return { px: n };
  return undefined;
};

const pxOf = (v: string | undefined): number | undefined => {
  const l = len(v);
  return l && l !== "auto" && "px" in l && l.px > 0 ? l.px : undefined;
};

// the size an element asks for: CSS wins over the attribute
const sizeOf = (el: StyledElement, p: "width" | "height"): number | undefined => pxOf(el.style[p]) ?? intAttr(el.attrs[p]);

const SIDES = ["top", "right", "bottom", "left"] as const;

// A fixed-size painted box (a link or a div) with one smaller image centred in it: a social button, an
// icon in a ring. It becomes the image's frame instead of a box that loses its size.
const isIconBox = (box: StyledElement, img: StyledElement): boolean => {
  const [w, h, iw, ih] = [pxOf(box.style["width"]), pxOf(box.style["height"]), sizeOf(img, "width"), sizeOf(img, "height")];
  if (w === undefined || h === undefined || iw === undefined || ih === undefined || iw > w || ih > h) return false;
  const bg = box.style["background-color"];
  const border = SIDES.some((s) => !/^(none|hidden)$/.test(box.style[`border-${s}-style`] ?? "none") && Number.parseFloat(box.style[`border-${s}-width`] ?? "3") > 0);
  const flexCentred = /flex/.test(get(box.style, "display") ?? "") && get(box.style, "align-items") === "center" && get(box.style, "justify-content") === "center";
  // the other common social-button markup: text-align:center with a line-height as tall as the box
  const lineCentred = get(box.style, "text-align") === "center" && pxOf(lineHeightPx(box.style)) === h;
  const centred = flexCentred || lineCentred;
  const padded = SIDES.some((s) => Number.parseFloat(box.style[`padding-${s}`] ?? "0") > 0);
  return centred && !padded && ((bg !== undefined && !isTransparent(bg)) || border);
};

// The <img> of a link-wrapped image: an <a> whose only non-blank child is an <img> (a <div> only for an icon box).
const wrappedImg = (el: StyledElement): StyledElement | undefined => {
  if (el.tag !== "a" && el.tag !== "div") return undefined;
  const kids = el.children.filter((c) => !isBlank(c));
  const [only] = kids;
  const img = kids.length === 1 && only?.type === "element" && only.tag === "img" ? only : undefined;
  return img && (el.tag === "a" || isIconBox(el, img)) ? img : undefined;
};

// The free space around the image inside the box, split evenly: the frame the image sits in.
const iconPadding = (link: StyledElement, linkBox: Box, iw: number, ih: number): Sides => {
  const b = linkBox.border;
  const borderBox = get(link.style, "box-sizing") === "border-box";
  const innerW = (pxOf(link.style["width"]) ?? 0) - (borderBox ? (b?.left?.width ?? 0) + (b?.right?.width ?? 0) : 0);
  const innerH = (pxOf(link.style["height"]) ?? 0) - (borderBox ? (b?.top?.width ?? 0) + (b?.bottom?.width ?? 0) : 0);
  const [x, y] = [Math.max(0, innerW - iw), Math.max(0, innerH - ih)];
  return { top: Math.floor(y / 2), right: x - Math.floor(x / 2), bottom: y - Math.floor(y / 2), left: Math.floor(x / 2) };
};

const without = (rec: Record<string, string>, drop: readonly string[]): Record<string, string> => {
  const out = { ...rec };
  for (const p of drop) delete out[p];
  return out;
};

const hasPosition = (b: Box): boolean =>
  !!b.align || b.margin.top !== 0 || b.margin.right !== 0 || b.margin.bottom !== 0 || b.margin.left !== 0;

// Sizing is handled by the image itself, not by the box.
const SIZING = ["width", "max-width", "height"] as const;

// Email boilerplate with no effect on a lowered image. outline and text-decoration only count as
// boilerplate when they are resets; a real outline or underline falls through to reportDropped.
const ALWAYS_QUIET = /^(vertical-align|-ms-interpolation-mode)/;
const RESET_DECORATION = new Set(["none", "0", "0px", "medium", "currentcolor", "solid", "auto", "invert", "initial"]);
const quiet = (rec: Record<string, string>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(rec).filter(([p, v]) => {
      if (ALWAYS_QUIET.test(p)) return false;
      if (/^(outline|text-decoration)/.test(p)) return !RESET_DECORATION.has(v.trim().toLowerCase());
      return true;
    }),
  );

const hasPadding = (b: Box): boolean => !!(b.padding.top || b.padding.right || b.padding.bottom || b.padding.left);

const buildImage = (img: StyledElement, link: StyledElement | undefined, ctx: Ctx): ImageNode => {
  const warn = (message: string, at: StyledElement = img): void =>
    ctx.diagnostics.report("W001", { message, loc: at.loc });
  const unsupported = (message: string): void => ctx.diagnostics.report("E006", { message, loc: img.loc });

  const src = img.attrs["src"] ?? "";
  if (src.trim() === "") warn("image without src");
  const alt = img.attrs["alt"];
  if (alt === undefined) warn("image has no alt text");

  // float becomes the align attribute (the node's float), so it isn't a dropped property
  const float = floatOf(img);
  // a lowered image is its own block: nothing after it wraps (inside a text block it would, see the pattern file)
  if (float) {
    ctx.diagnostics.report("W001", {
      message: `float: ${float} on an image that is its own block: text next to it does not wrap around it`,
      hint: "Put the image inside the paragraph it should wrap with: <p><img style=\"float:left\">text</p>.",
      loc: img.loc,
    });
  }
  const plain: StyledElement = {
    ...img,
    style: quiet(without(img.style, [...SIZING, "float"])),
    declared: quiet(without(img.declared, [...SIZING, "float"])),
  };
  const own = buildBox(plain, ctx, { width: sizeOf(img, "width"), height: sizeOf(img, "height") });
  reportDropped(plain, ctx);
  if (hasPadding(own)) warn("padding on an image is dropped");
  const box: Box = hasPadding(own) ? { ...own, padding: zeroSides() } : own;

  let finalBox = box;
  const icon = link !== undefined && isIconBox(link, img);
  if (link) {
    const linkEl: StyledElement = {
      ...link,
      // an icon box is a div, but its overflow can never become a clip cell: reportDropped says so
      style: quiet(without(link.style, [...SIZING, "overflow", "overflow-x", "overflow-y"])),
      // overflow:hidden on a rounded link only clips the image corners, and the radius moves to the image
      declared: quiet(without(link.declared, /radius/.test(Object.keys(link.declared).join(" ")) ? [...SIZING, "overflow", "overflow-x", "overflow-y"] : SIZING)),
    };
    // a link sized like its image (`a { display:block; width:300px }`) loses nothing
    const imgPx = len(img.style["width"]);
    const imgWidth = imgPx && imgPx !== "auto" && "px" in imgPx ? `${imgPx.px}px` : img.attrs["width"] ? `${img.attrs["width"]}px` : undefined;
    let sizeDropped = false;
    for (const p of ["width", "max-width", "height"]) {
      const v = link.style[p];
      if (icon || v === undefined || v === "auto" || v === "none" || (p !== "height" && v === imgWidth)) continue;
      sizeDropped = true;
      warn(`${p}: ${v} on a link around an image is dropped`, link);
    }
    // sizing is stripped from linkEl, but a radius in % still needs the link's own size
    const linkBox = buildBox(linkEl, ctx, { width: pxOf(link.style["width"]), height: pxOf(link.style["height"]) });
    reportDropped(linkEl, ctx);
    if (hasPadding(linkBox)) warn("padding on a link around an image is dropped", link);
    // the image's own box wins; the link's fills in what the image leaves unset
    finalBox = { ...box };
    const linkMargin = linkBox.margin.top || linkBox.margin.right || linkBox.margin.bottom || linkBox.margin.left;
    if (hasPosition(linkBox)) {
      if (!hasPosition(box)) {
        finalBox.margin = linkBox.margin;
        if (linkBox.align) finalBox.align = linkBox.align;
      } else {
        if (linkMargin) warn("margin on a link around an image is dropped because the image has its own margin", link);
        if (linkBox.align) warn("auto margin on a link around an image is dropped because the image has its own margin", link);
      }
    }
    if (linkBox.border) {
      if (box.border) warn("border on a link around an image is dropped because the image has its own border", link);
      else finalBox.border = linkBox.border;
    }
    if (linkBox.background !== undefined) {
      if (box.background !== undefined) warn("background on a link around an image is dropped because the image has its own", link);
      else finalBox.background = linkBox.background;
    }
    if (linkBox.radius !== undefined) {
      if (box.radius !== undefined) warn("border-radius on a link around an image is dropped because the image has its own", link);
      // the radius belongs to the link's size; on a smaller image it would clip the picture itself
      else if (sizeDropped) warn("border-radius on a link around an image is dropped because the link's size is", link);
      else {
        finalBox.radius = linkBox.radius;
        if (linkBox.radii) finalBox.radii = linkBox.radii;
      }
    }
    // padding is what frames the image in the link's size; the emitter paints border and radius on that frame
    if (icon) {
      const [iw, ih] = [sizeOf(img, "width")!, sizeOf(img, "height")!];
      finalBox.padding = iconPadding(link, linkBox, iw, ih);
    }
  }

  let width: number | undefined;
  let height: number | undefined;
  let fluid = false;

  const wAttr = img.attrs["width"];
  if (wAttr !== undefined) {
    if (wAttr.trim() === "100%") fluid = true;
    else {
      width = intAttr(wAttr);
      if (width === undefined) warn(`width="${wAttr}" is not supported, use whole pixels or 100%`);
    }
  }
  const hAttr = img.attrs["height"];
  if (hAttr !== undefined) {
    height = intAttr(hAttr);
    if (height === undefined) warn(`height="${hAttr}" is not supported, use whole pixels`);
  }

  const w = len(img.style["width"]);
  if (w === undefined) unsupported(`width: ${img.style["width"]} is not supported`);
  else if (w !== "auto" && "px" in w) {
    if (w.px > 0) {
      width = w.px;
      fluid = false;
    } else warn("width: 0 is not supported, the image keeps its other width");
  } else if (w !== "auto") {
    fluid = true;
    width = undefined;
    // exact in a flex row (the column takes the %), not in block flow
    if (w.pct !== 100) ctx.diagnostics.report("W003", { message: `width: ${img.style["width"]} on an image is approximated as filling its column`, loc: img.loc });
  }

  if (img.style["max-width"] === "100%") fluid = true;
  else {
    const m = len(img.style["max-width"]);
    if (m === undefined || (m !== "auto" && "pct" in m)) {
      unsupported(`max-width: ${img.style["max-width"]} is not supported, use px or 100%`);
    } else if (m !== "auto" && m.px > 0) width = Math.min(width ?? m.px, m.px);
    else if (m !== "auto") warn("max-width: 0 is not supported and is ignored");
  }

  const h = len(img.style["height"]);
  if (h === undefined) unsupported(`height: ${img.style["height"]} is not supported`);
  else if (h === "auto") {
    if (img.style["height"] === "auto") height = undefined;
  } else if ("px" in h) {
    if (h.px > 0) height = h.px;
    else warn("height: 0 is not supported, the image keeps its other height");
  } else unsupported(`height: ${img.style["height"]} is not supported, use px or auto`);

  if (width === undefined && !fluid) warn("Outlook needs a width attribute; give the image a width");

  const node: ImageNode = { kind: "image", box: finalBox, src, alt: alt ?? "" };
  if (width !== undefined) node.width = width;
  if (height !== undefined) node.height = height;
  if (fluid) node.fluid = true;
  // An inline image sits on a text line: its link's own line when the link is a block (a flex item
  // is blockified), else the line of whatever contains it. A blockified image has no line.
  const inline = (e: StyledElement): boolean => /^inline(-block)?$/.test(e.style["display"] ?? "inline");
  const onTextLine = (e: StyledElement): boolean => !!e.parentStyle && !/flex|grid/.test(e.parentStyle["display"] ?? "");
  if (float) node.float = float;
  else if (inline(img)) {
    if (link && !inline(link)) node.line = textStyle(link.style);
    else if (onTextLine(link ?? img)) node.line = textStyle((link ?? img).parentStyle!);
  }
  const href = link?.attrs["href"];
  if (href !== undefined && href !== "") node.href = href;
  return node;
};

export const imageRule: Rule = {
  name: "image",
  matches: (el) => el.tag === "img" || wrappedImg(el) !== undefined,
  analyze: (el, ctx) => {
    const inner = wrappedImg(el);
    // an image that can't be lowered keeps its link as-is, like a bare unsupported <img>
    if (inner && lintElement(inner, ctx)) return withLoc({ kind: "raw", html: serializeStyled([el], undefined, { rootKept: true }) }, el.loc);
    return withLoc(buildImage(inner ?? el, inner ? el : undefined, ctx), el.loc);
  },
};

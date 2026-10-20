// What a box paints: borders, background colour and image (or gradient), and corner radii.
import type { Ctx } from "../ctx.ts";
import type { Border, BorderSide, Box } from "../ir/index.ts";
import { get } from "../style/props.ts";
import type { StyledElement, StyledNode } from "../style/types.ts";
import { carries, isTransparent } from "./classify.ts";
import { parseLen } from "./length.ts";

const SIDES = ["top", "right", "bottom", "left"] as const;
export const CORNERS = ["top-left", "top-right", "bottom-right", "bottom-left"] as const;

const FAKE_BORDERS: ReadonlySet<string> = new Set(["double", "groove", "ridge", "inset", "outset"]);
const REAL_BORDERS: ReadonlySet<string> = new Set(["solid", "dashed", "dotted"]);

const splitTop = (s: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  parts.push(cur.trim());
  return parts;
};

// Colours every client (and bgcolor) can show as-is: #rgb, #rrggbb, rgb(), opaque rgba(), named.
// Not 8-digit hex, hsl(), currentColor or transparent: those give Outlook nothing to paint.
const PLAIN_COLOUR = /^(#[0-9a-f]{3}|#[0-9a-f]{6}|rgba?\(\s*\d+[\s,]+\d+[\s,]+\d+\s*(?:[,/]\s*(?:1|1\.0+|100%)\s*)?\)|(?!transparent$|currentcolor$|inherit$|initial$|unset$)[a-z]+)$/i;

// The first colour of the topmost gradient layer as written, alpha and all.
export const firstStopRaw = (image: string): string | undefined => {
  const inner = /gradient\((.*)\)\s*$/s.exec(splitTop(image)[0] ?? "")?.[1];
  if (!inner) return undefined;
  const parts = splitTop(inner);
  // a conic gradient opens with `from <angle> [at <position>]`, its stops sit at angles
  const stops = /^(to\s|from\s|-?[\d.]+(deg|turn|rad|grad)$|circle|ellipse|closest|farthest|at\s)/.test(parts[0] ?? "") ? parts.slice(1) : parts;
  return stops[0]?.replace(/(\s+-?[\d.]+(%|px|deg|turn|rad|grad)?){1,2}$/, "");
};

// That colour, when it is a plain hex/rgb/named colour.
export const firstStop = (image: string): string | undefined => {
  const stop = firstStopRaw(image);
  return stop && PLAIN_COLOUR.test(stop) ? stop : undefined;
};

const GRADIENT = /-gradient\(/i;

const paintedProp = (k: StyledElement, p: string): boolean => {
  const v = k.style[p];
  return v !== undefined && v !== "none" && !isTransparent(v);
};
export const isPaintedNode = (k: StyledNode): boolean =>
  k.type === "element" && (paintedProp(k, "background-color") || paintedProp(k, "background-image"));

// Text painted by a clipped gradient: its colour is transparent, so it needs a solid stand-in.
export const isGradientText = (el: StyledElement): boolean =>
  GRADIENT.test(el.style["background-image"] ?? "") &&
  (el.style["background-clip"] ?? el.style["-webkit-background-clip"]) === "text" &&
  [el.style["color"], el.style["-webkit-text-fill-color"]].some((c) => c !== undefined && isTransparent(c));

// A shorthand like `background: url() center/cover` leaves initial values in the longhands: carry only what differs.
// (`background-size: 100%` is not initial; it is width 100%, height auto.)
const LAYER_INITIAL: Readonly<Record<string, readonly string[]>> = {
  "background-size": ["auto", "auto auto"],
  "background-position": ["0% 0%", "0 0", "left top", "top left", "0% 0", "0 0%"],
  "background-repeat": ["repeat", "repeat repeat"],
};
const layerProp = (el: StyledElement, prop: string): string | undefined => {
  const v = el.style[prop];
  return v === undefined || LAYER_INITIAL[prop]!.includes(v.trim().toLowerCase()) ? undefined : v;
};

const warn = (el: StyledElement, ctx: Ctx, message: string): void => ctx.diagnostics.report("W001", { message, loc: el.loc });

// The sides that draw; the styles email can't draw are drawn solid (W001).
export const bordersOf = (el: StyledElement, ctx: Ctx): Border => {
  const border: Border = {};
  for (const s of SIDES) {
    const style = el.style[`border-${s}-style`] ?? "none";
    const w = parseLen(el.style[`border-${s}-width`] ?? "3px"); // CSS "medium"
    const width = w && "px" in w ? w.px : 0;
    if (style === "none" || style === "hidden" || width === 0) continue;
    if (FAKE_BORDERS.has(style)) warn(el, ctx, `border-${s}-style: ${style} is drawn as solid`);
    const side: BorderSide = {
      width,
      style: REAL_BORDERS.has(style) ? (style as BorderSide["style"]) : "solid",
      color: el.style[`border-${s}-color`] ?? get(el.style, "color") ?? "#000000",
    };
    border[s] = side;
  }
  return border;
};

export type Background = Pick<Box, "background" | "backgroundImage">;

// The background colour, and the image or gradient when the box is a cell that can carry one.
// An image without a colour gets the gradient's first stop for Outlook, or a W001.
export const backgroundOf = (el: StyledElement, ctx: Ctx): Background => {
  const out: Background = {};
  const bg = el.style["background-color"];
  // a see-through background was already reported by the style stage
  if (bg && !isTransparent(bg)) out.background = bg;

  const image = carries(el) ? el.style["background-image"] : undefined;
  if (!image || image === "none") return out;
  if (/image-set\(/i.test(image) || (!/\burl\(/i.test(image) && !GRADIENT.test(image))) {
    warn(el, ctx, `background-image: ${image} is dropped`);
    return out;
  }
  const urls = [...image.matchAll(/\burl\(\s*(['"]?)(.*?)\1\s*\)/gi)];
  const gradient = GRADIENT.test(image);
  const url = urls.length === 1 && !gradient ? urls[0]![2] : undefined;
  const layers: NonNullable<Box["backgroundImage"]> = {
    // Yahoo wants the url quoted
    css: url !== undefined ? `url('${url}')` : image.replace(/\s+/g, " ").trim(),
  };
  if (url !== undefined) layers.url = url;
  const size = layerProp(el, "background-size");
  const position = layerProp(el, "background-position");
  const repeat = layerProp(el, "background-repeat");
  if (size) layers.size = size;
  if (position) layers.position = position;
  if (repeat) layers.repeat = repeat;
  out.backgroundImage = layers;

  if (out.background === undefined) {
    const stop = gradient ? firstStop(image) : undefined;
    if (stop) {
      out.background = stop;
      warn(el, ctx, `Outlook shows the gradient's first colour, ${stop}`);
    } else if (gradient) {
      warn(el, ctx, "The gradient's first colour isn't a plain #rrggbb, rgb() or named colour, so there is no fallback; Outlook shows no background");
    } else warn(el, ctx, "A background image without a background-color has no fallback for Outlook, blocked images or dark mode, which inverts text but not images");
  }
  if (urls.length > 0 && url === undefined) warn(el, ctx, "Outlook gets no photo when a background has several layers or mixes a url with a gradient");
  return out;
};

export type Corners = Pick<Box, "radius" | "radii">;

// Circular px radii per corner. A % radius refers to the border box, so it needs `size` (its px
// width and height); without it, or in an odd unit, the corner stays square (W001).
export const cornersOf = (el: StyledElement, ctx: Ctx, size: { width?: number | undefined; height?: number | undefined }): Corners => {
  let unresolved: string | undefined;
  let elliptical: string | undefined;
  const radii = CORNERS.map((c) => {
    const raw = el.style[`border-${c}-radius`];
    if (raw === undefined) return 0;
    const [h = "0", v = h] = raw.trim().split(/\s+/);
    const axes = [[h, size.width], [v, size.height]] as const;
    const px = axes.map(([tok, length]) => {
      const len = parseLen(tok);
      if (len && "px" in len) return len.px;
      return len && length !== undefined ? Math.round(((len.pct * length) / 100) * 100) / 100 : undefined;
    });
    if (px[0] === undefined || px[1] === undefined) {
      unresolved ??= raw;
      return 0;
    }
    if (px[0] !== px[1]) elliptical ??= raw;
    return Math.min(px[0], px[1]);
  });
  if (unresolved !== undefined) {
    ctx.diagnostics.report("W001", {
      message: unresolved.includes("%")
        ? `border-radius: ${unresolved} needs a box with a px width and height; the corners stay square`
        : `border-radius: ${unresolved} is not supported, use px`,
      hint: "Use a px radius (50% of a square is half its side), or give the box a px width and height so the percentage can be resolved.",
      loc: el.loc,
    });
  }
  if (elliptical !== undefined) {
    ctx.diagnostics.report("W003", {
      message: `border-radius: ${elliptical} is elliptical; email corners are circular, so the smaller radius is used`,
      loc: el.loc,
    });
  }
  const largest = Math.max(...radii);
  const out: Corners = {};
  if (largest > 0) out.radius = largest;
  if (radii.some((r) => r !== largest)) out.radii = radii as [number, number, number, number];
  return out;
};

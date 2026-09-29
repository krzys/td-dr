import { luminance } from "./colour.ts";
import { walk, type Check } from "./walk.ts";

const DATA_URI = /^data:([^;,]*)((?:;[^;,]*)*?),(.*)$/is;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// Colour types 4 and 6 carry an alpha channel; a tRNS chunk makes the others see-through.
const pngHasAlpha = (b: Buffer): boolean => {
  if (b.length < 26 || PNG_SIGNATURE.some((v, i) => b[i] !== v)) return false;
  if (b[25] === 4 || b[25] === 6) return true;
  for (let at = 8; at + 8 <= b.length; at += 12 + b.readUInt32BE(at)) {
    const type = b.toString("latin1", at + 4, at + 8);
    if (type === "tRNS") return true;
    if (type === "IDAT" || type === "IEND") return false;
  }
  return false;
};

// Walks the blocks up to the first picture, where the graphic control extension (flag bit 0) sits.
const gifHasAlpha = (b: Buffer): boolean => {
  if (b.length < 13 || !b.toString("latin1", 0, 3).startsWith("GIF")) return false;
  let at = 13 + (b[10]! & 0x80 ? 3 * 2 ** ((b[10]! & 7) + 1) : 0);
  while (at < b.length && b[at] === 0x21) {
    if (b[at + 1] === 0xf9) return ((b[at + 3] ?? 0) & 1) === 1;
    at += 2;
    while (at < b.length && b[at] !== 0) at += b[at]! + 1;
    at++;
  }
  return false;
};

// An svg is see-through unless its first shape is a filled rect over the whole canvas (a baked-in background).
const attrOf = (tag: string, name: string): string | undefined => new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(tag)?.[1];
const svgHasAlpha = (text: string): boolean => {
  const svg = /<svg\b[^>]*>/i.exec(text);
  const first = svg && /<(?!\/|title|desc|defs|metadata|!--)[a-z][^>]*>/i.exec(text.slice(svg.index + svg[0].length));
  if (!svg || !first || !/^<rect\b/i.test(first[0])) return true;
  const rect = first[0];
  const box = attrOf(svg[0], "viewBox")?.trim().split(/[\s,]+/);
  const covers = (side: "width" | "height", i: number) => {
    const v = attrOf(rect, side);
    return v === "100%" || (v !== undefined && (v === attrOf(svg[0], side) || v === box?.[i]));
  };
  const at0 = (n: string) => Number.parseFloat(attrOf(rect, n) ?? "0") === 0;
  const fill = attrOf(rect, "fill")?.toLowerCase();
  return !(covers("width", 2) && covers("height", 3) && at0("x") && at0("y") && fill !== undefined && fill !== "none" && fill !== "transparent");
};

const transparent = (b: Buffer | undefined): boolean => b !== undefined && (pngHasAlpha(b) || gifHasAlpha(b));

// A raw % in a URL-encoded payload is not an escape; such an image is skipped.
const bytesOf = (params: string, data: string): Buffer | undefined => {
  if (/;base64/i.test(params)) return Buffer.from(data, "base64");
  try {
    return Buffer.from(decodeURIComponent(data), "latin1");
  } catch {
    return undefined;
  }
};

// W017: bytes we can read (a data: URI) with transparency, on a light background, almost always dark ink.
export const transparentImage: Check = (body, ctx) => {
  walk(body, (el, paint) => {
    // shown on another screen or scheme only, over a backdrop we don't see here
    if (el.keep === "hidden") return;
    const m = el.tag === "img" ? DATA_URI.exec(el.attrs["src"] ?? "") : null;
    if (!m || paint.kind !== "solid" || luminance(paint.rgb) <= 0.5) return;
    // a 1px tracking pixel is not a logo
    const px = [el.attrs["width"], el.attrs["height"]].map(Number).filter(Number.isFinite);
    if (px.some((n) => n <= 2)) return;
    const bytes = bytesOf(m[2]!, m[3]!);
    const svg = /svg/i.test(m[1] ?? "");
    if (svg ? svgHasAlpha(bytes?.toString("latin1") ?? m[3]!) : transparent(bytes)) ctx.diagnostics.report("W017", { loc: el.loc });
  });
};

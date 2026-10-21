import { hasMergeTag, walk, type Check } from "./walk.ts";

const FILE = /\.(png|jpe?g|gif|webp|svg)$/i;
const WORD = /^(image|img|photo|picture|graphic|icon|spacer|banner|logo)$/i;
const CAMERA = /^(img|dsc|dscn|dscf|pxl|screenshot)[ _-]?\d+/i;

const base = (src: string): string => (src.split(/[?#]/)[0] ?? "").split("/").pop()?.toLowerCase() ?? "";

const placeholder = (alt: string, src: string): boolean => {
  const a = alt.trim();
  return FILE.test(a) || WORD.test(a) || CAMERA.test(a) || (base(src) !== "" && a.toLowerCase() === base(src));
};

// I012: alt text that is a file name or a stand-in word.
export const altText: Check = (body, ctx) => {
  walk(body, (el) => {
    const alt = el.attrs["alt"];
    if (el.tag !== "img" || alt === undefined || alt.trim() === "" || hasMergeTag(alt)) return;
    if (placeholder(alt, el.attrs["src"]?.startsWith("data:") ? "" : (el.attrs["src"] ?? ""))) {
      ctx.diagnostics.report("I012", { message: `Alt text "${alt.trim()}" looks like a placeholder`, loc: el.loc });
    }
  });
};

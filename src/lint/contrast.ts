import { parseColor } from "../style/alpha.ts";
import { contrast as ratioOf, hex, rgbOf, solidOf } from "./colour.ts";
import { fontPx, hasOwnText, walk, type Check } from "./walk.ts";
import type { SrcLoc } from "../loc.ts";

const weight = (v: string | undefined): number => (v === "bold" || v === "bolder" ? 700 : Number.parseInt(v ?? "400", 10) || 400);

// W016: WCAG 1.4.3 on text whose colour and background are both known solid colours.
// One diagnostic per colour pair, at its first place, with the count.
export const contrast: Check = (body, ctx) => {
  const pairs = new Map<string, { message: string; loc: SrcLoc | undefined; n: number }>();
  walk(body, (el, paint) => {
    const bg = solidOf(paint);
    const px = fontPx(el);
    if (!bg || px === undefined || px <= 1 || !hasOwnText(el)) return;
    const c = el.style["color"];
    if (c !== undefined && (parseColor(c)?.[3] ?? 1) === 0) return;
    const fg = rgbOf(c ?? "#000000", bg);
    if (!fg) return;
    const large = px >= 24 || (px >= 18.66 && weight(el.style["font-weight"]) >= 700);
    const need = large ? 3 : 4.5;
    const found = ratioOf(fg, bg);
    if (found >= need) return;
    const shown = (Math.floor(found * 10) / 10).toFixed(1);
    const message = `Text ${hex(fg)} on ${hex(bg)}: found ${shown}:1, needs ${need}:1`;
    const seen = pairs.get(message);
    if (seen) seen.n++;
    else pairs.set(message, { message, loc: el.loc, n: 1 });
  });
  for (const { message, loc, n } of pairs.values()) ctx.diagnostics.report("W016", { message: n > 1 ? `${message} (${n} places)` : message, loc });
};

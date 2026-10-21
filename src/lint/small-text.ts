import { parseColor } from "../style/alpha.ts";
import type { SrcLoc } from "../loc.ts";
import { fontPx, hasOwnText, walk, type Check } from "./walk.ts";

// I013: real text under 12px. 1px and below is how spacers and hidden text are written.
// One diagnostic per size, at its first place, with the count.
export const smallText: Check = (body, ctx) => {
  const sizes = new Map<number, { loc: SrcLoc | undefined; n: number }>();
  walk(body, (el) => {
    const px = fontPx(el);
    if (px === undefined || px >= 12 || px <= 1 || !hasOwnText(el)) return;
    if ((parseColor(el.style["color"] ?? "")?.[3] ?? 1) === 0) return;
    const seen = sizes.get(px);
    if (seen) seen.n++;
    else sizes.set(px, { loc: el.loc, n: 1 });
  });
  for (const [px, { loc, n }] of sizes) ctx.diagnostics.report("I013", { message: `Text at ${px}px is very small${n > 1 ? ` (${n} places)` : ""}`, loc });
};

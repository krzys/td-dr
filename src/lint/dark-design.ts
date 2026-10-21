import type { StyledElement } from "../style/types.ts";
import { luminance, paintOf, WHITE, type Paint } from "./colour.ts";
import { elementsOf, hasOwnText, isInvisible, type Check } from "./walk.ts";

// Buttons and links are painted on purpose; a dark one doesn't make the email dark.
const PAINTED_ON_PURPOSE = new Set(["a", "button"]);
const isDark = (p: Paint): boolean => p.kind === "solid" && p.authored && luminance(p.rgb) < 0.2;

// I014: most of the text sits on a dark background the author painted, with no dark-mode rule of their own.
export const darkDesign: Check = (body, ctx, doc) => {
  if (!doc || doc.dark) return;
  let all = 0;
  const dark: StyledElement[] = [];
  const go = (el: StyledElement, parent: Paint, painter: StyledElement | undefined): void => {
    if (isInvisible(el) || PAINTED_ON_PURPOSE.has(el.tag)) return;
    const paint = paintOf(el, parent);
    const by = paint === parent ? painter : el;
    if (hasOwnText(el)) {
      all++;
      if (isDark(paint) && by) dark.push(by);
    }
    for (const c of elementsOf(el)) go(c, paint, by);
  };
  go(body, WHITE, undefined);
  if (dark.length * 2 > all) ctx.diagnostics.report("I014", { loc: dark[0]!.loc });
};

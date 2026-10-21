import type { StyledElement } from "../style/types.ts";
import { elementsOf, hasMergeTag, isInvisible, isRealText, textOf, walk, type Check } from "./walk.ts";

const hasAltImage = (el: StyledElement): boolean =>
  elementsOf(el).some((c) => !isInvisible(c) && ((c.tag === "img" && (c.attrs["alt"] ?? "").trim() !== "") || hasAltImage(c)));

// W015: a link a screen reader can only announce by its URL.
export const linkName: Check = (body, ctx) => {
  walk(body, (el) => {
    if (el.tag !== "a" || el.attrs["href"] === undefined) return;
    const text = textOf(el);
    if (isRealText(text) || hasMergeTag(text) || (el.attrs["aria-label"] ?? "").trim() !== "" || hasAltImage(el)) return;
    ctx.diagnostics.report("W015", { loc: el.loc });
  });
};

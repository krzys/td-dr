// Text declarations on cells. Outlook doesn't inherit across tables, so every cell restates its text styles.
import type { InlineNode, Style } from "../ir/index.ts";
import { fromStyle } from "./attrs.ts";

// Word honours a px line-height only with this rule next to it; an author's own rule stays.
export const lineHeightRule = (style: Style): "exactly" | undefined =>
  /px$/.test(style["line-height"] ?? "") && !style["mso-line-height-rule"] ? "exactly" : undefined;

export const textDecls = (style: Style): Array<readonly [string, string]> => {
  const decls = fromStyle(style);
  const rule = lineHeightRule(style);
  if (rule) decls.push(["mso-line-height-rule", rule]);
  return decls;
};

// Word gives an empty cell a full line of height unless the text inside is zero-sized.
export const EMPTY_TEXT: ReadonlyArray<readonly [string, string]> = [["font-size", "0"], ["line-height", "0"], ["mso-line-height-rule", "exactly"]];

// A pruned text cell: the inline text's own styles go on its cell, except those its only block
// element already states.
export const cellTextDecls = (n: InlineNode): Array<readonly [string, string]> => {
  const decls = textDecls(n.style);
  const own = n.restated;
  if (!own) return decls;
  // direction stays on the cell: it sets how the cell itself lays out, not just its text
  const same = (p: string, v: string): boolean => p !== "direction" && own[p] === v;
  const lineGone = same("line-height", n.style["line-height"] ?? "");
  return decls.filter(([p, v]) => !(p === "mso-line-height-rule" ? lineGone : same(p, v)));
};

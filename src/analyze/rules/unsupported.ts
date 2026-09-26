import { withLoc } from "../../ir/index.ts";
import type { ComputedStyle, StyledElement, StyledNode } from "../../style/types.ts";
import type { Ctx } from "../../ctx.ts";
import { solidGradientText } from "../children.ts";
import { canLower, lintTree } from "../lint.ts";
import type { Rule } from "../rule.ts";
import { serializeStyled } from "../serialize-styled.ts";

// Positioning can't survive: the ancestor it was relative to became a table cell, and Gmail
// strips it anyway. Left in, an absolute element lands wherever its new containing block is.
const POSITIONING = new Set(["position", "top", "right", "bottom", "left", "inset", "z-index"]);
const unpositioned = (s: ComputedStyle): ComputedStyle =>
  Object.fromEntries(Object.entries(s).filter(([p]) => !POSITIONING.has(p)));
// gradient text gets the same solid colour as lowered text: a client that paints the gradient
// but can't clip it (Yahoo) would show a coloured block with invisible text
const inFlow = (n: StyledNode, ctx: Ctx): StyledNode => {
  if (n.type !== "element") return n;
  const el = solidGradientText(n, ctx);
  return { ...el, style: unpositioned(el.style), declared: unpositioned(el.declared), children: el.children.map((c) => inFlow(c, ctx)) };
};

// Out-of-scope elements go through as-is, in normal flow (strict mode turns the errors into a failure).
export const unsupportedRule: Rule = {
  name: "unsupported",
  matches: (el) => !canLower(el),
  analyze: (el, ctx) => {
    // the raw html never reaches the registry, so lint what's inside it too
    lintTree(el, ctx, true);
    return withLoc({ kind: "raw", html: serializeStyled([inFlow(el, ctx) as StyledElement], undefined, { rootKept: true }) }, el.loc);
  },
};

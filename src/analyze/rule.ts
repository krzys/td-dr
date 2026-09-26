import type { Ctx } from "../ctx.ts";
import type { Node } from "../ir/index.ts";
import type { StyledElement } from "../style/types.ts";

// One rule per file in analyze/rules/, registered in analyze/registry.ts.
// `matches` must not report diagnostics. `recurse` runs a child through the
// whole registry; containers use analyzeChildren() for their children.
export interface Rule {
  name: string;
  matches(node: StyledElement, ctx: Ctx): boolean;
  analyze(node: StyledElement, ctx: Ctx, recurse: (n: StyledElement) => Node): Node;
}

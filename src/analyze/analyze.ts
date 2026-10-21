import type { Ctx } from "../ctx.ts";
import { withLoc, type Node } from "../ir/index.ts";
import { identityKey } from "./design-width.ts";
import type { StyledElement } from "../style/types.ts";
import { isInlineLevel } from "./classify.ts";
import { hideWrap } from "./hide.ts";
import { rules as registry } from "./registry.ts";
import type { Rule } from "./rule.ts";
import { serializeStyled } from "./serialize-styled.ts";

// Hidden on some screens only: the node gets a cell of its own that the emitter hides where it is none.
// A text-level element in a run hides itself inline instead (serialize-styled). A template node
// is the same element again, one level down (its if / each wraps the element's own node), which wraps it there.
const kept = (n: StyledElement, node: Node): Node =>
  n.keep && node.kind !== "template" && !(node.kind === "inline" && isInlineLevel(n))
    ? hideWrap(node, n.keep, n.loc)
    : node;

// A root the design-width decision already reported (W011) as wider than the width option: its node says so,
// so its clamp is not reported again (resolve-widths).
const reported = (node: Node): Node => (node.kind === "stack" || node.kind === "row" ? { ...node, reportedWide: true } : node);

export const analyze = (body: StyledElement, ctx: Ctx, rules: readonly Rule[] = registry): Node => {
  const path: StyledElement[] = [];
  const wide = ctx.widthDecision?.reportedWide;
  const recurse = (n: StyledElement): Node => {
    const rule = rules.find((r) => r.matches(n, ctx));
    if (rule) {
      const key = wide?.size ? identityKey(n, path.at(-1)) : undefined;
      path.push(n);
      try {
        const node = rule.analyze(n, ctx, recurse);
        return kept(n, key !== undefined && wide!.has(key) ? reported(node) : node);
      } finally {
        path.pop();
      }
    }
    ctx.diagnostics.report("E010", { message: `No layout rule matched <${n.tag}>`, loc: n.loc });
    return withLoc({ kind: "raw", html: serializeStyled([n], undefined, { rootKept: true }) }, n.loc);
  };
  return recurse(body);
};

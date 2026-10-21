import { withLoc } from "../../ir/index.ts";
import { buildBox, reportDropped } from "../box.ts";
import { roundEdges } from "../box-clip.ts";
import { analyzeChildren } from "../children.ts";
import { isContainer } from "../classify.ts";
import { throughLink } from "../link-leaves.ts";
import type { Rule } from "../rule.ts";

export const blockRule: Rule = {
  name: "block",
  matches: (el) => isContainer(el),
  analyze: throughLink((el, ctx, recurse) => {
    const box = buildBox(el, ctx);
    const clipped = roundEdges(el, box);
    reportDropped(clipped, ctx);
    return withLoc({ kind: "stack", box, children: analyzeChildren(clipped, ctx, recurse), gap: 0, collapse: true }, el.loc);
  }),
};

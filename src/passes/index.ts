// Order matters: bleed (negative margins would break collapsing) → collapse-margins → margin-to-padding →
// resolve-widths → gap-to-padding → flatten-stacks. The phases (ir/phase.ts) line up along it: each pass
// takes the phase the one before it builds (Node → Padded → Resolved → EmitReady).
import type { Ctx } from "../ctx.ts";
import { checkEmitReady, type EmitReady, type Node } from "../ir/index.ts";
import { bleed } from "./bleed.ts";
import { collapseMargins } from "./collapse-margins.ts";
import { flattenStacks } from "./flatten-stacks.ts";
import { gapToPadding } from "./gap-to-padding.ts";
import { marginToPadding } from "./margin-to-padding.ts";
import type { Pass } from "./pass.ts";
import { resolveWidths } from "./resolve-widths.ts";

const prepare: readonly Pass[] = [bleed, collapseMargins];

// The analyzed tree, ready for emit(). The final check is the emitter's precondition: a pass that broke its
// contract fails there with an internal error, not halfway through writing tables. With `list`, just
// those passes in order.
export function runPasses(ir: Node, ctx: Ctx): EmitReady;
export function runPasses(ir: Node, ctx: Ctx, list: readonly Pass[]): Node;
export function runPasses(ir: Node, ctx: Ctx, list?: readonly Pass[]): Node {
  if (list) return list.reduce((node, pass) => pass.run(node, ctx), ir);
  const padded = marginToPadding.run(prepare.reduce((node, pass) => pass.run(node, ctx), ir), ctx);
  return checkEmitReady(flattenStacks.run(gapToPadding.run(resolveWidths.run(padded, ctx), ctx), ctx));
}

// The IR as tables (docs/architecture.md, The emitter): emit() writes one compile's body markup.
import type { Ctx } from "../ctx.ts";
import type { EmitReady, Node } from "../ir/index.ts";
import { emitButton } from "./button.ts";
import { conditional, inlineMso, templated } from "./conditional.ts";
import { createEmitContext, traced, type EmitContext } from "./context.ts";
import { emitImage } from "./image.ts";
import { emitRow } from "./row.ts";
import { emitStack } from "./stack.ts";
import type { Emitted } from "./types.ts";

// `skipGhost`: the shell's ghost already holds this node (the root).
export const emitNode = (e: EmitContext, n: Node, skipGhost = false): string => emitNodeOf(traced(e, n.loc), n, skipGhost);

const emitNodeOf = (e: EmitContext, n: Node, skipGhost: boolean): string => {
  switch (n.kind) {
    case "stack":
      return emitStack(e, n, skipGhost);
    case "row":
      return emitRow(e, n, skipGhost);
    case "image":
      return emitImage(e, n);
    case "button":
      return emitButton(e, n);
    case "inline":
      return n.html;
    case "raw":
      return n.html;
    case "conditional":
      return conditional(e, n, emitNode(e, n.child));
    case "template":
      return templated(n, (c) => emitNode(e, c));
  }
};

// Takes the emit-ready phase only (runPasses, or checkEmitReady on a hand-built tree), so the emitters below
// can count on margins and gaps being padding and every width being resolved.
export const emit = (ir: EmitReady, ctx: Ctx): Emitted => {
  const e = createEmitContext(ctx);
  // The shell already wraps the page at options.width, so a root that fills it needs no ghost.
  const skip = (ir.kind === "stack" || ir.kind === "row") && !!ir.box.maxWidth && ir.box.maxWidth >= ctx.options.width;
  // The shell paints the page colour full-width, so the root doesn't.
  if (ir.kind === "stack" && ir.box.background) {
    const { background, ...box } = ir.box;
    return { html: inlineMso(e, emitNode(e, { ...ir, box }, skip)), headCss: e.headCss, background };
  }
  return { html: inlineMso(e, emitNode(e, ir, skip)), headCss: e.headCss };
};

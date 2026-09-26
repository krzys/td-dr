// The phase brands (ir/phase.ts), for the pass that builds each phase's contract: its run() takes the phase
// before, so the brand only goes on a tree the chain built. Not exported beyond the passes.
import type { EmitReady, Node, Padded, Resolved } from "../ir/index.ts";

export const asPadded = (n: Node): Padded => n as Padded; // margin-to-padding
export const asResolved = (n: Node): Resolved => n as Resolved; // resolve-widths (on a Padded tree)
export const asEmitReady = (n: Node): EmitReady => n as EmitReady; // gap-to-padding, flatten-stacks (on Resolved / EmitReady)

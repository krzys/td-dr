import type { EmitReady, Node, Padded, Resolved } from "../../src/ir/index.ts";

// A hand-built tree for one pass's unit test, taken as already in the phase that pass expects
// (ir/phase.ts). Unchecked on purpose: these tests also feed a pass what the chain never would.
// The pipeline never does this; runPasses builds each phase.
export const givenPadded = (n: Node): Padded => n as Padded;
export const givenResolved = (n: Node): Resolved => n as Resolved;
export const givenEmitReady = (n: Node): EmitReady => n as EmitReady;

import type { Ctx } from "../ctx.ts";
import type { SrcLoc } from "../ir/index.ts";
import { scoped, UNTRACED, type TraceScope } from "./trace.ts";

// What one emit() call hands down the tree. createEmitContext makes one per compile and it is passed
// explicitly; a nested scope is a copy, so nothing is restored on the way out and two compiles never meet.
export type EmitContext = TraceScope & {
  readonly ctx: Ctx;
  // Outlook must never get a ghost wider than the email; one at the full email width is
  // redundant, the shell already has that ghost.
  readonly pageWidth: number;
  // inside a row column: flex items keep their min-content, only the row overflows
  readonly contentSized: boolean;
  readonly headCss: string[]; // css that fluid rows ask for in the head; one list per compile, shared by its scopes
};

export const createEmitContext = (ctx: Ctx): EmitContext => ({ ...UNTRACED, ctx, pageWidth: ctx.options.width, contentSized: false, headCss: [] });

export const inContent = (e: EmitContext): EmitContext => (e.contentSized ? e : { ...e, contentSized: true });

// The tags written for the author element at `loc` (trace on).
export const traced = (e: EmitContext, loc: SrcLoc | undefined): EmitContext => scoped(e, loc, e.ctx.options.trace);

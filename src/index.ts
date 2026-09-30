import { createCtx, type CompileOptions } from "./ctx.ts";
import type { Diagnostic } from "./diagnostics/diagnostic.ts";
import type { TraceEntry } from "./post/trace.ts";
import { runTraced } from "./pipeline.ts";

export type { CompileOptions } from "./ctx.ts";
export type { Diagnostic } from "./diagnostics/diagnostic.ts";
export type { DialectName } from "./template/dialects.ts";
export { preview } from "./template/preview.ts";
export { field } from "./template/tokens.ts";
export { writeString } from "./template/write.ts";

export type { TraceEntry } from "./post/trace.ts";

// trace (only with the trace option): one entry per start tag of html, the input element it came from
export type CompileResult = { html: string; diagnostics: Diagnostic[]; trace?: TraceEntry[] };

export const compile = (html: string, options: CompileOptions = {}): CompileResult => {
  const ctx = createCtx(options);
  const out = runTraced(html, ctx);
  return { ...out, diagnostics: ctx.diagnostics.list() };
};

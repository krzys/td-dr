// parse before sanitize keeps source locations intact (docs/decisions.md §3).
import { analyze } from "./analyze/analyze.ts";
import type { Ctx, WidthDecision } from "./ctx.ts";
import { emit } from "./emit/emit.ts";
import { runPasses } from "./passes/index.ts";
import { parse } from "./parse/html.ts";
import { post } from "./post/post.ts";
import { readTrace, type TraceEntry } from "./post/trace.ts";
import { markTree } from "./emit/trace.ts";
import { sanitize } from "./sanitize/sanitize.ts";
import { fontHead } from "./shell/fonts.ts";
import { shell } from "./shell/shell.ts";
import { computeStyles } from "./style/computed.ts";
import { widthDecision } from "./analyze/design-width.ts";
import { createSink } from "./diagnostics/diagnostic.ts";
import { lintDropped, lintPlaceholders, reportTemplate } from "./template/lint.ts";
import { hasTemplate } from "./template/tokens.ts";
import { writeTemplate } from "./template/write.ts";
import { lintInput } from "./lint/input.ts";
import { byteLength, formatBytes, formatKB, GMAIL_CLIP_BYTES, HEAD_STYLE_BYTES } from "./limits.ts";

const clipCheck = (out: string, ctx: Ctx): string => {
  const bytes = byteLength(out);
  if (bytes > GMAIL_CLIP_BYTES) ctx.diagnostics.report("W009", { message: `Output is ${formatKB(bytes)}; Gmail clips messages over ${formatBytes(GMAIL_CLIP_BYTES)}` });
  return out;
};

// A compile whose diagnostics are thrown away: the extra parses and cascades only answer questions.
const quiet = (ctx: Ctx): Ctx => {
  const { trace: _, ...options } = ctx.options;
  return { ...ctx, options, diagnostics: createSink(ctx.options.strict) };
};
const withWidth = (ctx: Ctx, decision: WidthDecision): Ctx => ({
  ...ctx,
  options: decision.width === ctx.options.width ? ctx.options : { ...ctx.options, width: decision.width },
  widthDecision: decision,
});

// Gmail drops the rules past 16 KB of head <style>, the reset included.
const headStyleCheck = (html: string, ctx: Ctx): void => {
  const head = /<head>([\s\S]*?)<\/head>/.exec(html)?.[1] ?? "";
  const bytes = [...head.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].reduce((sum, m) => sum + byteLength(m[1]!), 0);
  if (bytes > HEAD_STYLE_BYTES) ctx.diagnostics.report("W012", { message: `Head styles are ${formatKB(bytes)}; Gmail drops the rules past ${formatBytes(HEAD_STYLE_BYTES)}` });
};

export const runPipeline = (input: string, given: Ctx): string => runTraced(input, given).html;

export const runTraced = (input: string, given: Ctx): { html: string; trace?: TraceEntry[] } => {
  lintPlaceholders(input, given);
  const parsed = sanitize(parse(input, given), given);
  const probe = computeStyles(parsed, quiet(given));
  const ctx = withWidth(given, widthDecision(probe.body, given));
  const { body: styled, fonts, conditions } = computeStyles(parsed, ctx);
  lintInput(styled, ctx, { lang: parsed.meta.lang ?? ctx.options.lang, dark: conditions.dark });
  const marked = ctx.options.trace ? markTree(styled) : undefined;
  const emitted = emit(runPasses(analyze(marked?.tree ?? styled, ctx), ctx), ctx);
  const page = shell(emitted, parsed.meta, ctx, fontHead(fonts, parsed.meta.fontLinks ?? [], styled, ctx));
  headStyleCheck(page, ctx);
  const html = post(page, ctx);
  lintDropped(parsed.body, html, ctx);
  let out = html;
  if (ctx.options.template) out = writeTemplate(html, ctx.options.template, reportTemplate(input, ctx));
  else if (hasTemplate(html)) ctx.diagnostics.report("E014");
  if (!marked) return { html: clipCheck(out, ctx) };
  const read = readTrace(out, marked.found);
  return { html: clipCheck(read.html, ctx), trace: read.trace };
};

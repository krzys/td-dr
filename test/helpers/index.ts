import { createCtx, type CompileOptions, type Ctx } from "../../src/ctx.ts";
import { parse } from "../../src/parse/html.ts";
import { sanitize } from "../../src/sanitize/sanitize.ts";
import { computeStyles } from "../../src/style/computed.ts";
import { DESKTOP, type Env, type StyledDoc, type StyledElement, type StyledNode } from "../../src/style/types.ts";

export const testCtx = (o: CompileOptions = {}): Ctx => createCtx(o);

export const codesOf = (ctx: Ctx): string[] => ctx.diagnostics.list().map((d) => d.code);

// Runs the real parse → sanitize → style stages.
export const styledFrom = (html: string, ctx: Ctx = testCtx()): StyledElement => styledDocFrom(html, ctx).body;

export const styledDocFrom = (html: string, ctx: Ctx = testCtx(), env: Env = DESKTOP): StyledDoc =>
  computeStyles(sanitize(parse(html, ctx), ctx), ctx, env);

// Hand-built node, for rule tests that shouldn't depend on the style stage.
export const el = (
  tag: string,
  style: Record<string, string> = {},
  children: StyledNode[] = [],
  extra: { attrs?: Record<string, string>; declared?: Record<string, string>; line?: number } = {},
): StyledElement => ({
  type: "element",
  tag,
  attrs: extra.attrs ?? {},
  style,
  declared: extra.declared ?? style,
  children,
  loc: { line: extra.line ?? 1, col: 1 },
});

export const text = (t: string): StyledNode => ({ type: "text", text: t });

// parse before sanitize keeps source locations intact (docs/architecture.md#stage-contracts).
import { analyze } from "./analyze/analyze.ts";
import type { Ctx, OtherScreens, WidthDecision } from "./ctx.ts";
import { emit } from "./emit/emit.ts";
import { locKey } from "./ir/index.ts";
import { reportUndecoded } from "./parse/decode.ts";
import { deepest } from "./parse/depth.ts";
import { parse, type ParsedDoc } from "./parse/html.ts";
import { runPasses } from "./passes/index.ts";
import { post } from "./post/post.ts";
import { wrapLines } from "./post/wrap.ts";
import { markTree } from "./emit/trace.ts";
import { readTrace, stripMarkers, type TraceEntry } from "./post/trace.ts";
import { sanitize } from "./sanitize/sanitize.ts";
import { fontHead } from "./shell/fonts.ts";
import { shell } from "./shell/shell.ts";
import { computeStyles } from "./style/computed.ts";
import { widthDecision } from "./analyze/design-width.ts";
import { get } from "./style/props.ts";
import { DESKTOP, type StyledElement, type Unstack } from "./style/types.ts";
import type { Code } from "./diagnostics/codes.ts";
import { createSink, type Diagnostic } from "./diagnostics/diagnostic.ts";
import { diffVariant, tokenize, type Compiled } from "./responsive/diff.ts";
import { shownElsewhere } from "./responsive/keep.ts";
import { layoutNotes, stackedElsewhere, stackNotes } from "./responsive/stack.ts";
import { buildHead, type Found, type Head } from "./responsive/rules.ts";
import { variantsOf, type Variant } from "./responsive/variants.ts";
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

// The layout props a narrower screen may change about an element and its place in a row.
const LAYOUT = ["display", "flex-direction", "flex-wrap", "flex-basis", "flex-grow", "flex-shrink", "width", "min-width", "max-width", "grid-template-columns", "column-gap", "row-gap"] as const;

const sideBorder = (el: StyledElement): boolean =>
  (["left", "right"] as const).some((s) => (Number.parseFloat(get(el.style, `border-${s}-width`) ?? "0") || 0) > 0 && (get(el.style, `border-${s}-style`) ?? "none") !== "none");

// a column the screen spaces with another space-* value (ctx.otherScreens.respaced)
const SPACED = new Set(["space-between", "space-around", "space-evenly"]);
const respacedIn = (was: StyledElement, el: StyledElement): boolean => {
  const a = get(was.style, "justify-content") ?? "";
  const b = get(el.style, "justify-content") ?? "";
  return a !== b && SPACED.has(a) && SPACED.has(b);
};

// What the other screens do differently (ctx.otherScreens).
const otherScreens = (desktop: StyledElement, screens: readonly Screen[]): OtherScreens => {
  const index = (el: StyledElement, out = new Map<string, StyledElement>()): Map<string, StyledElement> => {
    // a ::before / ::after shares its host's loc: the host is the element
    if (el.loc && !out.has(locKey(el.loc))) out.set(locKey(el.loc), el);
    for (const c of el.children) if (c.type === "element") index(c, out);
    return out;
  };
  const base = index(desktop);
  const relaidBelow = new Map<string, number>();
  const sideBorders = new Set([...base].filter(([, el]) => sideBorder(el)).map(([key]) => key));
  const respaced = new Set<string>();
  for (const { variant, styled } of screens) {
    for (const [key, el] of index(styled)) {
      const was = base.get(key);
      if (variant.kind === "width" && was && LAYOUT.some((p) => get(was.style, p) !== get(el.style, p))) relaidBelow.set(key, Math.max(relaidBelow.get(key) ?? 0, variant.env.viewport));
      if (was && respacedIn(was, el)) respaced.add(key);
    }
  }
  return { relaidBelow, sideBorders, respaced };
};

// Gmail drops the rules past 16 KB of head <style>, the reset included.
const headStyleCheck = (html: string, ctx: Ctx): void => {
  const head = /<head>([\s\S]*?)<\/head>/.exec(html)?.[1] ?? "";
  const bytes = [...head.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].reduce((sum, m) => sum + byteLength(m[1]!), 0);
  if (bytes > HEAD_STYLE_BYTES) ctx.diagnostics.report("W012", { message: `Head styles are ${formatKB(bytes)}; Gmail drops the rules past ${formatBytes(HEAD_STYLE_BYTES)}` });
};

const sameDiagnostic = (a: Diagnostic, b: Diagnostic): boolean =>
  a.code === b.code && a.message === b.message && a.loc?.line === b.loc?.line && a.loc?.col === b.loc?.col && a.loc?.file === b.loc?.file;

// What every compile shares so they all emit one structure: elements shown elsewhere, rows stacked elsewhere.
type Shared = { keep: ReadonlyMap<string, string>; stacked: ReadonlyMap<string, Unstack> };

// A screen other than the desktop one, with what the author's rules alone make of it there.
type Screen = { variant: Variant; styled: StyledElement };

// The compiles tell elements apart by their trace markers, so each tag says which author element it came from.
const tracing = (ctx: Ctx): Ctx => (ctx.options.trace ? ctx : { ...ctx, options: { ...ctx.options, trace: true } });

// The desktop compile, with what the author's rules alone make of that screen (as `Screen.styled`).
type Base = Compiled & { styled: StyledElement };

// One other screen, compiled from the shared parse on a quiet ctx.
const compileScreen = (doc: ParsedDoc, given: Ctx, screen: Screen, shared: Shared): Compiled & { diagnostics: Diagnostic[] } => {
  const ctx = tracing(quiet(given));
  const { body } = computeStyles(doc, ctx, screen.variant.env, shared.keep, shared.stacked);
  const marked = markTree(body);
  const html = emit(runPasses(analyze(marked.tree, ctx), ctx), ctx).html;
  return { html, elements: marked.found, diagnostics: ctx.diagnostics.list() };
};

// The base's html with a class on every element a screen changes, and the head rules for them.
const responsive = (doc: ParsedDoc, ctx: Ctx, base: Base, screens: readonly Screen[], shared: Shared): Head | undefined => {
  const found: Found[] = [];
  const reported = [...ctx.diagnostics.list()];
  for (const screen of screens) {
    const compiled = compileScreen(doc, ctx, screen, shared);
    const diff = diffVariant(base, compiled, screen.variant.label);
    if ("error" in diff) {
      // a dropped screen is never emitted, so what it says on the way is not the author's to read
      const notes = layoutNotes(base.styled, screen.styled);
      ctx.diagnostics.report("E017", { message: [diff.error, ...notes].join("; "), hint: diff.hint, loc: diff.loc });
      continue;
    }
    found.push({ variant: screen.variant, overrides: diff.overrides });
    // what only this screen says: once, however many screens say it
    for (const d of compiled.diagnostics) {
      if (reported.some((r) => sameDiagnostic(r, d))) continue;
      reported.push(d);
      ctx.diagnostics.report(d.code as Code, { message: d.message, hint: d.hint, loc: d.loc });
    }
  }
  return buildHead(base.html, tokenize(base.html), found);
};

export const runPipeline = (input: string, given: Ctx): string => runTraced(input, given).html;

type Traced = { html: string; trace?: TraceEntry[] };

// Stages recurse over the tree, so input nested thousands deep runs out of stack in whichever
// one goes deepest first. Nothing is written then, and what was reported before stays.
const outOfStack = (e: unknown): boolean => e instanceof RangeError && /call stack/i.test(e.message);

export const runTraced = (input: string, given: Ctx): Traced => {
  try {
    return stages(input, given);
  } catch (e) {
    if (!outOfStack(e)) throw e;
    const { depth, loc } = deepest(input);
    given.diagnostics.report("E018", { message: `Elements nest ${depth.toLocaleString("en-US")} deep, the deepest here: td;dr ran out of stack and wrote no output`, loc });
    return { html: "" };
  }
};

const stages = (input: string, given: Ctx): Traced => {
  reportUndecoded(input, given);
  lintPlaceholders(input, given);
  // parsed once: the style stage only reads it, so every environment cascades the same doc
  const parsed = sanitize(parse(input, given), given);
  const first = computeStyles(parsed, quiet(given));
  const decided = withWidth(given, widthDecision(first.body, given));
  // the design width splits vw text and resolves vw, so the screens come from a cascade at that width
  const q = quiet(decided);
  const probe = decided.options.width === given.options.width ? first : computeStyles(parsed, q);
  // elements shown on some screens only stay in every compile, so they all have one structure (docs/architecture.md#several-screens-one-structure)
  const screens: Screen[] = variantsOf(probe.conditions).map((variant) => ({ variant, styled: computeStyles(parsed, q, variant.env).body }));
  const ctx: Ctx = screens.length > 0 ? { ...decided, otherScreens: otherScreens(probe.body, screens) } : decided;
  const others = screens.map((s) => s.styled);
  const shared: Shared | undefined = screens.length > 0 ? { keep: shownElsewhere([probe.body, ...others]), stacked: stackedElsewhere(probe.body, others) } : undefined;
  const { body: styled, fonts, conditions } = computeStyles(parsed, ctx, DESKTOP, shared?.keep, shared?.stacked);
  // the screens that stack are compiled quietly, so what they can't carry is said here
  if (shared) for (const n of stackNotes(probe.body, others)) ctx.diagnostics.report("W003", n);
  lintInput(styled, ctx, { lang: parsed.meta.lang ?? ctx.options.lang, dark: conditions.dark });
  // always marked: the screens diff by the markers, and the self-lint places a W006 by them
  const marked = markTree(styled);
  const traced = tracing(ctx);
  const emitted = emit(runPasses(analyze(marked.tree, traced), traced), traced);
  const head = shared ? responsive(parsed, ctx, { html: emitted.html, elements: marked.found, styled: probe.body }, screens, shared) : undefined;
  const page = shell({ ...emitted, html: head?.html ?? emitted.html }, parsed.meta, ctx, fontHead(fonts, parsed.meta.fontLinks ?? [], styled, ctx), head);
  headStyleCheck(page, ctx);
  const posted = post(page, ctx);
  // markers reach the output only when the caller asked for a trace
  const html = ctx.options.trace ? posted : stripMarkers(posted);
  lintDropped(parsed.body, html, ctx);
  let out = html;
  if (ctx.options.template) out = writeTemplate(html, ctx.options.template, reportTemplate(input, ctx));
  else if (hasTemplate(html)) ctx.diagnostics.report("E014");
  if (!ctx.options.trace) return { html: clipCheck(wrapLines(out, ctx), ctx) };
  const read = readTrace(out, marked.found);
  return { html: clipCheck(wrapLines(read.html, ctx), ctx), trace: read.trace };
};

// Stylesheets -> the declarations that apply in one env, with what they land on.
// Also gathers what isn't per element: @layer order, @property, web font rules, and which
// environments the author's rules tell apart.
import type { AtRule, ChildNode, Container, Declaration, Rule } from "postcss";
import type { Ctx } from "../ctx.ts";
import type { SrcLoc } from "../loc.ts";
import { fontFace, fontImport, isSilent, supportsHolds } from "./at-rules.ts";
import { asksDark, inMedia, keepsTextLive, TOP, usableQueries, type EnvScope } from "./conditions.ts";
import type { Decl, Declare, ViewportNotes } from "./declarations.ts";
import { canInline, matchRule, type Select, type Sel } from "./match.ts";
import type { MediaQuery } from "./media.ts";
import { propertyRule, type Registered } from "./registered.ts";
import { hasPseudoElement } from "./selectors.ts";
import { locAt, parseSheet } from "./sheet.ts";
import type { Env, FontRules } from "./types.ts";

// tier: 0 the UA sheet, 1 author
export type Sheet = { css: string; tier: number; origin: SrcLoc | undefined };

export type OrderedDecl = Decl & { order: number; loc: SrcLoc | undefined };

// One style rule's own declarations and the static selectors they reach, when its @media hold here.
export type Block = { tier: number; layer: number; sels: readonly Sel[]; decls: readonly OrderedDecl[] };

export type Collected = {
  // in the order browsers apply them: a nested rule before the declarations that follow it
  blocks: Block[];
  registered: Map<string, Registered>;
  fonts: FontRules;
  queries: MediaQuery[]; // of @media some env can satisfy, in source order
  dark: boolean; // a dark-mode rule lands
  hover: boolean; // a :hover rule some env applies
  liveText: boolean; // vw text that can apply below the design width
  order: number; // declarations seen, so style="" ones come after
};

export type RuleInputs = { env: Env; designWidth: number; select: Select; declare: Declare; notes: ViewportNotes; ctx: Ctx };

type Scope = { tier: number; layer: number; path: string; origin: SrcLoc | undefined; env: EnvScope; rule?: readonly Sel[] };
type Run = RuleInputs & { canInline: (selector: string) => boolean; layers: string[]; anonymous: number; out: Collected };

const register = (run: Run, name: string): number => {
  const at = run.layers.indexOf(name);
  if (at >= 0) return at;
  run.layers.push(name);
  return run.layers.length - 1;
};

const styleRule = (rule: Rule, scope: Scope, run: Run): void => {
  const own = rule.nodes.filter((n): n is Declaration => n.type === "decl");
  const hasContent = own.some((n) => n.prop.toLowerCase() === "content");
  // & can't stand for a pseudo-element, and noise never got this far
  const parents = scope.rule?.filter((p) => !hasPseudoElement(p.match));
  if (parents?.length === 0) return;
  const m = matchRule(rule, parents, own.length, hasContent, scope.env, run.env, locAt(scope.origin, rule), run.select, run.ctx);
  if (m.hoverSeen) run.out.hover = true;
  walk(rule, { ...scope, env: { ...scope.env, hover: scope.env.hover || m.hoverLands }, rule: m.sels }, run);
};

const atRule = (node: AtRule, scope: Scope, run: Run): void => {
  const { ctx } = run;
  const name = node.name.toLowerCase();
  const loc = locAt(scope.origin, node);
  if (name === "container") {
    ctx.diagnostics.report("W001", { message: "@container rules are not applied", hint: "Only plain style rules are inlined.", loc });
  } else if (name === "media") {
    const ok = usableQueries(node.params, scope.env, loc, ctx);
    if (ok.length === 0) return;
    const env = inMedia(ok, scope.env, run.env, run.designWidth);
    if (env.possible) run.out.queries.push(...ok);
    walk(node, { ...scope, env }, run);
  } else if (name === "supports") {
    if (supportsHolds(node, loc, run.canInline, ctx)) walk(node, scope, run);
  } else if (name === "layer") {
    const prefix = scope.path ? `${scope.path}.` : "";
    if (!node.nodes) {
      for (const n of node.params.split(",")) if (n.trim()) register(run, prefix + n.trim());
      return;
    }
    const full = prefix + (node.params.trim() || `<anonymous ${run.anonymous++}>`);
    walk(node, { ...scope, layer: register(run, full), path: full }, run);
  } else if (name === "font-face") {
    run.out.fonts.faces.push(fontFace(node));
  } else if (name === "import") {
    const kept = fontImport(node, loc, ctx);
    if (kept !== undefined) run.out.fonts.imports.push(kept);
  } else if (name === "property") {
    const r = propertyRule(node, loc, ctx);
    if (r) run.out.registered.set(...r);
  } else if (!isSilent(name) && node.nodes) {
    ctx.diagnostics.report("W001", { message: `@${name} rules are not supported and were skipped`, loc });
  }
};

// Declarations get their order as they're met, so ones after a nested rule
// still beat it, like browsers' nested declarations rules.
const walk = (container: Container, scope: Scope, run: Run): void => {
  const decls: OrderedDecl[] = [];
  container.each((node: ChildNode) => {
    if (node.type === "decl") {
      if (scope.rule) for (const d of run.declare(node, () => locAt(scope.origin, node))) decls.push({ ...d, order: run.out.order++, loc: locAt(scope.origin, node) });
    } else if (node.type === "rule") styleRule(node, scope, run);
    else if (node.type === "atrule") atRule(node, scope, run);
  });
  const sels = scope.rule ?? [];
  if (asksDark(scope.env) && decls.length > 0 && sels.length > 0) run.out.dark = true;
  if (keepsTextLive(scope.env) && decls.some((d) => d.textVw) && sels.some((sel) => sel.hits.length > 0)) run.out.liveText = true;
  if (!scope.env.live) return;
  const applied = sels.filter((sel) => sel.kind === "static");
  for (const sel of applied) if (sel.hits.length > 0) for (const d of decls) run.notes(d, d.loc);
  if (applied.length > 0 && decls.length > 0) run.out.blocks.push({ tier: scope.tier, layer: scope.layer, sels: applied, decls });
};

export const collectRules = (sheets: readonly Sheet[], inputs: RuleInputs): Collected => {
  const out: Collected = { blocks: [], registered: new Map(), fonts: { imports: [], faces: [] }, queries: [], dark: false, hover: false, liveText: false, order: 0 };
  const run: Run = { ...inputs, canInline: canInline(inputs.select), layers: [], anonymous: 0, out };
  for (const s of sheets) {
    const root = parseSheet(s.css, s.origin, inputs.ctx);
    if (root) walk(root, { tier: s.tier, layer: -1, path: "", origin: s.origin, env: TOP }, run);
  }
  return out;
};

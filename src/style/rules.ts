// Stylesheets -> the declarations that apply in one env, with what they land on.
// Also gathers what isn't per element: @layer order, @property, web font rules, and which
// environments the author's rules tell apart.
import type { AtRule, ChildNode, Container, Declaration, Rule } from "postcss";
import type { Ctx } from "../ctx.ts";
import type { SrcLoc } from "../loc.ts";
import type { DomElement } from "../parse/dom.ts";
import { fontFace, fontImport, isSilent, supportsHolds, unsafeFace } from "./at-rules.ts";
import { asksDark, inMedia, keepsTextLive, TOP, usableQueries, type EnvScope } from "./conditions.ts";
import type { Decl, Declare, ViewportNotes } from "./declarations.ts";
import { canInline, matchRule, type Select, type Sel } from "./match.ts";
import type { MediaQuery } from "./media.ts";
import { propertyRule, type Registered } from "./registered.ts";
import { anyCheckedState, hasChecked, hasPseudoElement } from "./selectors.ts";
import { locAt, parseSheet } from "./sheet.ts";
import type { Env, FontRules } from "./types.ts";
import { CSS_NESTING_DEPTH } from "../limits.ts";

// tier: 0 the UA sheet, 1 author
export type Sheet = { css: string; tier: number; origin: SrcLoc | undefined };

export type OrderedDecl = Decl & { order: number; loc: SrcLoc | undefined };

// One style rule's own declarations and the static selectors they reach, when its @media hold here.
export type Block = { tier: number; layer: number; sels: readonly Sel[]; decls: readonly OrderedDecl[] };

// :checked rules that would land in another state (docs/support.md#css-values).
// `shows`: what such a rule gives a display, so it may be hidden only in the initial state.
export type CheckedRules = { loc: SrcLoc | undefined; lands: boolean; shows: Set<DomElement> };

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
  checked: CheckedRules;
};

export type RuleInputs = { env: Env; designWidth: number; select: Select; declare: Declare; notes: ViewportNotes; ctx: Ctx };

// depth: the rules and at-rules with a body around this one
type Scope = { tier: number; layer: number; path: string; origin: SrcLoc | undefined; env: EnvScope; depth: number; rule?: readonly Sel[] };
type Run = RuleInputs & { canInline: (selector: string) => boolean; layers: string[]; anonymous: number; tooDeep: boolean; out: Collected };

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
  walk(rule, { ...scope, env: { ...scope.env, hover: scope.env.hover || m.hoverLands }, depth: scope.depth + 1, rule: m.sels }, run);
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
    walk(node, { ...scope, env, depth: scope.depth + 1 }, run);
  } else if (name === "supports") {
    if (supportsHolds(node, loc, run.canInline, ctx)) walk(node, { ...scope, depth: scope.depth + 1 }, run);
  } else if (name === "layer") {
    const prefix = scope.path ? `${scope.path}.` : "";
    if (!node.nodes) {
      for (const n of node.params.split(",")) if (n.trim()) register(run, prefix + n.trim());
      return;
    }
    const full = prefix + (node.params.trim() || `<anonymous ${run.anonymous++}>`);
    walk(node, { ...scope, layer: register(run, full), path: full, depth: scope.depth + 1 }, run);
  } else if (name === "font-face") {
    const unsafe = unsafeFace(node);
    if (unsafe) ctx.diagnostics.report("I001", { ...unsafe, loc });
    else run.out.fonts.faces.push(fontFace(node));
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

const checkedRule = (container: Container, sels: readonly Sel[], decls: readonly OrderedDecl[], scope: Scope, run: Run): void => {
  const out = run.out.checked;
  const shows = decls.some((d) => d.prop === "display" && d.value.trim().toLowerCase() !== "none");
  for (const sel of sels) {
    if (!hasChecked(sel.match)) continue;
    let any: DomElement[] = [];
    try {
      any = run.select(anyCheckedState(sel.match));
    } catch {
      continue; // W002 already, from matching
    }
    const flips = any.filter((el) => !sel.hits.includes(el));
    if (flips.length === 0) continue;
    if (!out.lands) out.loc = locAt(scope.origin, container as Rule);
    out.lands = true;
    if (shows) for (const el of flips) out.shows.add(el);
  }
};

// Declarations get their order as they're met, so ones after a nested rule
// still beat it, like browsers' nested declarations rules.
const walk = (container: Container, scope: Scope, run: Run): void => {
  const decls: OrderedDecl[] = [];
  container.each((node: ChildNode) => {
    if (node.type !== "decl" && "nodes" in node && node.nodes && scope.depth >= CSS_NESTING_DEPTH) {
      // once per sheet: what's inside is as deep or deeper
      if (!run.tooDeep) run.ctx.diagnostics.report("W002", { message: `Rules nested more than ${CSS_NESTING_DEPTH} deep were ignored`, hint: "They parsed, but rules past this depth are dropped; flatten the nesting.", loc: locAt(scope.origin, node) });
      run.tooDeep = true;
    } else if (node.type === "decl") {
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
  if (decls.length > 0) checkedRule(container, sels, decls, scope, run);
  if (applied.length > 0 && decls.length > 0) run.out.blocks.push({ tier: scope.tier, layer: scope.layer, sels: applied, decls });
};

export const collectRules = (sheets: readonly Sheet[], inputs: RuleInputs): Collected => {
  const out: Collected = { blocks: [], registered: new Map(), fonts: { imports: [], faces: [] }, queries: [], dark: false, hover: false, liveText: false, order: 0, checked: { loc: undefined, lands: false, shows: new Set() } };
  const run: Run = { ...inputs, canInline: canInline(inputs.select), layers: [], anonymous: 0, tooDeep: false, out };
  for (const s of sheets) {
    const root = parseSheet(s.css, s.origin, inputs.ctx);
    run.tooDeep = false;
    if (root) walk(root, { tier: s.tier, layer: -1, path: "", origin: s.origin, env: TOP, depth: 0 }, run);
  }
  return out;
};

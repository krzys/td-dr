// The operator rewrite (docs/templates.md#native-component-code). JS can't intercept `&&`, `?:`, `===` or a statement `if`, so
// email modules call the runtime instead; on plain values every call is the operator itself.
// parse (ast.ts) -> walk the tree with each node's site (scope.ts) -> decide per node what can be
// rewritten (classify.ts) -> plan its edits (lower.ts) -> apply them with a source map (edits.ts).
import { children, isFunction, nameOf, parse, type Node, type Program, type Statement } from "./ast.ts";
import { decide, planOperator, whyIf, whySwitch, type Reason, type Site } from "./classify.ts";
import { applyEdits, editor, type SourceMap } from "./edits.ts";
import { lowerAssign, lowerCatch, lowerGuards, lowerOperator, lowerPick, lowerPushIf, lowerSwitch, wrapTest, type Lowering } from "./lower.ts";
import { catchScope, functionScope, loopHead, scopeOf } from "./scope.ts";
import { pushable, pushParam, ssrImports } from "./ssr.ts";

export const RUNTIME = "tddr:template";
// Externalized imports never reach a resolveId hook, so the renderers' shims are imported by name.
export const SHIM = "tddr:shim/";
const SHIMMED = new Set(["react/jsx-runtime", "react/jsx-dev-runtime", "vue/server-renderer", "vue"]);

// one module's rewrite: its edits and what it imports from vue/server-renderer
type Run = Lowering & { ssr: ReadonlyMap<string, string> };

// a statement list, where each if or switch may become one value (and then takes the rest along)
const list = (r: Run, stmts: readonly Statement[], d: number, site: Site, tail: boolean): void => {
  for (const [i, s] of stmts.entries()) {
    const plan = decide(s, stmts, i, tail, site);
    switch (plan.kind) {
      case "guards":
        return lowerGuards(r, plan, d, site);
      case "pick":
        return lowerPick(r, plan, d, site);
      case "assign":
        lowerAssign(r, plan, d, site);
        break;
      case "keep":
        visit(r, s, d, site, plan.stopped);
        break;
      default:
        plan satisfies never;
    }
  }
};

// `stopped`: why a statement `decide` kept couldn't become a value, for its runtime guard
const visit = (r: Run, n: Node, d: number, site: Site, stopped?: Reason): void => {
  const { ed } = r;
  let inner = site;
  if (isFunction(n)) {
    // callbacks inside a render (v-for bodies) write to the same stream
    const fn: Site = { push: pushParam(n) ?? site.push, scope: functionScope(n, site.scope), loop: false, tr: false, fn: n.body ?? n };
    for (const p of n.params) visit(r, p, d + 1, fn);
    if (n.body?.type === "BlockStatement") list(r, n.body.body, d + 2, fn, !n.generator);
    else if (n.body) visit(r, n.body, d + 1, fn);
    return;
  }
  switch (n.type) {
    case "Program":
      return list(r, n.body, d + 1, site, false);
    case "BlockStatement":
      return list(r, n.body, d + 1, { ...site, scope: scopeOf(n.body, site.scope, false) }, false);
    case "TryStatement":
      inner = { ...site, tr: true };
      break;
    case "CatchClause":
      lowerCatch(r, n, d);
      inner = { ...site, scope: catchScope(n.param, site.scope) };
      break;
    case "LogicalExpression":
    case "ConditionalExpression":
    case "UnaryExpression":
    case "BinaryExpression": {
      const plan = planOperator(n);
      if (plan && !lowerOperator(r, n, plan, d)) return;
      break;
    }
    case "IfStatement":
      if (site.push && pushable(n, site.push)) return lowerPushIf(r, n, site.push, d, site);
      wrapTest(r, n.test, "test", d, whyIf(n, site, stopped));
      break;
    case "WhileStatement":
    case "DoWhileStatement":
      wrapTest(r, n.test, "test", d, "loop");
      inner = { ...site, loop: true };
      break;
    case "ForStatement":
    case "ForInStatement":
    case "ForOfStatement":
      if (n.type === "ForStatement" && n.test) wrapTest(r, n.test, "test", d, "loop");
      inner = { ...site, loop: true, scope: scopeOf(loopHead(n), site.scope, false) };
      break;
    case "SwitchStatement":
      lowerSwitch(r, n, whySwitch(n, site, stopped), d);
      inner = { ...site, scope: scopeOf(n.cases.flatMap((c) => c.consequent), site.scope, false) };
      break;
    case "ImportDeclaration":
    case "ExportNamedDeclaration":
    case "ExportAllDeclaration": {
      const src = n.source;
      if (src && SHIMMED.has(src.value)) ed.replace(src.start, src.end, JSON.stringify(SHIM + src.value), d);
      break;
    }
    case "CallExpression": {
      // v-for over a field needs the stream to write the each block to
      const args = n.arguments;
      if (site.push && r.ssr.get(nameOf(n.callee) ?? "") === "ssrRenderList" && args.length === 2) ed.close(args[1]!.end, `, ${site.push}`, d);
      break;
    }
  }
  for (const c of children(n)) visit(r, c, d + 1, inner);
};

const moduleSite = (program: Program): Site => ({ push: undefined, scope: scopeOf(program.body, undefined, true), loop: false, tr: false, fn: program });

export const rewrite = (code: string, source: string): { code: string; map: SourceMap } | undefined => {
  const program = parse(code, source);
  // a namespace no name in the module starts with
  let ns = "__tddr";
  while (code.includes(ns)) ns += "_";
  let slots = 0;
  const r: Run = {
    ed: editor(code),
    ns,
    slot: () => `${ns}_s${slots++}`,
    walk: { visit: (n, d, site) => visit(r, n, d, site), list: (stmts, d, site, tail) => list(r, stmts, d, site, tail) },
    ssr: ssrImports(program),
  };
  visit(r, program, 0, moduleSite(program));
  const { edits } = r.ed;
  if (edits.length === 0) return undefined;
  // on the first line, so every other line keeps its number
  const at = code.startsWith("#!") ? code.indexOf("\n") + 1 : 0;
  edits.push({ start: at, end: at, text: `import * as ${ns} from ${JSON.stringify(RUNTIME)};`, group: 1, depth: -1 });
  return applyEdits(code, edits, source);
};

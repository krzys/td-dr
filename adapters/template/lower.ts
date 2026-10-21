// The edits each rewrite makes: operators become runtime calls, planned statements become one
// branch value (guards / pick / guardsAll), Vue's render ifs become pushIf. The code inside an arm
// is rewritten too, through `walk` (the traversal in transform.ts).
import { type CatchClause, type IfStatement, type Node, type Statement, type SwitchStatement } from "./ast.ts";
import type { AssignPlan, GuardPlan, OperatorPlan, PickPlan, Reason, Site } from "./classify.ts";
import { findToken, onOneLine, type Editor } from "./edits.ts";
import { scopeOf } from "./scope.ts";
import { isPlaceholder } from "./ssr.ts";

export type Walk = {
  visit: (n: Node, d: number, site: Site) => void;
  list: (stmts: readonly Statement[], d: number, site: Site, tail: boolean) => void;
};
// what lowering writes with: the module's edits, the runtime's namespace, a fresh variable name
// per switch, and the traversal for the code it keeps
export type Lowering = { ed: Editor; ns: string; slot: () => string; walk: Walk };

// `fn(t[, "why"])` around a test: the runtime decides it on plain values, throws on a field
export const wrapTest = ({ ed, ns }: Lowering, t: Node, fn: string, d: number, why?: Reason): void => {
  const p = ed.own(t);
  ed.open(t.start, `${ns}.${fn}(${p ? "(" : ""}`, d);
  ed.close(t.end, `${p ? ")" : ""}${why ? `, "${why}"` : ""})`, d);
};

// an operator as its runtime call; false when the node's children need no visit
export const lowerOperator = (L: Lowering, n: Node, plan: OperatorPlan, d: number): boolean => {
  const { ed, ns } = L;
  const arm = (from: number, to: number, op: string) => ed.paren(findToken(ed.code, from, to, op) + op.length);
  switch (n.type) {
    case "LogicalExpression": {
      const { left: l, right: r, operator: op } = n;
      if (plan.armEffect) wrapTest(L, l, "test", d + 0.5, "armEffect");
      ed.open(n.start, `${ns}.${plan.fn}(`, d);
      const p = arm(l.end, r.start, op);
      ed.token(l.end, r.start, op, `, () => ${p}`, d);
      ed.close(n.end, p ? "))" : ")", d);
      return true;
    }
    case "ConditionalExpression": {
      const { test: t, consequent: a, alternate: b } = n;
      if (plan.armEffect) wrapTest(L, t, "test", d + 0.5, "armEffect");
      ed.open(n.start, `${ns}.${plan.fn}(`, d);
      const pa = arm(t.end, a.start, "?");
      const pb = arm(a.end, b.start, ":");
      ed.token(t.end, a.start, "?", `, () => ${pa}`, d);
      ed.token(a.end, b.start, ":", `${pa && ")"}, () => ${pb}`, d);
      ed.close(n.end, pb ? "))" : ")", d);
      return true;
    }
    case "UnaryExpression": {
      const op = n.operator;
      if (op === "typeof" && n.argument.type === "Identifier") {
        // an undeclared name is fine after typeof and nowhere else
        const name = n.argument.name;
        ed.replace(n.start, n.end, `(typeof ${name} === "undefined" ? "undefined" : ${ns}.${plan.fn}(${name}))`, d);
        return false;
      }
      ed.replace(n.start, n.start + op.length, `${ns}.${plan.fn}(`, d);
      ed.close(n.end, ")", d);
      return true;
    }
    case "BinaryExpression":
      ed.open(n.start, `${ns}.${plan.fn}(`, d);
      ed.token(n.left.end, n.right.start, n.operator, ",", d);
      ed.close(n.end, ")", d);
      return true;
    default:
      throw new Error(`tddr: no operator rewrite for ${n.type}`);
  }
};

// an author's catch must not swallow what a template can't do
export const lowerCatch = ({ ed, ns }: Lowering, n: CatchClause, d: number): void => {
  const { body, param } = n;
  const e = param?.type === "Identifier" ? param.name : `${ns}_e`;
  if (!param) ed.replace(n.start, body.start, `catch (${e}) `, d);
  else if (param.type !== "Identifier") {
    // destructured: catch the whole error, rethrow, then take it apart
    const pattern = onOneLine(ed.code.slice(param.start, param.end));
    ed.replaceLines(param.start, param.end, e, d);
    // the body in a block of its own: a default naming one of its declarations must still see the outer name
    ed.open(body.start + 1, `${ns}.rethrow(${e}); let ${pattern} = ${e}; {`, d + 1);
    ed.close(body.end - 1, "}", d + 1);
  }
  if (!param || param.type === "Identifier") ed.open(body.start + 1, `${ns}.rethrow(${e});`, d + 1);
};

// A switch that stays a statement. JS compares the cases of switch (true) with ===, so a field there
// would never match. The discriminant is kept in a variable of its own so it runs once, outside the
// switch's scope.
export const lowerSwitch = (L: Lowering, n: SwitchStatement, why: Reason | undefined, d: number): void => {
  const { ed, ns } = L;
  const disc = n.discriminant;
  if (!n.cases.some((c) => c.test)) return wrapTest(L, disc, "switchOn", d, why);
  const slot = L.slot();
  ed.open(n.start, `{ let ${slot}; `, d);
  ed.open(disc.start, `${ns}.switchOn(${slot} = `, d + 1);
  ed.close(disc.end, `${why ? `, "${why}"` : ""})`, d + 1);
  ed.close(n.end, " }", d);
  for (const { test } of n.cases) {
    if (!test) continue;
    const p = ed.own(test);
    ed.open(test.start, `${ns}.onCase(${p ? "(" : ""}`, d);
    ed.close(test.end, `${p ? ")" : ""}, ${slot})`, d);
  }
};

// `if (T) A else if (U) B else C` in a Vue SSR render becomes one pushIf call
export const lowerPushIf = (L: Lowering, n: IfStatement, push: string, d: number, site: Site): void => {
  const { ed, ns, walk } = L;
  let head = `${ns}.pushIf(${push}, [[() => `;
  let from = n.start;
  for (let cur = n; ; ) {
    const { test, consequent: then, alternate: alt } = cur;
    const p = ed.own(test);
    ed.replace(from, test.start, head + (p ? "(" : ""), d);
    const block = then.type === "BlockStatement";
    ed.replace(test.end, then.start, `${p ? ")" : ""}, () => ${block ? "" : "{"}`, d);
    if (!block) ed.close(then.end, "}", d + 0.5);
    if (alt?.type === "IfStatement") {
      head = "], [() => ";
      from = then.end;
      cur = alt;
      continue;
    }
    if (!alt) ed.close(n.end, "]], null);", d);
    else {
      const altBlock = alt.type === "BlockStatement";
      ed.replace(then.end, alt.start, `]], () => ${altBlock ? "" : "{"}`, d);
      ed.close(alt.end, `${altBlock ? "" : "}"}${isPlaceholder(alt, push) ? ", true" : ""});`, d);
    }
    break;
  }
  for (let cur = n; ; ) {
    walk.visit(cur.test, d + 1, site);
    walk.visit(cur.consequent, d + 1, site);
    const alt = cur.alternate;
    if (alt?.type !== "IfStatement") {
      if (alt) walk.visit(alt, d + 1, site);
      return;
    }
    cur = alt;
  }
};

// the statements of an arm, which is a thunk's body
const armBody = ({ walk }: Lowering, b: Statement, d: number, site: Site, tail: boolean): void => {
  if (b.type === "BlockStatement") walk.list(b.body, d + 1, { ...site, scope: scopeOf(b.body, site.scope, false) }, tail);
  else walk.list([b], d + 1, site, tail);
};

export const lowerGuards = (L: Lowering, { s, arms, last, moved, rest }: GuardPlan, d: number, site: Site): void => {
  const { ed, ns, walk } = L;
  const thunk = (b: Statement, from: number, prefix: string) => {
    if (b.type === "BlockStatement") ed.replaceLines(from, b.start, prefix, d);
    else {
      ed.replaceLines(from, b.start, `${prefix}{`, d);
      ed.close(b.end, "}", d + 0.5);
    }
    armBody(L, b, d, site, true);
  };
  arms.forEach(({ test, body }, i) => {
    const p = ed.own(test) ? "(" : "";
    ed.replaceLines(i ? arms[i - 1]!.body.end : s.start, test.start, `${i ? "], [" : `return ${ns}.guards([[`}() => ${p}`, d);
    walk.visit(test, d + 1, site);
    thunk(body, test.end, `${p && ")"}, () => `);
  });
  if (last) {
    thunk(last, arms.at(-1)!.body.end, "]], () => ");
    ed.close(s.end, ");", d);
    walk.list(rest, d, site, true);
  } else if (moved.length) {
    ed.close(s.end, "]], () => {", d);
    walk.list(moved, d + 1, site, true);
    ed.close(moved.at(-1)!.end, "});", d);
  } else ed.close(s.end, "]]);", d);
};

export const lowerPick = (L: Lowering, { s, groups, moved, rest }: PickPlan, d: number, site: Site): void => {
  const { ed, ns, walk } = L;
  const { discriminant: disc, cases } = s;
  const dn = `${ns}_d`;
  const dp = ed.own(disc) ? "(" : "";
  const inner: Site = { ...site, scope: scopeOf(cases.flatMap((c) => c.consequent), site.scope, false) };
  ed.replaceLines(s.start, disc.start, `return ${ns}.pick(${dp}`, d);
  walk.visit(disc, d + 1, site);
  ed.replaceLines(disc.end, cases[0]!.start, `${dp && ")"}, (${dn}) => [`, d);
  for (const g of groups) {
    const k = g.members.length;
    const isDefault = g.members.some((m) => !m.test);
    g.members.forEach((m, j) => {
      const next = j < k - 1 ? g.members[j + 1]!.start : g.body[0]!.start;
      // the cases grouped with `default` decide nothing: the last of them opens the else arm
      if (isDefault || !m.test) {
        ed.replaceLines(m.start, next, j === k - 1 ? "[null, () => {" : "", d);
        return;
      }
      const t = m.test;
      ed.replaceLines(m.start, t.start, `${j ? "" : "[() => "}${j < k - 1 ? `${ns}.or(` : ""}${ns}.eq(${dn}, `, d);
      walk.visit(t, d + 1, inner);
      ed.replaceLines(t.end, next, j < k - 1 ? "), () => " : `)${")".repeat(k - 1)}, () => {`, d);
    });
    const { live, dead, block, end } = g.run;
    walk.list(live, d + 1, block ? { ...inner, scope: scopeOf(live, inner.scope, false) } : inner, true);
    // a `break` after the return can't stay in an arrow; one after the last case is cut with the rest
    for (const x of dead) if (g !== groups.at(-1) || x.start < end) ed.replaceLines(x.start, x.end, "", d);
    ed.close(end, "}],", d);
  }
  ed.replaceLines(groups.at(-1)!.run.end, s.end, moved.length ? "], () => {" : "]);", d);
  if (moved.length) {
    walk.list(moved, d + 1, site, true);
    ed.close(moved.at(-1)!.end, "});", d);
  } else walk.list(rest, d, site, true);
};

// One variable with an assignment per arm is `v = guards(…)`; otherwise every arm returns all the
// variables and keeps the old value of the ones it doesn't assign.
export const lowerAssign = (L: Lowering, { s, arms, last, vs, values }: AssignPlan, d: number, site: Site): void => {
  const { ed, ns, walk } = L;
  const names = vs.join(", ");
  const thunk = (b: Statement, i: number, from: number, prefix: string) => {
    const block = b.type === "BlockStatement";
    const one = values?.[i];
    if (!one) {
      ed.replaceLines(from, block ? b.start + 1 : b.start, `${prefix}((${names}) => {`, d);
      if (block) ed.replaceLines(b.end - 1, b.end, `;return [${names}]; })(${names})`, d);
      else ed.close(b.end, `;return [${names}]; })(${names})`, d + 0.5);
      armBody(L, b, d, site, false);
      return;
    }
    const { stmts, value } = one;
    const bsite: Site = block ? { ...site, scope: scopeOf(stmts, site.scope, false) } : site;
    if (stmts.length === 1) {
      const p = ed.own(value);
      ed.replaceLines(from, value.start, prefix + (p ? "(" : ""), d);
      walk.visit(value, d + 1, bsite);
      ed.replaceLines(value.end, b.end, p ? ")" : "", d);
      return;
    }
    ed.replaceLines(from, b.start, prefix, d);
    for (const x of stmts.slice(0, -1)) walk.visit(x, d + 1, bsite);
    ed.replaceLines(stmts.at(-1)!.start, value.start, "return ", d + 1);
    walk.visit(value, d + 2, bsite);
  };
  arms.forEach(({ test, body }, i) => {
    const p = ed.own(test) ? "(" : "";
    const head = values ? `${vs[0]} = ${ns}.guards([[` : `;[${names}] = ${ns}.guardsAll([[`;
    ed.replaceLines(i ? arms[i - 1]!.body.end : s.start, test.start, `${i ? "], [" : head}() => ${p}`, d);
    walk.visit(test, d + 1, site);
    thunk(body, i, test.end, `${p && ")"}, () => `);
  });
  if (last) {
    thunk(last, arms.length, arms.at(-1)!.body.end, "]], () => ");
    ed.close(s.end, ");", d);
  } else ed.close(s.end, `]], () => ${values ? vs[0] : `[${names}]`});`, d);
};

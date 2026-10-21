// What the rewrite does with each statement `if` and `switch` (docs/templates.md#native-component-code): a plan when the
// statement can become one branch value, else the reason it stays a statement. A statement that
// stays is still guarded at run time (`test(x, reason)`), so a template field deciding it throws
// with the reason's wording (ops.ts); on plain values it runs as written.
import { type ESTree, type Expression, type IfStatement, type Node, type Statement, type SwitchCase, type SwitchStatement } from "./ast.ts";
import { effects } from "./effects.ts";
import { declared, hasVar, isLocalLet, letNames, mentionedByFunction, mentions, type Scope } from "./scope.ts";
import { armOk, assigned, awaits, bodiesOf, caseOf, chainOf, declaredDeep, endsInReturn, hasReturn, jumps, listOk, localAssign, returns, simple, type Arm, type CaseRun } from "./statements.ts";

// Where a node sits: its scope, whether a loop or a try encloses it within its function, the
// function itself, and the stream a Vue SSR render writes to (whose ifs become pushIf instead).
export type Site = { push: string | undefined; scope: Scope; loop: boolean; tr: boolean; fn: Node };

// the wording keys of ops.ts's STATEMENT and SWITCH tables
export const REASONS = ["loop", "effects", "assign", "armEffect", "closure", "shadow", "tryAssign", "await", "hoist", "jump", "loopReturn", "midReturn", "tryReturn", "grouped", "break", "fall"] as const;
export type Reason = (typeof REASONS)[number];

// `if (T) {…return}` + the rest of the block, or an if / else-if / else that returns in every arm:
// guards([[test, arm], …], else). `moved` is the rest when it becomes the else.
export type GuardPlan = { kind: "guards"; s: IfStatement; arms: Arm[]; last: Statement | undefined; moved: Statement[]; rest: Statement[] };
// a switch whose cases all return: pick(discriminant, eq tests per case group), `default` the else
export type CaseGroup = { members: SwitchCase[]; body: Statement[]; run: CaseRun };
export type PickPlan = { kind: "pick"; s: SwitchStatement; groups: CaseGroup[]; moved: Statement[]; rest: Statement[] };
// `let v; if (c) v = A; else v = B;`: one variable whose every arm ends in its assignment is
// `v = guards(…)`, `values` holding each arm's statements and assigned value (the arms, then the
// else); otherwise every arm returns all of `vs`
export type ArmValue = { stmts: Statement[]; value: Expression };
export type AssignPlan = { kind: "assign"; s: IfStatement; arms: Arm[]; last: Statement | undefined; vs: string[]; values: ArmValue[] | undefined };
// stays a statement; `stopped` is why a return-shaped one couldn't move, when that was tried
export type Keep = { kind: "keep"; stopped: Reason | undefined };
export type Decision = GuardPlan | PickPlan | AssignPlan | Keep;

const KEEP: Keep = { kind: "keep", stopped: undefined };

// the rest runs in a template whichever arm was taken, so it may not do anything but declare
// (an if that assigns a let the rest itself declares is fine: nothing outside sees it)
const restOk = (moved: readonly Statement[], shapeOnly = false): boolean => {
  const lets = letNames(moved);
  return moved.every((x) => x.type === "FunctionDeclaration" || armOk(x, undefined, shapeOnly) || localAssign(x, lets, shapeOnly));
};

// whether the rest can move into the else thunk: true, or what stops it (undefined: nothing to say)
const movable = (s: Statement, before: readonly Statement[], moved: readonly Statement[]): true | Reason | undefined => {
  if ([s, ...moved].some((x) => awaits(x) || hasVar(x))) return undefined;
  // an effect inside one of the rest's expressions is named as such
  if (!restOk(moved)) return restOk(moved, true) ? "armEffect" : undefined;
  // the rest moves into a thunk: whatever stays behind can't use a name it declares
  const names = declared(moved);
  if (names.size && [...before, s].some((x) => mentions(x, names))) return "hoist";
  return true;
};

const planGuards = (s: IfStatement, before: readonly Statement[], rest: Statement[]): GuardPlan | Reason | undefined => {
  const chain = chainOf(s);
  if (!bodiesOf(chain).every((b) => returns(b) && armOk(b))) return undefined;
  // each test runs, whichever arm is taken, once the arms are thunks of one value
  if (chain.arms.slice(1).some((a) => effects(a.test))) return "armEffect";
  const moved = chain.last ? [] : rest;
  const ok = movable(s, before, moved);
  return ok === true ? { kind: "guards", s, ...chain, moved, rest } : ok;
};

const planPick = (s: SwitchStatement, before: readonly Statement[], rest: Statement[]): PickPlan | Reason | undefined => {
  const cases = s.cases;
  const groups: CaseGroup[] = [];
  let pending: SwitchCase[] = [];
  for (const c of cases) {
    pending.push(c);
    if (c.consequent.length) {
      groups.push({ members: pending, body: c.consequent, run: caseOf(c.consequent) });
      pending = [];
    }
  }
  if (pending.length || !groups.length) return undefined;
  if (!groups.every((g) => endsInReturn(g.run.live))) return undefined;
  const tests = cases.flatMap((c) => (c.test ? [c.test] : []));
  if ([s.discriminant, ...tests].some((x) => effects(x))) return "armEffect";
  if (!groups.every((g) => listOk(g.run.live))) return groups.every((g) => listOk(g.run.live, undefined, true)) ? "armEffect" : undefined;
  // a case grouped with the default never decides anything, so it may only be a plain value
  if (groups.some((g) => g.members.some((m) => !m.test) && g.members.some((m) => m.test && !simple(m.test)))) return "grouped";
  const moved = cases.some((c) => !c.test) ? [] : rest;
  const ok = movable(s, before, moved);
  if (ok !== true) return ok;
  // each case's names stay in its own thunk
  for (const g of groups) {
    const mine = declared(g.body);
    const others = [s.discriminant, ...tests, ...groups.filter((x) => x !== g).flatMap((x) => x.body), ...moved];
    if (mine.size && others.some((o) => mentions(o, mine))) return "hoist";
  }
  return { kind: "pick", s, groups, moved, rest };
};

// `if` / else-if / else assigning lets: the plan when it can be one value, else what stops it
const planAssign = (s: IfStatement, site: Site): AssignPlan | Reason => {
  const { arms, last } = chainOf(s);
  const bodies = bodiesOf({ arms, last });
  const targets = new Set<string>();
  for (const b of bodies) assigned(b, targets);
  // a let an arm declares and assigns itself is not the if's result (unless an outer let has the name: a shadow)
  const own = new Set<string>();
  // a name leaves the result only when every arm that assigns it also declares it
  const outer = new Set<string>();
  for (const b of bodies) {
    const dec = declaredDeep(b);
    dec.forEach((x) => own.add(x));
    for (const t of assigned(b)) if (!dec.has(t)) outer.add(t);
  }
  const vs = [...targets].filter((t) => outer.has(t) || isLocalLet(site.scope, t, s.start));
  // declarations, then the assignment: the arm's value
  const single = (b: Statement): ArmValue | undefined => {
    const stmts = b.type === "BlockStatement" ? b.body : [b];
    const end = stmts.at(-1);
    if (end?.type !== "ExpressionStatement" || !stmts.slice(0, -1).every((x) => x.type === "VariableDeclaration")) return undefined;
    return end.expression.type === "AssignmentExpression" ? { stmts, value: end.expression.right } : undefined;
  };
  const singles = vs.length === 1 ? bodies.map(single) : [];
  const values = singles.length && singles.every((x) => !!x) ? singles : undefined;
  const simpleForm = !!values;
  if (!vs.length || !bodies.every((b) => armOk(b, targets, true))) return "effects";
  if (!vs.every((t) => isLocalLet(site.scope, t, s.start))) return "assign";
  if (awaits(s)) return "await";
  // an arm that declares the name again assigns its own copy
  if (vs.some((x) => own.has(x))) return "shadow";
  if (!bodies.every((b) => armOk(b, targets)) || arms.slice(1).some((a) => effects(a.test))) return "armEffect";
  // the arms run on copies, written back when they finish: a closure would see the wrong
  // variable, and a throw partway would drop what the arm had already assigned
  if (!simpleForm && mentionedByFunction(site.fn, new Set(vs))) return "closure";
  if (!simpleForm && site.tr) return "tryAssign";
  return { kind: "assign", s, arms, last, vs, values };
};

// What becomes of a statement of a list: a return-shaped if or switch moves only in tail position
// (where its return ends the function), an assigning if anywhere. Vue's render functions write to a
// stream; their ifs go through pushIf instead.
export const decide = (s: Statement, stmts: readonly Statement[], i: number, tail: boolean, site: Site): Decision => {
  if (site.push) return KEEP;
  if (s.type === "IfStatement") {
    const guards = tail ? planGuards(s, stmts.slice(0, i), stmts.slice(i + 1)) : undefined;
    if (typeof guards === "object") return guards;
    const assign = planAssign(s, site);
    return typeof assign === "object" ? assign : { kind: "keep", stopped: guards };
  }
  if (s.type === "SwitchStatement" && tail) {
    const pick = planPick(s, stmts.slice(0, i), stmts.slice(i + 1));
    return typeof pick === "object" ? pick : { kind: "keep", stopped: pick };
  }
  return KEEP;
};

// why an if the rewrite left alone can't run in a template, for the error's wording
export const whyIf = (n: IfStatement, site: Site, stopped: Reason | undefined): Reason | undefined => {
  if (site.push) return undefined;
  if (jumps(n)) return "jump";
  if (hasReturn(n) && (site.loop || site.tr)) return site.loop ? "loopReturn" : "tryReturn";
  if (stopped) return stopped;
  if (armOk(n, undefined, true)) return !armOk(n) ? "armEffect" : hasReturn(n) ? "midReturn" : undefined;
  const assign = planAssign(n, site);
  return typeof assign === "object" ? "effects" : assign;
};

export const whySwitch = (n: SwitchStatement, site: Site, stopped: Reason | undefined): Reason | undefined => {
  const bodies = n.cases.map((c) => c.consequent).filter((b) => b.length).map((b) => caseOf(b).live);
  if (bodies.some((b) => b.some((x) => jumps(x)))) return "break";
  if (bodies.some((b) => !endsInReturn(b))) return "fall";
  if (stopped) return stopped;
  if (!hasReturn(n) || n.cases.at(-1)?.consequent.length === 0) return undefined;
  return site.loop ? "loopReturn" : site.tr ? "tryReturn" : "midReturn";
};

// The runtime call an operator becomes (ops.ts), or undefined where it stays JavaScript: an arrow
// (an arm's thunk) can't hold an await, and an operation on literals alone has no field to decide.
// `armEffect`: an arm changes something, so its test may not be a field (both arms would run).
export type OperatorPlan = { fn: string; armEffect: boolean };
const LOGICAL: Record<ESTree.LogicalOperator, string> = { "&&": "and", "||": "or", "??": "nullish" };
const BINARY: Partial<Record<ESTree.BinaryOperator, string>> = { "===": "eq", "!==": "ne", "==": "looseEq", "!=": "looseNe", "<": "lt", ">": "gt", "<=": "le", ">=": "ge", "+": "add" };
const UNARY: Partial<Record<ESTree.UnaryOperator, string>> = { "!": "not", typeof: "typeOf" };
const literal = (n: Node): boolean => n.type === "Literal" || n.type === "TemplateLiteral";

export const planOperator = (n: Node): OperatorPlan | undefined => {
  switch (n.type) {
    case "LogicalExpression":
      return awaits(n.right) ? undefined : { fn: LOGICAL[n.operator], armEffect: effects(n.right) };
    case "ConditionalExpression":
      return awaits(n.consequent) || awaits(n.alternate) ? undefined : { fn: "cond", armEffect: effects(n.consequent) || effects(n.alternate) };
    case "BinaryExpression": {
      const fn = BINARY[n.operator];
      return !fn || (literal(n.left) && literal(n.right)) ? undefined : { fn, armEffect: false };
    }
    case "UnaryExpression": {
      const fn = UNARY[n.operator];
      return fn ? { fn, armEffect: false } : undefined;
    }
    default:
      return undefined;
  }
};

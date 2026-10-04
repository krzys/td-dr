// The shapes of statement control flow the rewrite can turn into branch values (docs/decisions.md §11): which
// statements return, which may sit in an arm, how a switch's cases and an else-if chain split up.
// Only reads the syntax tree.
import { children, isFunction, nameOf, type Expression, type IfStatement, type Node, type Statement } from "./ast.ts";
import { effects } from "./effects.ts";
import { declared, letNames, walk } from "./scope.ts";

const isLoop = (n: Node): boolean => n.type === "ForStatement" || n.type === "ForInStatement" || n.type === "ForOfStatement" || n.type === "WhileStatement" || n.type === "DoWhileStatement";

// an await, a yield or an `await using` outside nested functions: an arrow (a thunk) can't hold it
export const awaits = (n: Node): boolean =>
  !isFunction(n) && (n.type === "AwaitExpression" || n.type === "YieldExpression" || (n.type === "ForOfStatement" && n.await) || (n.type === "VariableDeclaration" && n.kind === "await using") || children(n).some(awaits));

export const returns = (n: Node): boolean => {
  switch (n.type) {
    case "ReturnStatement":
      return true;
    case "BlockStatement":
      return endsInReturn(n.body);
    case "IfStatement":
      return !!n.alternate && returns(n.consequent) && returns(n.alternate);
    case "SwitchStatement": {
      const cases = n.cases;
      return cases.some((c) => !c.test) && cases.at(-1)!.consequent.length > 0 && cases.every((c) => c.consequent.length === 0 || endsInReturn(c.consequent));
    }
    default:
      return false;
  }
};
// a return in the middle makes what follows dead code
export const endsInReturn = (list: readonly Node[]): boolean => list.some(returns);

// An arm a branch may hold: declarations, returns, nested branches and, when `targets` is given,
// plain assignments to them. A call whose result is dropped, `+=`, `push`, a member assignment or
// a loop would run in every arm of a template, so they are not allowed; nor may an expression
// change anything (`v = w = 1`, `n++`, `rows.push(x)`). `shapeOnly` skips that last check, to tell
// the two reasons apart.
export const armOk = (s: Node, targets?: ReadonlySet<string>, shapeOnly = false): boolean => {
  const pure = (e: Node | null | undefined) => shapeOnly || !e || !effects(e);
  switch (s.type) {
    case "EmptyStatement":
      return true;
    case "VariableDeclaration":
      return s.kind !== "var" && s.declarations.every((d) => pure(d.id) && pure(d.init));
    case "ReturnStatement":
      return !targets && pure(s.argument);
    case "BlockStatement":
      return listOk(s.body, targets, shapeOnly);
    case "IfStatement":
      return pure(s.test) && armOk(s.consequent, targets, shapeOnly) && (!s.alternate || armOk(s.alternate, targets, shapeOnly));
    case "SwitchStatement":
      return !targets && pure(s.discriminant) && s.cases.every((c) => pure(c.test) && listOk(c.consequent, undefined, shapeOnly));
    case "ExpressionStatement": {
      const e = s.expression;
      return !!targets && e.type === "AssignmentExpression" && e.operator === "=" && targets.has(nameOf(e.left) ?? "") && pure(e.right);
    }
    default:
      return false;
  }
};

// an if that assigns only lets declared in the same list: nobody outside can see them change
export const localAssign = (x: Node, lets: ReadonlySet<string>, shapeOnly = false): boolean => {
  if (x.type !== "IfStatement") return false;
  const t = assigned(x);
  return t.size > 0 && [...t].every((n) => lets.has(n)) && armOk(x, t, shapeOnly);
};

export const listOk = (stmts: readonly Node[], targets?: ReadonlySet<string>, shapeOnly = false): boolean => {
  const lets = letNames(stmts);
  return stmts.every((x) => armOk(x, targets, shapeOnly) || localAssign(x, lets, shapeOnly));
};

export type CaseRun = { live: Statement[]; dead: Statement[]; block: Node | undefined; end: number };

// what a case runs: the statements inside braces when it is one block, without a `break` after its
// return (dead code); `end` is where the case's code stops
export const caseOf = (body: readonly Statement[]): CaseRun => {
  const isBreak = (x: Node) => x.type === "BreakStatement" && !x.label;
  const first = body[0];
  // `{ …return } break;` is the braced case too: the break can't run
  const after = first?.type === "BlockStatement" && body.length > 1 && body.slice(1).every(isBreak) && endsInReturn(first.body) ? body.slice(1) : [];
  const own = body.slice(0, body.length - after.length);
  const only = own.length === 1 ? own[0] : undefined;
  const block = only?.type === "BlockStatement" ? only : undefined;
  const stmts = block ? block.body : own;
  const at = stmts.findIndex(returns);
  const tail = at < 0 ? [] : stmts.slice(at + 1);
  const inner = tail.every(isBreak) ? tail : [];
  const live = stmts.slice(0, stmts.length - inner.length);
  return { live, dead: [...inner, ...after], block, end: block ? block.end : (live.at(-1)?.end ?? 0) };
};

// every name a block, or a block nested in an if, declares
export const declaredDeep = (s: Node, out = new Set<string>()): Set<string> => {
  if (s.type === "BlockStatement") {
    declared(s.body).forEach((x) => out.add(x));
    for (const x of s.body) declaredDeep(x, out);
  } else if (s.type === "IfStatement") {
    declaredDeep(s.consequent, out);
    if (s.alternate) declaredDeep(s.alternate, out);
  }
  return out;
};

// targets of the plain assignments an arm makes, found through blocks and nested ifs
export const assigned = (s: Node, out = new Set<string>()): Set<string> => {
  if (s.type === "ExpressionStatement") {
    const e = s.expression;
    const name = e.type === "AssignmentExpression" && e.operator === "=" ? nameOf(e.left) : undefined;
    if (name) out.add(name);
  } else if (s.type === "BlockStatement") for (const x of s.body) assigned(x, out);
  else if (s.type === "IfStatement") {
    assigned(s.consequent, out);
    if (s.alternate) assigned(s.alternate, out);
  }
  return out;
};

export type Arm = { test: Expression; body: Statement };
export type Chain = { arms: Arm[]; last: Statement | undefined };

// `if` / else-if / else as a list of (test, body) and the final else
export const chainOf = (s: IfStatement): Chain => {
  const arms: Arm[] = [];
  for (let cur = s; ; ) {
    arms.push({ test: cur.test, body: cur.consequent });
    const alt = cur.alternate;
    if (alt?.type === "IfStatement") cur = alt;
    else return { arms, last: alt ?? undefined };
  }
};

// the bodies of a chain's arms, the final else last
export const bodiesOf = ({ arms, last }: Chain): Statement[] => [...arms.map((a) => a.body), ...(last ? [last] : [])];

// a break / continue that would leave `n` (loops and switches inside keep their own)
export const jumps = (n: Node, inLoop = false, inSwitch = false): boolean => {
  if (isFunction(n)) return false;
  if (n.type === "ContinueStatement") return !inLoop;
  if (n.type === "BreakStatement") return !inLoop && !inSwitch;
  const loop = inLoop || isLoop(n);
  const sw = inSwitch || n.type === "SwitchStatement";
  return children(n).some((c) => jumps(c, loop, sw));
};

export const hasReturn = (n: Node): boolean => walk(n, (x) => x.type === "ReturnStatement");

// a case test that can be dropped without losing an effect: JS would still evaluate anything else
export const simple = (n: Node): boolean =>
  (n.type === "Literal" && !("regex" in n && n.regex)) ||
  (n.type === "UnaryExpression" && n.operator === "-" && n.argument.type === "Literal" && typeof n.argument.value === "number") ||
  (n.type === "TemplateLiteral" && n.expressions.length === 0);

// a jump or declaration that would mean something else inside an arrow function
export const escapes = (n: Node): boolean => {
  if (isFunction(n)) return false;
  if (n.type === "ReturnStatement" || n.type === "BreakStatement" || n.type === "ContinueStatement" || n.type === "YieldExpression" || n.type === "AwaitExpression") return true;
  if (n.type === "VariableDeclaration" && n.kind === "var") return true;
  return children(n).some(escapes);
};

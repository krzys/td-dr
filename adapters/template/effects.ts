// Calls and operators that change something while an arm computes its value. An arm is rendered once
// for every branch, so these would run for each of them. (A function the arm only passes on, or
// calls through a name, can't be seen.) The method list is a guess by name: `.add()` on a date
// library reads as a Set's.
import { children, isFunction, nameOf, type Expression, type Fn, type Node } from "./ast.ts";
import { bound, varNames } from "./scope.ts";

const MUTATORS = new Set(["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "copyWithin", "set", "add", "delete", "clear"]);
const OWNERS = new Set(["assign", "defineProperty", "defineProperties", "setPrototypeOf", "set", "deleteProperty"]);
// what these return is a new value: changing it changes nothing outside
const COPIES = new Set(["slice", "concat", "map", "filter", "flat", "flatMap", "toSorted", "toReversed", "toSpliced", "with", "from", "of", "keys", "values", "entries", "split", "fromEntries"]);
const IN_PLACE = new Set(["sort", "reverse", "fill", "copyWithin"]);
const REDUCERS = new Set(["reduce", "reduceRight"]);

// a variable's name and whether it holds a fresh array or object nobody else does
type Own = ReadonlyMap<string, boolean>;
const NO_NAMES: Own = new Map();

// `x.m(…)` as the object and the method's name (a computed one only when it is a literal)
const methodCall = (callee: Node): { object: Expression; method: string } | undefined => {
  if (callee.type !== "MemberExpression") return undefined;
  if (callee.computed) return { object: callee.object, method: callee.property.type === "Literal" ? String(callee.property.value) : "" };
  const method = nameOf(callee.property);
  return method === undefined ? undefined : { object: callee.object, method };
};
const methodOf = (callee: Node): string | undefined => methodCall(callee)?.method || undefined;

type Root = Extract<Node, { type: "Identifier" | "ThisExpression" }>;

// the name a target hangs off (`a.b[0].c` -> a). A copy is fresh only when the target is the copy
// itself (`xs.slice().sort()`): copies are shallow, so a member reached through one is the source's.
const rootOf = (n: Node, through = false): Root | undefined => {
  switch (n.type) {
    case "Identifier":
    case "ThisExpression":
      return n;
    case "MemberExpression":
      return rootOf(n.object, true);
    case "CallExpression": {
      const m = methodCall(n.callee);
      if (!m?.method) return undefined;
      if (COPIES.has(m.method)) return through ? rootOf(m.object, true) : undefined;
      return rootOf(m.object, through);
    }
    default:
      return undefined;
  }
};

// a value nobody else holds: a literal, a new object, a copy, or one of these sorted in place
const fresh = (n: Node): boolean => {
  if (n.type === "ArrayExpression" || n.type === "ObjectExpression" || n.type === "NewExpression") return true;
  if (n.type !== "CallExpression") return false;
  const m = methodCall(n.callee);
  return !!m?.method && (COPIES.has(m.method) || (IN_PLACE.has(m.method) && fresh(m.object)));
};

// names that get a value somebody else may hold (`x = y`, `x += 1`) anywhere under `nodes`; flow-insensitive
const reassigned = (nodes: readonly Node[], out = new Set<string>()): Set<string> => {
  for (const n of nodes) {
    if (n.type === "AssignmentExpression" && n.left.type === "Identifier" && (n.operator !== "=" || !fresh(n.right))) out.add(n.left.name);
    // a for-of / for-in head and a var (which may redeclare a parameter) give a name another value too
    if ((n.type === "ForOfStatement" || n.type === "ForInStatement") && n.left.type === "Identifier") out.add(n.left.name);
    if (n.type === "VariableDeclaration" && n.kind === "var") for (const d of n.declarations) bound(d.id).forEach((x) => out.add(x));
    reassigned(children(n), out);
  }
  return out;
};

// the let, const and function names a statement list declares (and a catch clause's parameters);
// true when it holds a fresh array or object that is never given anything else
const lexical = ({ stmts, params }: Names, out: Map<string, boolean>): Map<string, boolean> => {
  const moved = reassigned(stmts);
  for (const s of stmts) {
    if (s.type === "VariableDeclaration" && s.kind !== "var") {
      for (const d of s.declarations) {
        const own = d.id.type === "Identifier" && (d.init?.type === "ArrayExpression" || d.init?.type === "ObjectExpression");
        bound(d.id).forEach((x) => out.set(x, own && !moved.has(x)));
      }
    } else if ((s.type === "FunctionDeclaration" || s.type === "ClassDeclaration") && s.id) out.set(s.id.name, false);
  }
  for (const x of params) out.set(x, false);
  return out;
};

// a callback's own names. Nested functions keep their own names, so the visit stops at them; inner
// blocks add theirs while `effects` visits them.
const ownNames = (fn: Fn, out: Map<string, boolean>): Map<string, boolean> => {
  fn.params.forEach((p) => bound(p).forEach((x) => out.set(x, false)));
  const body = fn.body;
  if (body?.type === "BlockStatement") lexical({ stmts: body.body, params: [] }, out);
  for (const x of body ? varNames(body) : []) if (!out.has(x)) out.set(x, false);
  return out;
};

// a block, switch, catch or loop head inside a callback declares names that end with it
type Names = { stmts: readonly Node[]; params: readonly string[] };
const blockNames = (n: Node): Names | undefined => {
  switch (n.type) {
    case "BlockStatement":
      return n.body.length ? { stmts: n.body, params: [] } : undefined;
    case "SwitchStatement": {
      const stmts = n.cases.flatMap((c) => c.consequent);
      return stmts.length ? { stmts, params: [] } : undefined;
    }
    case "CatchClause":
      return n.param ? { stmts: [], params: bound(n.param) } : undefined;
    case "ForStatement":
    case "ForOfStatement":
    case "ForInStatement": {
      const head = n.type === "ForStatement" ? n.init : n.left;
      return head?.type === "VariableDeclaration" ? { stmts: [head], params: [] } : undefined;
    }
    default:
      return undefined;
  }
};

// every way out of the callback hands back `name` itself: only then is the accumulator the one
// value the whole fold passes along
const returnsOnly = (fn: Fn, name: string): boolean => {
  const bare = (e: Node | null | undefined): boolean => !!e && (e.type === "Identifier" ? e.name === name : e.type === "SequenceExpression" && bare(e.expressions.at(-1)));
  const body = fn.body;
  if (body?.type !== "BlockStatement") return bare(body);
  const walk = (n: Node): boolean => (isFunction(n) ? true : n.type === "ReturnStatement" ? bare(n.argument) : children(n).every(walk));
  return walk(body);
};

// does `n` change something other than `own`, the variables of the callback it sits in. Giving a
// parameter a new value is local; changing what it points at (`x.n++`, `x.list.push(1)`) is not.
export const effects = (n: Node, own: Own = NO_NAMES): boolean => {
  if (isFunction(n)) return false;
  const outside = (target: Node, bare = false): boolean => {
    const root = rootOf(target);
    if (!root || root.type === "ThisExpression" || !own.has(root.name)) return true;
    // a fresh value is changed freely, but only itself: `r.push(1)`, `r.k = 1`, not `r[0].n++`
    const shallow = target.type === "Identifier" || (target.type === "MemberExpression" && target.object.type === "Identifier");
    return !bare && !(own.get(root.name) && shallow);
  };
  switch (n.type) {
    case "AssignmentExpression":
      return outside(n.left, n.left.type === "Identifier") || effects(n.right, own);
    case "ForOfStatement":
    case "ForInStatement":
      if (n.left.type === "MemberExpression" && outside(n.left)) return true;
      break;
    case "UpdateExpression":
      return outside(n.argument, n.argument.type === "Identifier");
    case "UnaryExpression":
      if (n.operator === "delete") return outside(n.argument);
      break;
    case "CallExpression": {
      const callee = n.callee;
      const args = n.arguments;
      // a function handed to a call, or called on the spot, runs in every arm too
      const running = (fn: Fn, seed = false) => {
        const names = ownNames(fn, new Map(own));
        const acc = nameOf(fn.params[0]);
        if (seed && acc !== undefined && returnsOnly(fn, acc) && !(fn.body && reassigned([fn.body]).has(acc))) names.set(acc, true);
        return fn.body ? effects(fn.body, names) : false;
      };
      // a reduce that starts from a literal builds it up itself
      const seeded = (args[1]?.type === "ArrayExpression" || args[1]?.type === "ObjectExpression") && REDUCERS.has(methodOf(callee) ?? "");
      if (args.some((a, i) => isFunction(a) && running(a, seeded && i === 0))) return true;
      if (isFunction(callee)) return running(callee) || args.some((a) => effects(a, own));
      const target = args[0];
      if (
        callee.type === "MemberExpression" &&
        !callee.computed &&
        ["Object", "Reflect"].includes(nameOf(callee.object) ?? "") &&
        OWNERS.has(nameOf(callee.property) ?? "") &&
        (target?.type === "Identifier" || target?.type === "MemberExpression" || target?.type === "ThisExpression") &&
        outside(target)
      )
        return true;
      const m = methodCall(callee);
      // a fresh array or a copy is changed freely: `[...xs].sort()` changes nothing outside
      if (m?.method && MUTATORS.has(m.method) && !fresh(m.object) && outside(m.object)) return true;
      break;
    }
    case "SwitchStatement":
      if (own === NO_NAMES) break;
      {
        // the discriminant is read before the cases' names exist
        const names = blockNames(n);
        const cases = names ? lexical(names, new Map(own)) : own;
        return effects(n.discriminant, own) || n.cases.some((c) => children(c).some((x) => effects(x, cases)));
      }
  }
  const inner = own === NO_NAMES ? undefined : blockNames(n);
  if (inner) own = lexical(inner, new Map(own));
  return children(n).some((c) => effects(c, own));
};

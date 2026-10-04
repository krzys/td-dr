// Which names a piece of code declares, binds and reads: what the statement rewrites must keep
// meaning the same when they move code into a thunk.
import { bodyOf, children, isFunction, type Fn, type Node } from "./ast.ts";

// visits `n` and everything under it except nested functions, until `visit` says stop
export const walk = (n: Node, visit: (n: Node) => boolean | void): boolean => {
  if (visit(n)) return true;
  return children(n).some((c) => !isFunction(c) && walk(c, visit));
};

// a `var` hoists out of the block it is written in
export const hasVar = (n: Node): boolean => walk(n, (x) => x.type === "VariableDeclaration" && x.kind === "var");

// `a.note` and `{ note: 1 }` don't read a variable called note
const keyOf = (n: Node): Node | undefined => {
  switch (n.type) {
    case "MemberExpression":
      return n.computed ? undefined : n.property;
    case "Property":
      return n.computed || n.shorthand ? undefined : n.key;
    case "MethodDefinition":
    case "PropertyDefinition":
      return n.computed ? undefined : n.key;
    default:
      return undefined;
  }
};

// does any identifier in `n` have one of these names (functions included)
export const mentions = (n: Node, names: ReadonlySet<string>): boolean => {
  if (n.type === "Identifier") return names.has(n.name);
  const skip = keyOf(n);
  return children(n).some((c) => c !== skip && mentions(c, names));
};

export const mentionedByFunction = (n: Node, names: ReadonlySet<string>): boolean => (isFunction(n) ? mentions(n, names) : children(n).some((c) => mentionedByFunction(c, names)));

// every name a pattern binds
export const bound = (p: Node | null | undefined, out: string[] = []): string[] => {
  if (!p) return out;
  switch (p.type) {
    case "Identifier":
      out.push(p.name);
      break;
    case "ObjectPattern":
      for (const x of p.properties) bound(x.type === "Property" ? x.value : x.argument, out);
      break;
    case "ArrayPattern":
      for (const x of p.elements) bound(x, out);
      break;
    case "AssignmentPattern":
      bound(p.left, out);
      break;
    case "RestElement":
      bound(p.argument, out);
      break;
  }
  return out;
};

// the name a function or class declaration gives its scope
const declName = (s: Node): string | undefined => ((s.type === "FunctionDeclaration" || s.type === "ClassDeclaration") && s.id ? s.id.name : undefined);

// let / const / class / function names a statement list declares: what `rest` would shadow
export const declared = (stmts: readonly Node[]): Set<string> => {
  const names = new Set<string>();
  for (const s of stmts) {
    if (s.type === "VariableDeclaration" && s.kind !== "var") for (const d of s.declarations) bound(d.id).forEach((x) => names.add(x));
    else {
      const name = declName(s);
      if (name) names.add(name);
    }
  }
  return names;
};

// let names a statement list declares
export const letNames = (stmts: readonly Node[]): Set<string> => {
  const names = new Set<string>();
  for (const s of stmts) if (s.type === "VariableDeclaration" && s.kind === "let") for (const d of s.declarations) bound(d.id).forEach((x) => names.add(x));
  return names;
};

export const varNames = (n: Node): string[] => {
  const out: string[] = [];
  walk(n, (x) => {
    if (x.type === "VariableDeclaration" && x.kind === "var") for (const d of x.declarations) bound(d.id, out);
  });
  return out;
};

// Lexical bindings, innermost first: `names` is true for a `let` (which an assignment may target),
// `at` is where each declaration ends (before that the name is in its TDZ), `fn` marks a
// function's (or the module's) own scope.
export type Scope = { names: Map<string, boolean>; at: Map<string, number>; up: Scope | undefined; fn: boolean };

export const scopeOf = (stmts: readonly Node[], up: Scope | undefined, fn: boolean): Scope => {
  const names = new Map<string, boolean>();
  const at = new Map<string, number>();
  for (const s of stmts) {
    if (s.type === "VariableDeclaration") {
      for (const d of s.declarations)
        bound(d.id).forEach((x) => {
          names.set(x, s.kind === "let");
          at.set(x, d.end);
        });
    } else {
      const name = declName(s);
      if (name) names.set(name, false);
    }
  }
  return { names, at, up, fn };
};

// a function's scope: its body's lexical names, then parameters, vars and its own name
export const functionScope = (fn: Fn, up: Scope): Scope => {
  const sc = scopeOf(bodyOf(fn), up, true);
  const names = [...fn.params.flatMap((p) => bound(p)), ...(fn.body ? varNames(fn.body) : [])];
  if (fn.type === "FunctionExpression" && fn.id) names.push(fn.id.name);
  for (const x of names) if (!sc.names.has(x)) sc.names.set(x, false);
  return sc;
};

// a catch clause's parameter names
export const catchScope = (param: Node | null, up: Scope): Scope => ({ names: new Map(bound(param).map((x) => [x, false])), at: new Map(), up, fn: false });

// a for head's declaration (`for (let i …)`) is scoped to the loop
export const loopHead = (n: Node): Node[] => {
  const head = n.type === "ForStatement" ? n.init : n.type === "ForOfStatement" || n.type === "ForInStatement" ? n.left : undefined;
  return head?.type === "VariableDeclaration" ? [head] : [];
};

// true if `name` is a `let` of the enclosing function (not of a module or an outer function),
// already declared at `pos`
export const isLocalLet = (scope: Scope | undefined, name: string, pos: number): boolean => {
  for (let s = scope; s; s = s.up) {
    if (s.names.has(name)) return s.names.get(name)! && (s.at.get(name) ?? Infinity) <= pos;
    if (s.fn) return false;
  }
  return false;
};

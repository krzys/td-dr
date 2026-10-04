// The syntax tree the operator rewrite reads: oxc's ESTree output through vite's parseSync (what
// parseAst wraps, with the errors as data), typed by the oxc node types vite re-exports as
// `ESTree`, so there is no dependency of our own. The parse reads plain JavaScript (the frameworks have already compiled TypeScript, JSX and
// SFCs), so their nodes can't appear; every other node type either lists the children the rewrite
// walks or says why the rewrite refuses it.
import { parseSync, type ESTree } from "vite";

export type { ESTree };

export type Node = ESTree.Node;
export type Program = ESTree.Program;
export type Statement = ESTree.Statement | ESTree.Directive;
export type Expression = ESTree.Expression;
export type IfStatement = ESTree.IfStatement;
export type SwitchStatement = ESTree.SwitchStatement;
export type SwitchCase = ESTree.SwitchCase;
export type CatchClause = ESTree.CatchClause;
export type Fn = ESTree.Function | ESTree.ArrowFunctionExpression;

// TypeScript and JSX node types: what a parse of plain JavaScript never gives
type Foreign = `TS${string}` | `JSX${string}`;
const FOREIGN = /^(?:TS|JSX)/;
type Native = Exclude<Node, { type: Foreign }>;
type NodeOf<K extends Native["type"]> = Native extends infer N ? (N extends { type: infer T } ? (K extends T ? N : never) : never) : never;
type Child = Node | null | undefined;

// What a module can hold that the rewrite can't follow, and why: it would read the module wrongly.
const NOT_JS = "TypeScript or JSX syntax reached the rewrite; the module should have been compiled to JavaScript first";
const REFUSED = {
  // the scope analysis decides what each name means; `with` makes that depend on an object at run time
  WithStatement: "a with statement makes the names inside it depend on an object at run time (and is a syntax error in an ES module)",
  ParenthesizedExpression: "the parser kept parentheses as nodes; the rewrite expects them dropped",
  V8IntrinsicExpression: "V8 intrinsics (%Name()) are not JavaScript",
  TSDeclareFunction: NOT_JS,
  TSEmptyBodyFunctionExpression: NOT_JS,
  TSAbstractMethodDefinition: NOT_JS,
  TSAbstractPropertyDefinition: NOT_JS,
  TSAbstractAccessorProperty: NOT_JS,
} as const;
type Refused = keyof typeof REFUSED;

const none = (): Child[] => [];

// The children of each node type, in source order (which is the order the rewrite numbers what it
// adds). The mapped type makes the table complete: a node type a new parser version adds fails
// the type check until it is listed here or refused above.
const KIDS: { [K in Exclude<Native["type"], Refused>]: (n: NodeOf<K>) => readonly Child[] } = {
  Program: (n) => [...n.body, n.hashbang],
  Hashbang: none,
  Identifier: none,
  PrivateIdentifier: none,
  ThisExpression: none,
  Super: none,
  Literal: none,
  TemplateElement: none,
  EmptyStatement: none,
  DebuggerStatement: none,
  ArrayExpression: (n) => n.elements,
  ObjectExpression: (n) => n.properties,
  Property: (n) => [n.key, n.value],
  TemplateLiteral: (n) => [...n.quasis, ...n.expressions],
  TaggedTemplateExpression: (n) => [n.tag, n.quasi],
  MemberExpression: (n) => [n.object, n.property],
  CallExpression: (n) => [n.callee, ...n.arguments],
  NewExpression: (n) => [n.callee, ...n.arguments],
  MetaProperty: (n) => [n.meta, n.property],
  SpreadElement: (n) => [n.argument],
  UpdateExpression: (n) => [n.argument],
  UnaryExpression: (n) => [n.argument],
  BinaryExpression: (n) => [n.left, n.right],
  LogicalExpression: (n) => [n.left, n.right],
  ConditionalExpression: (n) => [n.test, n.consequent, n.alternate],
  AssignmentExpression: (n) => [n.left, n.right],
  ArrayPattern: (n) => n.elements,
  ObjectPattern: (n) => n.properties,
  RestElement: (n) => [n.argument],
  AssignmentPattern: (n) => [n.left, n.right],
  SequenceExpression: (n) => n.expressions,
  AwaitExpression: (n) => [n.argument],
  YieldExpression: (n) => [n.argument],
  ChainExpression: (n) => [n.expression],
  ImportExpression: (n) => [n.source, n.options],
  ExpressionStatement: (n) => [n.expression],
  BlockStatement: (n) => n.body,
  StaticBlock: (n) => n.body,
  VariableDeclaration: (n) => n.declarations,
  VariableDeclarator: (n) => [n.id, n.init],
  IfStatement: (n) => [n.test, n.consequent, n.alternate],
  DoWhileStatement: (n) => [n.body, n.test],
  WhileStatement: (n) => [n.test, n.body],
  ForStatement: (n) => [n.init, n.test, n.update, n.body],
  ForInStatement: (n) => [n.left, n.right, n.body],
  ForOfStatement: (n) => [n.left, n.right, n.body],
  ContinueStatement: (n) => [n.label],
  BreakStatement: (n) => [n.label],
  ReturnStatement: (n) => [n.argument],
  ThrowStatement: (n) => [n.argument],
  LabeledStatement: (n) => [n.label, n.body],
  SwitchStatement: (n) => [n.discriminant, ...n.cases],
  SwitchCase: (n) => [n.test, ...n.consequent],
  TryStatement: (n) => [n.block, n.handler, n.finalizer],
  CatchClause: (n) => [n.param, n.body],
  FunctionDeclaration: (n) => [n.id, ...n.params, n.body],
  FunctionExpression: (n) => [n.id, ...n.params, n.body],
  ArrowFunctionExpression: (n) => [...n.params, n.body],
  ClassDeclaration: (n) => [...n.decorators, n.id, n.superClass, n.body],
  ClassExpression: (n) => [...n.decorators, n.id, n.superClass, n.body],
  ClassBody: (n) => n.body,
  MethodDefinition: (n) => [...n.decorators, n.key, n.value],
  PropertyDefinition: (n) => [...n.decorators, n.key, n.value],
  AccessorProperty: (n) => [...n.decorators, n.key, n.value],
  Decorator: (n) => [n.expression],
  ImportDeclaration: (n) => [...n.specifiers, n.source, ...n.attributes],
  ImportSpecifier: (n) => [n.imported, n.local],
  ImportDefaultSpecifier: (n) => [n.local],
  ImportNamespaceSpecifier: (n) => [n.local],
  ImportAttribute: (n) => [n.key, n.value],
  ExportNamedDeclaration: (n) => [n.declaration, ...n.specifiers, n.source, ...n.attributes],
  ExportDefaultDeclaration: (n) => [n.declaration],
  ExportAllDeclaration: (n) => [n.exported, n.source, ...n.attributes],
  ExportSpecifier: (n) => [n.local, n.exported],
};

const refusal = (type: string): string | undefined => (FOREIGN.test(type) ? NOT_JS : Object.hasOwn(REFUSED, type) ? REFUSED[type as Refused] : undefined);

// (parse() has refused every node type without an entry)
export const children = (n: Node): Node[] => {
  // TS can't relate KIDS[n.type] to n's own type (one function per member of a union)
  const kids = KIDS[n.type as keyof typeof KIDS] as ((n: Node) => readonly Child[]) | undefined;
  if (!kids) throw new Error(`tddr: ${n.type} at ${n.start} reached the rewrite`);
  return kids(n).filter((c): c is Node => !!c);
};

// line (1-based) and column (0-based) of an offset, as Rollup and Vite report them
const lineColumn = (code: string, pos: number): { line: number; column: number } => {
  const before = code.slice(0, pos);
  const line = before.split("\n").length;
  return { line, column: pos - (before.lastIndexOf("\n") + 1) };
};

// a module the rewrite can't read, as `file:line:column: message`; Vite also reads `loc` and `id`
export const syntaxError = (code: string, file: string, at: number, message: string): Error => {
  const loc = { file, ...lineColumn(code, at) };
  return Object.assign(new SyntaxError(`${file}:${loc.line}:${loc.column + 1}: ${message}`), { loc, pos: at, id: file });
};

// every node the rewrite will see is one it knows, or the module is refused where the first one sits
const check = (code: string, file: string, n: Node): void => {
  const why = refusal(n.type);
  if (why) throw syntaxError(code, file, n.start, `tddr can't rewrite this email module: ${why}`);
  for (const c of children(n)) check(code, file, c);
};

// parseAst's defaults, stated so a changed default can't change the tree
const OPTIONS = { lang: "js", sourceType: "unambiguous", astType: "js", preserveParens: false } as const;

export const parse = (code: string, file: string): Program => {
  // parseAst's own error carries a code frame in its message, and Vite draws one from `loc`; its
  // help is advice for whoever calls the parser, not for the author
  const { program, errors } = parseSync(file, code, OPTIONS);
  const [first] = errors;
  if (first) throw syntaxError(code, file, first.labels[0]?.start ?? 0, `${first.message}${errors.length > 1 ? ` (and ${errors.length - 1} more)` : ""}`);
  check(code, file, program);
  return program;
};

export const nameOf = (n: Node | null | undefined): string | undefined => (n?.type === "Identifier" ? n.name : undefined);

export const isFunction = (n: Node): n is Fn => n.type === "FunctionDeclaration" || n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression";

// the statements of a function's body; an arrow with an expression body has none
export const bodyOf = (fn: Fn): Statement[] => (fn.body?.type === "BlockStatement" ? fn.body.body : []);

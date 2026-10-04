// What Vue's compiled SSR render looks like to the rewrite: the stream it writes to, its imports
// from vue/server-renderer, and the placeholder it pushes for an if without v-else.
import { nameOf, type Fn, type IfStatement, type Node, type Program } from "./ast.ts";
import { escapes } from "./statements.ts";

// a render function's (or a v-for callback's) stream is its second parameter, `_push`
export const pushParam = (fn: Fn): string | undefined => {
  const p = nameOf(fn.params[1]);
  return p === "_push" ? p : undefined;
};

// local names of what a module imports from vue/server-renderer
export const ssrImports = (program: Program): Map<string, string> => {
  const names = new Map<string, string>();
  for (const s of program.body) {
    if (s.type !== "ImportDeclaration" || s.source.value !== "vue/server-renderer") continue;
    for (const sp of s.specifiers) {
      if (sp.type === "ImportSpecifier") names.set(sp.local.name, sp.imported.type === "Identifier" ? sp.imported.name : sp.imported.value);
    }
  }
  return names;
};

// Vue writes `else { _push(`<!--v-if-->`) }` (`<!---->` inside an element) when there is no v-else
const PLACEHOLDERS = new Set(["<!--v-if-->", "<!---->"]);
export const isPlaceholder = (n: Node, push: string): boolean => {
  const body = n.type === "BlockStatement" ? n.body : [n];
  const only = body.length === 1 ? body[0] : undefined;
  const call = only?.type === "ExpressionStatement" ? only.expression : undefined;
  if (call?.type !== "CallExpression" || nameOf(call.callee) !== push) return false;
  const [arg] = call.arguments;
  if (arg?.type === "Literal") return typeof arg.value === "string" && PLACEHOLDERS.has(arg.value);
  return arg?.type === "TemplateLiteral" && arg.expressions.length === 0 && PLACEHOLDERS.has(arg.quasis[0]!.value.cooked ?? "");
};

// an if in a render that only pushes markup becomes pushIf; one that returns, breaks or tests the
// stream itself stays a statement
export const pushable = (n: IfStatement, push: string): boolean => ![n.consequent, n.alternate].some((b) => b && escapes(b)) && nameOf(n.test) !== push;

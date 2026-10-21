// Where the input nests deepest, for E018 once a stage has run out of stack: a fresh parse
// (parse5 keeps its own stack of open elements), walked with an explicit stack.
import { parse as parse5 } from "parse5";
import { adapter } from "parse5-htmlparser2-tree-adapter";
import type { SrcLoc } from "../loc.ts";
import { children, isElement, locOf, type DomNode } from "./dom.ts";

export const deepest = (html: string): { depth: number; loc: SrcLoc | undefined } => {
  const document = parse5(html, { treeAdapter: adapter, sourceCodeLocationInfo: true });
  let found: { depth: number; node: DomNode | undefined } = { depth: 0, node: undefined };
  const stack: [DomNode, number][] = [[document, 0]];
  for (let top = stack.pop(); top; top = stack.pop()) {
    const [n, depth] = top;
    if (depth > found.depth) found = { depth, node: n };
    for (const c of children(n)) if (isElement(c)) stack.push([c, depth + 1]);
  }
  return { depth: found.depth, loc: found.node && locOf(found.node) };
};

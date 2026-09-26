import { isOutlookOnlyCol, mapChildren, type EmitReady, type Node, type StackNode } from "../ir/index.ts";
import { asEmitReady } from "./brand.ts";
import type { Pass } from "./pass.ts";

// Runs last: by then margins and gaps are padding, so a stack with an empty box adds nothing but a table.
const bare = (s: StackNode): boolean => {
  const { box } = s;
  const p = box.padding;
  const m = box.margin;
  return (
    s.gap === 0 &&
    !s.justify &&
    !p.top && !p.right && !p.bottom && !p.left &&
    !m.top && !m.right && !m.bottom && !m.left &&
    !box.hide && !box.border && !box.background && !box.backgroundImage && !box.minHeight && !box.radius && !box.radii &&
    !box.clip && !box.maxWidth && !box.width && !box.align
  );
};

// A stack of only Outlook-only children (conditionals, ghost rows) would turn its new parent into the
// emitter's Outlook-only grid.
const outlookOnly = (c: Node): boolean =>
  (c.kind === "conditional" && c.target === "mso") || (c.kind === "row" && c.cols.length > 0 && c.cols.every(isOutlookOnlyCol));

// A parent that spreads its children over a min-height needs them as they are.
const merges = (parent: StackNode, child: Node): child is StackNode =>
  child.kind === "stack" && !parent.justify && bare(child) && !(child.children.length > 0 && child.children.every(outlookOnly));

const flatten = (input: Node): Node => {
  const node = mapChildren(input, flatten);
  if (node.kind !== "stack") return node;
  return { ...node, children: node.children.flatMap((c) => (merges(node, c) ? c.children : [c])) };
};

// Merging bare stacks into their parent keeps every phase guarantee of the tree it is given.
export const flattenStacks: Pass<EmitReady, EmitReady> = { name: "flatten-stacks", run: (ir: EmitReady): EmitReady => asEmitReady(flatten(ir)) };

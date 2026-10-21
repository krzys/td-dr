import type { Box, Column, Node, Sides, SrcLoc, TemplateNode } from "./types.ts";

export const sides = <T>(top: T, right: T = top, bottom: T = top, left: T = right): Sides<T> => ({
  top,
  right,
  bottom,
  left,
});

export const zeroSides = (): Sides => sides(0);

export const addSides = (a: Sides, b: Sides): Sides => sides(a.top + b.top, a.right + b.right, a.bottom + b.bottom, a.left + b.left);

export { locKey, withLoc } from "../loc.ts";

export const emptyBox = (): Box => ({ padding: zeroSides(), margin: zeroSides() });

// Rebuilds a container with `fn` applied to its direct children. Leaves come back as-is.
export const mapChildren = (node: Node, fn: (child: Node) => Node): Node => {
  switch (node.kind) {
    case "stack":
      return { ...node, children: node.children.map(fn) };
    case "row":
      return { ...node, cols: node.cols.map((col) => ({ ...col, child: fn(col.child) })) };
    case "conditional":
      return { ...node, child: fn(node.child) };
    case "template":
      if (node.op === "each") return { ...node, child: fn(node.child) };
      return {
        ...node,
        branches: node.branches.map((b) => ({ ...b, child: fn(b.child) })),
        ...(node.otherwise ? { otherwise: fn(node.otherwise) } : {}),
      };
    default:
      return node;
  }
};

// A node's direct children, every branch of a template included.
export const childNodes = (node: Node): readonly Node[] => {
  switch (node.kind) {
    case "stack":
      return node.children;
    case "row":
      return node.cols.map((c) => c.child);
    case "conditional":
      return [node.child];
    case "template":
      return templateChildren(node);
    default:
      return [];
  }
};

// Everything a template node may show: the repeated child, or every branch.
export const templateChildren = (n: TemplateNode): Node[] =>
  n.op === "each" ? [n.child] : [...n.branches.map((b) => b.child), ...(n.otherwise ? [n.otherwise] : [])];

// Marks a text-level element the author wants in Outlook only; the emitter turns the pair into a
// conditional (emit/mso.ts resolveInlineMso), so the analyzer never writes MSO markup itself.
export const OUTLOOK_ONLY_OPEN = "<!--tddr:outlook-only-->";
export const OUTLOOK_ONLY_CLOSE = "<!--/tddr:outlook-only-->";

// A data-email="outlook-only" row item: its whole cell exists in Outlook only (docs/support.md#outlook-only-content).
export const isOutlookOnlyCol = (c: Column): boolean => c.child.kind === "conditional" && c.child.target === "mso";

// A node under its hide wrapper (analyze/hide.ts hideWrap, the only setter of box.hide) and that hide.
export const unwrapHide = (node: Node): { node: Node; hide?: "hidden" | "shown" } =>
  node.kind === "stack" && node.box.hide !== undefined ? { node: node.children[0]!, hide: node.box.hide } : { node };

// Wrappers that would only nest a table: margins turned into padding fold into the cell of what they wrap.
import { addSides, type ConditionalNode, type Node, type Sides, type SrcLoc, type StackNode, type TemplateNode } from "../ir/index.ts";
import { isPaddingOnly, outlookOnlyChild } from "./plan.ts";

export type Slotted = Exclude<Node, ConditionalNode | TemplateNode>;

// `node` gets the cell, with the folded wrappers' padding; `loc` is the author element the cell's tags trace to.
export type Folded = { node: Slotted; pad: Sides; loc: SrcLoc | undefined };

// `keeps`: a wrapper that must stay a box of its own (it has a side border on the base screen).
export const foldWrappers = (child: Slotted, keeps: (s: StackNode) => boolean): Folded => {
  let pad: Sides = { top: 0, right: 0, bottom: 0, left: 0 };
  let n = child;
  let wrapper = child.kind === "stack" ? child.loc : undefined;
  while (n.kind === "stack" && isPaddingOnly(n.box) && !keeps(n) && n.children.length === 1 && n.children[0]?.kind !== "conditional" && n.children[0]?.kind !== "template" && !outlookOnlyChild(n.children[0]!)) {
    pad = addSides(pad, n.box.padding);
    n = n.children[0]!;
    if (n.kind === "stack") wrapper = n.loc ?? wrapper;
  }
  // a text run's loc is its first node, maybe a text node; the div it sits in is the better answer
  return { node: n, pad, loc: n.kind === "inline" ? (wrapper ?? n.loc) : (n.loc ?? wrapper) };
};

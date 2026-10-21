import { emptyBox, withLoc, type Node } from "../ir/index.ts";
import type { SrcLoc } from "../ir/types.ts";

// A node hidden on some screens only is wrapped in a cell of its own that the emitter hides where it is none.
// A parent that lays its items out itself (flex, grid) sees through the wrapper, so the item keeps its
// normal column and the hide goes on that column instead. Only this sets box.hide, so it marks the wrapper.
export const hideWrap = (node: Node, hide: "hidden" | "shown", loc?: SrcLoc): Node =>
  withLoc<Node>({ kind: "stack", box: { ...emptyBox(), hide }, children: [node], gap: 0, collapse: true }, loc ?? node.loc);

import { addSides, emptyBox, mapChildren, withLoc, zeroSides, type Node, type Padded, type Sides } from "../ir/index.ts";
import { asPadded } from "./brand.ts";
import type { Pass } from "./pass.ts";

const isZero = (m: Sides) => m.top === 0 && m.right === 0 && m.bottom === 0 && m.left === 0;

const convert = (input: Node): Node => {
  const node = mapChildren(input, convert);
  if (node.kind === "raw" || node.kind === "conditional" || node.kind === "template") return node;

  const margin = node.kind === "inline" ? node.margin : node.box.margin;
  if (isZero(margin)) return node;

  // Padding can only stand in for margin when nothing paints or sizes the outer edge.
  if (node.kind === "stack" || node.kind === "row") {
    const { box } = node;
    const painted =
      !!box.keepCell || box.background !== undefined || box.backgroundImage !== undefined || box.minHeight !== undefined || box.radius !== undefined || (box.border && Object.keys(box.border).length > 0);
    const sized = (box.width !== undefined || box.maxWidth !== undefined) && margin.left + margin.right > 0;
    if (!painted && !sized) {
      return { ...node, box: { ...box, padding: addSides(box.padding, margin), margin: zeroSides() } };
    }
  }

  const inner: Node =
    node.kind === "inline" ? { ...node, margin: zeroSides() } : { ...node, box: { ...node.box, margin: zeroSides() } };
  const box = { ...emptyBox(), padding: margin };
  return withLoc({ kind: "stack", box, children: [inner], gap: 0, collapse: false }, node.loc);
};

// The root is the body: its background paints the whole canvas, margins included, so its margin
// (e.g. a first child's margin that collapsed through it) is padding inside the paint, not a wrapper outside it.
const convertRoot = (ir: Node): Node => {
  if (ir.kind === "stack" && ir.box.background !== undefined && ir.box.width === undefined && ir.box.maxWidth === undefined) {
    const { box } = ir;
    return convert({ ...ir, box: { ...box, padding: addSides(box.padding, box.margin), margin: zeroSides() } });
  }
  return convert(ir);
};

export const marginToPadding: Pass<Node, Padded> = { name: "margin-to-padding", run: (ir: Node): Padded => asPadded(convertRoot(ir)) };

import type { Ctx } from "../ctx.ts";
import { emptyBox, mapChildren, zeroSides, type Box, type Node, type Sides, type StackNode } from "../ir/index.ts";
import type { Pass } from "./pass.ts";

// A child whose negative margin exactly cancels its parent's padding is a band running to the
// parent's edge. The analyzer lets only those through; here the parent's padding on that side
// moves into the other children and the band's margin becomes 0. Runs before collapse-margins,
// which doesn't model negatives.

type Side = keyof Sides;
const SIDES: readonly Side[] = ["top", "right", "bottom", "left"];
const HORIZONTAL: readonly Side[] = ["left", "right"];

const opaque = (n: Node): n is Extract<Node, { kind: "raw" | "conditional" | "template" }> => n.kind === "raw" || n.kind === "conditional" || n.kind === "template";

const marginOf = (n: Node): Sides | null => (n.kind === "inline" ? n.margin : opaque(n) ? null : n.box.margin);

const withMargin = (n: Node, margin: Sides): Node =>
  n.kind === "inline" ? { ...n, margin } : opaque(n) ? n : { ...n, box: { ...n.box, margin } };

const hasBorder = (b: Box, side: Side): boolean => (b.border?.[side]?.width ?? 0) > 0;

// A margin at the band's own top/bottom edge that would collapse through it. Once the parent's
// padding is gone it would escape the card, so such a band is refused instead.
const leaks = (n: Node, side: "top" | "bottom"): boolean => {
  if (n.kind !== "stack" || !n.collapse || n.box.padding[side] !== 0 || hasBorder(n.box, side)) return false;
  const c = side === "top" ? n.children[0] : n.children[n.children.length - 1];
  if (!c) return false;
  return (marginOf(c)?.[side] ?? 0) !== 0 || leaks(c, side);
};

// Top and bottom only bleed at the ends of the flow; anywhere else it is an overlap.
const bleedSides = (s: StackNode, i: number): Set<Side> => {
  const out = new Set<Side>();
  const m = marginOf(s.children[i]!);
  if (!m || !s.collapse) return out;
  for (const side of SIDES) {
    if (m[side] >= 0 || s.box.padding[side] !== -m[side]) continue;
    // a fluid image shifts instead of widening when its margins are negative
    if (HORIZONTAL.includes(side) && s.children[i]!.kind === "image" && (s.children[i] as { fluid?: boolean }).fluid) continue;
    if (side === "top" && i !== 0) continue;
    if (side === "bottom" && i !== s.children.length - 1) continue;
    if ((side === "top" || side === "bottom") && leaks(s.children[i]!, side)) continue;
    out.add(side);
  }
  return out;
};

type Radii = readonly [number, number, number, number];
const CORNERS = [["top", "left"], ["top", "right"], ["bottom", "right"], ["bottom", "left"]] as const;
const corners = (b: Box): Radii => b.radii ?? [b.radius ?? 0, b.radius ?? 0, b.radius ?? 0, b.radius ?? 0];

// Under a rounded parent a band that reaches a corner takes that corner's inner radius.
const roundCorners = (parent: Box, child: Box, bleeds: Set<Side>): Box => {
  const outer = corners(parent);
  const own = corners(child);
  const next = CORNERS.map(([v, h], k): number => {
    if (!bleeds.has(v) || !bleeds.has(h)) return own[k]!;
    const inset = Math.max(parent.border?.[v]?.width ?? 0, parent.border?.[h]?.width ?? 0);
    return Math.max(own[k]!, outer[k]! - inset);
  }) as unknown as [number, number, number, number];
  if (next.every((r, k) => r === own[k])) return child;
  const { radii: _old, ...rest } = child;
  return { ...rest, radius: Math.max(...next), ...(next.every((r) => r === next[0]) ? {} : { radii: next }) };
};

const lower = (s: StackNode): StackNode => {
  const per = s.children.map((_, i) => bleedSides(s, i));
  const union = new Set(per.flatMap((b) => [...b]));
  if (union.size === 0) return s;

  const padding = { ...s.box.padding };
  for (const side of union) padding[side] = 0;

  // consecutive children that need the same side padding share one wrapper
  const out: Node[] = [];
  let run: Node[] = [];
  let runPad: Sides | undefined;
  const flush = (): void => {
    if (run.length > 0 && runPad) out.push({ kind: "stack", box: { ...emptyBox(), padding: runPad }, children: run, gap: 0, collapse: true });
    run = [];
    runPad = undefined;
  };
  s.children.forEach((c, i) => {
    const bleeds = per[i]!;
    const m = marginOf(c);
    let node = c;
    if (m && bleeds.size > 0) {
      const margin = { ...m };
      for (const side of bleeds) margin[side] = 0;
      node = withMargin(c, margin);
      if (node.kind !== "inline" && !opaque(node)) {
        node = { ...node, box: roundCorners(s.box, node.box, bleeds) } as Node;
      }
    }
    const pad = zeroSides();
    for (const side of HORIZONTAL) if (union.has(side) && !bleeds.has(side)) pad[side] = s.box.padding[side];
    if (pad.left === 0 && pad.right === 0) {
      flush();
      out.push(node);
      return;
    }
    if (runPad && (runPad.left !== pad.left || runPad.right !== pad.right)) flush();
    runPad = pad;
    run.push(node);
  });
  flush();
  return { ...s, box: { ...s.box, padding }, children: out };
};

const walk = (node: Node): Node => {
  const n = mapChildren(node, walk);
  return n.kind === "stack" ? lower(n) : n;
};

// What the analyzer let through but no parent absorbed. Clamped to 0 like any other unsupported
// negative, so later passes never see one.
const clampLeftovers = (node: Node, ctx: Ctx): Node => {
  const n = mapChildren(node, (c) => clampLeftovers(c, ctx));
  const m = marginOf(n);
  if (!m || SIDES.every((s) => m[s] >= 0)) return n;
  const first = SIDES.find((side) => m[side] < 0)!;
  ctx.diagnostics.report("E005", {
    message: `margin-${first}: ${m[first]}px is negative`,
    hint: "A negative margin only works as a full-bleed band: it must exactly cancel the parent's padding, and a top or bottom bleed must be the parent's first or last child with its own padding on that edge.",
    loc: n.loc,
  });
  const margin = { top: Math.max(0, m.top), right: Math.max(0, m.right), bottom: Math.max(0, m.bottom), left: Math.max(0, m.left) };
  return withMargin(n, margin);
};

export const bleed: Pass = {
  name: "bleed",
  run: (ir, ctx) => clampLeftovers(walk(ir), ctx),
};

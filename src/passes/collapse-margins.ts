import type { Ctx } from "../ctx.ts";
import type { Node, Sides, StackNode, TemplateNode } from "../ir/index.ts";
import { mapChildren } from "../ir/index.ts";
import { templateChildren } from "../ir/helpers.ts";
import type { Pass } from "./pass.ts";

// CSS 8.3.1, translated so that plain addition of margins gives the CSS result.
// Bottom-up, so a grandchild's margin can surface all the way to the root.

type Slot = { i: number; side: "top" | "bottom" };

const NONE: Sides = { top: 0, right: 0, bottom: 0, left: 0 };

// raw, conditional and template are opaque and have no margins
const marginOf = (n: Node): Sides | null => {
  switch (n.kind) {
    case "inline":
      return n.margin;
    case "raw":
    case "conditional":
    case "template":
      return null;
    default:
      return n.box.margin;
  }
};

const withMargin = (n: Node, margin: Sides): Node => {
  switch (n.kind) {
    case "inline":
      return { ...n, margin };
    case "raw":
    case "conditional":
    case "template":
      return n;
    default:
      return { ...n, box: { ...n.box, margin } };
  }
};

const hasBorder = (s: StackNode, side: "top" | "bottom") => (s.box.border?.[side]?.width ?? 0) > 0;
const openTop = (s: StackNode) => s.box.padding.top === 0 && !hasBorder(s, "top");
const openBottom = (s: StackNode) => s.box.padding.bottom === 0 && !hasBorder(s, "bottom");

// Takes up no height, so its margins collapse straight through it.
const isThrough = (n: Node): boolean =>
  n.kind === "stack" && n.collapse && openTop(n) && openBottom(n) && n.children.every(isThrough);

// What a template node's content puts on its edges.
// For a chain, the largest of its branches: any of them may be the one shown.
const innerMargin = (n: Node): Sides => {
  if (n.kind !== "template") return marginOf(n) ?? NONE;
  const ms = templateChildren(n).map(innerMargin);
  return { top: Math.max(0, ...ms.map((m) => m.top)), right: 0, bottom: Math.max(0, ...ms.map((m) => m.bottom)), left: 0 };
};

// The ESP may repeat or drop a template node, so its margins stay on its content and
// neighbours' margins add to them instead of collapsing with them.
const warnAdds = (n: Node, ctx: Ctx): void =>
  void ctx.diagnostics.report("W003", {
    message: "a margin next to a repeated or conditional block adds to the margin beside it instead of collapsing",
    hint: "Put the spacing on one side only: padding on the container, or margin on just one of the two elements.",
    loc: n.loc,
  });

// Padding that gives the HTML render's spacing around a template node for every outcome
// (docs/templates.md#spacing-around-blocks). An edge is "flex" when an unconditional sibling can carry
// padding outside the node; otherwise the margin there stays where it is (`outside`) and only
// the extra goes inside. Null when no padding can do it.
// `open`: the edge is a container edge that does not stop collapsing, so the container's margin
// collapses again further up and anything beyond `outside` cannot be added exactly from here.
type Edge = { margin: number; flex: boolean; outside: number; open?: boolean };
type Spacing = { x: number; y: number; inner: Sides[] };

const solveSpacing = (t: TemplateNode, top: Edge, bottom: Edge, kids: Sides[]): Spacing | null => {
  const a = top.margin;
  const c = bottom.margin;
  const E1 = kids.map((k) => Math.max(a, k.top) - top.outside);
  const E2 = kids.map((k) => Math.max(k.bottom, c) - bottom.outside);
  const E0 = Math.max(a, c) - top.outside - bottom.outside;
  if (top.open && E1.some((e) => e > 0)) return null;
  if (bottom.open && E2.some((e) => e > 0)) return null;
  const absent = t.op === "each" || t.otherwise === undefined;
  if (absent && E0 < 0) return null;
  // nothing is shown, so the neighbours collapse through the open edge and meet what is beyond it
  if (absent && E0 > 0 && (top.open || bottom.open)) return null;
  const topCap = top.flex ? Infinity : 0;
  if (t.op === "each") {
    const k = kids[0]!;
    const G = Math.max(k.bottom, k.top); // gap between two items
    if (G - E1[0]! + E0 !== E2[0]) return null; // the items' own gap would add up
    const lo = Math.max(0, E1[0]! - G, bottom.flex ? 0 : E0);
    const hi = Math.min(E0, E1[0]!, topCap);
    if (lo > hi) return null;
    const pt = E1[0]! - hi;
    return { x: hi, y: E0 - hi, inner: [{ ...k, top: pt, bottom: G - pt }] };
  }
  const minE1 = Math.min(...E1);
  const minE2 = Math.min(...E2);
  let x: number;
  let y: number;
  if (absent) {
    const lo = Math.max(0, E0 - minE2, bottom.flex ? 0 : E0);
    const hi = Math.min(E0, minE1, topCap);
    if (lo > hi) return null;
    x = hi;
    y = E0 - x;
  } else {
    // an arm is always shown: the collapsed gap sits on the block above, like the HTML render
    x = top.flex ? minE1 : 0;
    y = 0;
  }
  return { x, y, inner: kids.map((k, i) => ({ ...k, top: E1[i]! - x, bottom: E2[i]! - y })) };
};

// Can the ESP leave nothing in its place?
const canBeEmpty = (n: Node): boolean =>
  n.kind === "template" && (n.op === "each" || n.otherwise === undefined || templateChildren(n).some(canBeEmpty));

const withInnerMargins = (t: TemplateNode, inner: Sides[]): Node => {
  let i = 0;
  return mapChildren(t, (c) => withMargin(c, inner[i++]!));
};

const collapseStack = (s: StackNode, ctx: Ctx): StackNode => {
  // index 0 is the stack itself, children follow
  const ms: Sides[] = [{ ...s.box.margin }, ...s.children.map((c) => ({ ...(marginOf(c) ?? NONE) }))];
  const put = (h: Slot, v: number) => {
    ms[h.i]![h.side] = v;
  };

  const canTop = openTop(s);
  const canBottom = openBottom(s);

  // the margin currently open, and the slot that carries it
  let holder: Slot | null = canTop ? { i: 0, side: "top" } : null;
  let acc = canTop ? ms[0]!.top : 0;

  const kids = [...s.children];
  let after = 0; // margin-bottom a template node leaves just above the next child
  let prevTemplate = false;
  // a run of constructs that were not solved: what is open above it, and whether it may be empty
  let runAbove = 0;
  let runOpen = false;
  let runEmpty = false;
  let runWarned = false;
  // one warning per construct, whichever side finds the problem first
  const warnRun = (n: Node) => {
    if (runWarned) return;
    runWarned = true;
    warnAdds(n, ctx);
  };
  s.children.forEach((c, k) => {
    const i = k + 1;
    const m = ms[i]!;
    // other clients never see an outlook-only block, so their margins collapse across it
    if (c.kind === "conditional" && c.target === "mso") return;
    if (c.kind === "template") {
      if (!prevTemplate) {
        runAbove = holder ? acc : 0;
        runOpen = holder?.i === 0;
        runEmpty = false;
        runWarned = false;
      }
      const kidMargins = templateChildren(c).map(marginOf);
      const skip = s.children.slice(k + 1).findIndex((x) => !(x.kind === "conditional" && x.target === "mso"));
      const ni = skip < 0 ? -1 : k + 1 + skip;
      const nc = ni < 0 ? undefined : s.children[ni]!;
      const nextOk = nc === undefined || (marginOf(nc) !== null && !isThrough(nc));
      const outsideBottom = canBottom ? ms[0]!.bottom : 0;
      const topEdge: Edge = { margin: holder ? acc : 0, flex: holder !== null && holder.i > 0, outside: holder?.i === 0 ? acc : 0, open: holder?.i === 0 };
      const bottomEdge: Edge = nc
        ? { margin: ms[ni + 1]!.top, flex: true, outside: 0 }
        : { margin: outsideBottom, flex: false, outside: outsideBottom, open: canBottom };
      const sub =
        !prevTemplate && nextOk && kidMargins.every((m) => m !== null) && !templateChildren(c).some(isThrough)
          ? solveSpacing(c, topEdge, bottomEdge, kidMargins as Sides[])
          : null;
      prevTemplate = true;
      if (sub) {
        if (holder && holder.i > 0) put(holder, sub.x);
        if (nc) ms[ni + 1]!.top = sub.y;
        kids[k] = withInnerMargins(c, sub.inner);
        holder = null;
        acc = 0;
        after = 0;
        return;
      }
      runEmpty ||= canBeEmpty(c);
      const own = innerMargin(c);
      // the repeat adds an item's bottom and the next one's top
      if (c.op === "each" && own.top > 0 && own.bottom > 0) warnRun(c);
      // at an open top edge the margin above the container may meet it too
      if (own.top > 0 && ((holder && (acc > 0 || holder.i === 0)) || after > 0)) warnRun(c);
      after = own.bottom;
      holder = null;
      return;
    }
    prevTemplate = false;
    const nextTop = marginOf(c) === null ? 0 : isThrough(c) ? Math.max(m.top, m.bottom) : m.top;
    // empty, the run lets the margins on both sides of it meet
    const meets = !runWarned && runEmpty && nextTop > 0 && (runAbove > 0 || runOpen);
    if ((!runWarned && after > 0 && (marginOf(c)?.top ?? 0) > 0) || meets) warnAdds(c, ctx);
    after = 0;
    runEmpty = false;
    if (!marginOf(c)) {
      holder = null; // nothing to merge with across an opaque node
      return;
    }
    if (isThrough(c)) {
      const through = Math.max(m.top, m.bottom);
      m.top = 0;
      m.bottom = 0;
      if (holder) {
        acc = Math.max(acc, through);
      } else {
        holder = { i, side: "top" };
        acc = through;
      }
      put(holder, acc);
      return;
    }
    if (holder) {
      acc = Math.max(acc, m.top);
      put(holder, acc);
      m.top = 0;
    }
    holder = { i, side: "bottom" };
    acc = m.bottom;
  });

  // an unsolved construct's bottom margin collapses with the container's one level up
  // (or with whatever follows the container, when its own bottom margin is 0)
  if (!runWarned && ((after > 0 && canBottom) || (runEmpty && canBottom && runAbove > 0))) warnAdds(s, ctx);

  if (holder && canBottom) {
    const h: Slot = holder;
    if (h.i === 0) {
      // only empty stuff inside: top and bottom become one margin
      ms[0]!.top = Math.max(acc, ms[0]!.bottom);
      ms[0]!.bottom = 0;
    } else {
      acc = Math.max(acc, ms[0]!.bottom);
      put(h, 0);
      ms[0]!.bottom = acc;
    }
  }

  return {
    ...s,
    box: { ...s.box, margin: ms[0]! },
    children: kids.map((c, k) => withMargin(c, ms[k + 1]!)),
  };
};

const walk = (node: Node, ctx: Ctx): Node => {
  const n = mapChildren(node, (c) => walk(c, ctx));
  return n.kind === "stack" && n.collapse ? collapseStack(n, ctx) : n;
};

export const collapseMargins: Pass = {
  name: "collapse-margins",
  run: (ir, ctx) => walk(ir, ctx),
};

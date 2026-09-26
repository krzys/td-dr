import {
  contentWidth,
  emptyBox,
  mapChildren,
  roundPct,
  withLoc,
  zeroSides,
  type Column,
  type EmitReady,
  type Node,
  type Resolved,
  type RowNode,
  type StackNode,
} from "../ir/index.ts";
import type { Ctx } from "../ctx.ts";
import { withoutMsoCols } from "./mso-cols.ts";
import { asEmitReady } from "./brand.ts";
import type { Pass } from "./pass.ts";

// Lines cut from the resolved (whole px) widths, which match the resolver's cut except for fractional
// px bases; the resolver's W003 'rejoined' covers that case. A column without a width (auto) is
// measured by the table, so the emitter puts the whole row on one ghost line: so do we.
const wrapLines = (row: RowNode, content: number): number[][] => {
  if (row.cols.some((c) => !c.resolved)) return [row.cols.map((_, i) => i)];
  const lines: number[][] = [];
  let used = 0;
  row.cols.forEach((col, i) => {
    const w = col.resolved!.px;
    if (lines.length === 0 || used + row.gap + w > content + 1e-6) {
      lines.push([i]);
      used = w;
    } else {
      lines.at(-1)!.push(i);
      used += row.gap + w;
    }
  });
  return lines;
};

// Columns of a wrapping row stack on phones, so every column gets half the gutter on BOTH
// sides: stacked columns then line up, and the row's outer padding gives the edge halves
// back so the line breaks match the source (the row gains `gap` of room, each column
// costs `gap` more). What the padding can't give back (`short`) is taken only from a line
// that would otherwise outgrow the row, and only as much as it overflows: first column on the
// left, last on the right (a lone column pays both). A line that fits keeps full widths, so
// two columns the browser puts on separate lines can never add up to one line in the output.
// Columns that are all shares of the line (% or calc) never stack: they keep their share on a phone
// too. Their gutters can sit between them like a normal row's, with nothing at a line's ends, so no
// edge shortfall and the shares stay exact.
const lowerShareRow = (row: RowNode, content: number): RowNode | undefined => {
  const exact = row.cols.every(
    (c) => ("pct" in c.width || "calc" in c.width) && c.resolved && Math.abs(c.resolved.px - (c.resolved.pct / 100) * content) < 0.5,
  );
  if (!exact) return undefined;
  const before = Math.floor(row.gap / 2);
  const after = row.gap - before;
  const lines = wrapLines(row, content);
  // without gutters at the line ends, every break must still be forced by the line's own width
  const px = (i: number): number => row.cols[i]!.resolved!.px;
  const width = (line: number[]): number => line.reduce((s, i) => s + px(i), 0) + row.gap * (line.length - 1);
  if (lines.slice(1).some((next, k) => width(lines[k]!) + px(next[0]!) <= content + 1e-6)) return undefined;
  const cols = [...row.cols];
  const last = lines.at(-1) ?? [];
  for (const line of lines) {
    line.forEach((i, j) => {
      const col = row.cols[i]!;
      const left = j > 0 ? after : 0;
      const right = j < line.length - 1 ? before : 0;
      const base = col.padding ?? zeroSides();
      const px = col.resolved!.px + left + right;
      // the row gap (bottom spacing from the flex rule) has no line under the last one
      const bottom = last.includes(i) ? 0 : base.bottom;
      cols[i] = { ...col, padding: { ...base, left: base.left + left, right: base.right + right, bottom }, resolved: { px, pct: roundPct((px / content) * 100) } };
    });
  }
  return { ...row, cols, gap: 0 };
};

const lowerWrapRow = (row: RowNode, ctx: Ctx): RowNode => {
  const shares = row.resolvedWidth === undefined ? undefined : lowerShareRow(row, contentWidth(row.box, row.resolvedWidth));
  if (shares) return shares;
  const half = row.gap / 2;
  const inset = Math.max(half - row.box.padding.left, half - row.box.padding.right);
  const shareRow = row.cols.every((c) => "pct" in c.width || "calc" in c.width);
  if (shareRow) {
    // the flex rule left the row-gap padding trade to this pass for share rows (see lowerShareRow)
    const rowGap = Math.min(...row.cols.map((c) => c.padding?.bottom ?? 0));
    if (rowGap > row.box.padding.bottom) {
      ctx.diagnostics.report("W003", {
        message: "extra space is left under the last line of this wrapping row",
        hint: `The row gap becomes bottom spacing on every item; a padding-bottom of ${rowGap}px on the row absorbs it.`,
        loc: row.loc,
      });
    }
    row = { ...row, box: { ...row.box, padding: { ...row.box.padding, bottom: Math.max(0, row.box.padding.bottom - rowGap) } } };
  }
  if (inset > 0 && shareRow) {
    ctx.diagnostics.report("W003", {
      message: `items in this wrapping row sit up to ${inset}px in from its edges, and a line that fills the row loses that from its first and last item`,
      hint: `Email has no negative margins, so the row's side padding has to absorb half the gap at each edge. Add padding: 0 ${half}px to the row.`,
      loc: row.loc,
    });
  }
  const { padding } = row.box;
  const shortL = Math.max(0, half - padding.left);
  const shortR = Math.max(0, half - padding.right);
  const content = row.resolvedWidth === undefined ? undefined : contentWidth(row.box, row.resolvedWidth);
  const edge = new Map<number, number>();
  if (content !== undefined) {
    const inner = content + row.gap - shortL - shortR;
    for (const line of wrapLines(row, content)) {
      // an auto column's width is unknown, so the line is taken as full: the shortfall comes off in full
      const unknown = line.some((i) => !row.cols[i]!.resolved);
      const sum = line.reduce((s, i) => s + (row.cols[i]!.resolved?.px ?? 0) + row.gap, 0);
      const excess = unknown ? shortL + shortR : Math.max(0, sum - inner);
      const left = Math.min(shortL, excess);
      // an auto end column has no px to take it from: the nearest sized column on that side pays
      const sized = line.filter((i) => row.cols[i]!.resolved);
      const first = sized[0];
      const last = sized.at(-1);
      if (first !== undefined) edge.set(first, (edge.get(first) ?? 0) + left);
      if (last !== undefined) edge.set(last, (edge.get(last) ?? 0) + excess - left);
    }
  }
  const box = { ...row.box, padding: { ...padding, left: Math.max(0, padding.left - half), right: Math.max(0, padding.right - half) } };
  const innerAfter = row.resolvedWidth === undefined ? undefined : contentWidth(box, row.resolvedWidth);
  const cols = row.cols.map((col, i): Column => {
    const base = col.padding ?? zeroSides();
    const padding = { ...base, left: base.left + half, right: base.right + half };
    if (!col.resolved) return { ...col, padding };
    const give = edge.get(i) ?? 0;
    const px = Math.max(col.resolved.px + row.gap - give, padding.left + padding.right);
    // A share column's pct is its pre-cap share of the line; the emitter pairs it with max-width
    // when the cap bites. Give it the gutters and edge shortfall like px, over the row's new inner width.
    const isShare = "pct" in col.width || "calc" in col.width;
    const pct =
      isShare && content !== undefined && innerAfter
        ? roundPct(((col.resolved.pct / 100) * content + row.gap - give) / innerAfter * 100)
        : col.resolved.pct;
    return { ...col, padding, resolved: { px, pct } };
  });
  return { ...row, box, cols, gap: 0 };
};

// Grow columns are shares of what the gaps leave. The gaps are px and don't scale with the %,
// so each column carries gutter padding in proportion to its share: then its content is that
// share of the leftover at any width. Gutters are cut where those paddings meet; a share too
// big for its neighbours to balance falls back to the plain split. Stretched cards get spacer
// cells instead of padding, and those keep their px when the row narrows: an even split keeps
// the biggest one smallest.
// Each column's share of a row of plain grow columns (no px basis, no lifted side margins).
const growShares = (row: RowNode): number[] | undefined => {
  if (row.cols.length < 2) return undefined;
  const plain = row.cols.every((c) => "grow" in c.width && !("px" in c.width) && c.resolved && !c.padding?.left && !c.padding?.right);
  if (!plain) return undefined;
  const grows = row.cols.map((c) => ("grow" in c.width ? c.width.grow : 0));
  const total = grows.reduce((s, g) => s + g, 0);
  return total > 0 ? grows.map((g) => g / total) : undefined;
};

// a stretched column whose card paints: the emitter makes the card the cell, with spacer gutters
const paintedCard = (c: Column): boolean => {
  if (!c.stretch || c.child.kind !== "stack") return false;
  const b = c.child.box;
  return !!(b.background || b.backgroundImage || ["top", "right", "bottom", "left"].some((s) => b.border?.[s as "top"]?.width));
};

const lowerGrowRow = (row: RowNode): RowNode | undefined => {
  const n = row.cols.length;
  const shares = growShares(row);
  if (!shares || row.cols.some(paintedCard)) return undefined;
  let before = 0;
  const lefts = shares.map((share, i) => {
    const left = i * row.gap - row.gap * (n - 1) * before;
    before += share;
    return left;
  });
  if (lefts.some((l) => l < -1e-6 || l > row.gap + 1e-6)) return undefined;
  const cut = lefts.map((l) => Math.round(l));
  const cols = row.cols.map((col, i): Column => {
    const left = cut[i]!;
    const right = i < n - 1 ? row.gap - cut[i + 1]! : 0;
    const base = col.padding ?? zeroSides();
    const padding = { ...base, left: base.left + left, right: base.right + right };
    return { ...col, padding, resolved: { px: col.resolved!.px + left + right, pct: roundPct(shares[i]! * 100) } };
  });
  return { ...row, cols, gap: 0 };
};

// A gap below 0 is no gap (the analyzer drops one with W002; a hand-built tree can still carry it).
const lowerRow = (row: RowNode, ctx: Ctx): RowNode =>
  row.gap <= 0 ? (row.gap === 0 ? row : { ...row, gap: 0 }) : withoutMsoCols(row, (kept) => lowerKept(kept, ctx));

const lowerKept = (row: RowNode, ctx: Ctx): RowNode => {
  if (row.wrap) return lowerWrapRow(row, ctx);
  const grow = lowerGrowRow(row);
  if (grow) return grow;
  const gap = row.gap;
  // Split each gutter between its two neighbours (px rows, and grow rows too uneven to balance).
  const before = Math.floor(gap / 2);
  const after = gap - before;
  const last = row.cols.length - 1;
  const padded = row.cols.map((col, i): Column => {
    const left = i > 0 ? after : 0;
    const right = i < last ? before : 0;
    if (!left && !right) return col;
    const base = col.padding ?? zeroSides();
    const padding = { ...base, left: base.left + left, right: base.right + right };
    return col.resolved
      ? { ...col, padding, resolved: { px: col.resolved.px + left + right, pct: col.resolved.pct } }
      : { ...col, padding };
  });
  const total =
    row.resolvedWidth !== undefined
      ? contentWidth(row.box, row.resolvedWidth)
      : padded.reduce((sum, c) => sum + (c.resolved?.px ?? 0), 0);
  // grow columns' px are rounded; their exact share keeps equal columns equal
  const shares = growShares(row);
  const content = row.cols.reduce((sum, c) => sum + (c.resolved?.px ?? 0), 0);
  const exact = (col: Column, i: number): number =>
    shares ? shares[i]! * content + (col.padding?.left ?? 0) + (col.padding?.right ?? 0) : col.resolved!.px;
  const cols = padded.map((col, i) =>
    col.resolved && total > 0 ? { ...col, resolved: { px: col.resolved.px, pct: roundPct((exact(col, i) / total) * 100) } } : col,
  );
  return { ...row, cols, gap: 0 };
};

// The gap goes onto the child as padding-top. Inside a template node it goes onto what the ESP repeats,
// so every repetition keeps it and a dropped block takes it along.
const gapAbove = (child: Node, gap: number, width: number | undefined): Node => {
  if (child.kind === "template") return mapChildren(child, (c) => gapAbove(c, gap, width));
  const wrapper: StackNode = {
    kind: "stack",
    box: { ...emptyBox(), padding: { top: gap, right: 0, bottom: 0, left: 0 } },
    children: [child],
    gap: 0,
    collapse: false,
    ...(width !== undefined ? { resolvedWidth: width } : {}),
  };
  return withLoc(wrapper, child.loc);
};

const lowerStack = (stack: StackNode, ctx: Ctx): StackNode => {
  if (stack.gap <= 0) return stack.gap === 0 ? stack : { ...stack, gap: 0 };
  const gap = stack.gap;
  const width = stack.resolvedWidth !== undefined ? contentWidth(stack.box, stack.resolvedWidth) : undefined;
  // an Outlook-only child leaves no gap for other clients, and the first one they see has none above it
  const hidden = (n: Node): boolean => n.kind === "conditional" && n.target === "mso";
  const first = stack.children.findIndex((c) => !hidden(c));
  const lead = stack.children[first];
  // a list that leads still gets the gap on each repetition, or they would sit on top of each other
  const leadingList = lead?.kind === "template" && lead.op === "each";
  if (lead?.kind === "template") {
    ctx.diagnostics.report("W003", {
      message: leadingList ? "the first repetition of this list gets a gap above it" : "the gap below this block stays when the ESP leaves it out",
      hint: "Gaps sit between siblings that are always there; give the list or block a container of its own, or space it with padding.",
      loc: lead.loc,
    });
  }
  const children = stack.children.map((child, i): Node => (hidden(child) || i < first || (i === first && !leadingList) ? child : gapAbove(child, gap, width)));
  return { ...stack, children, gap: 0 };
};

const convert = (input: Node, ctx: Ctx): Node => {
  const node = mapChildren(input, (c) => convert(c, ctx));
  if (node.kind === "row") return lowerRow(node, ctx);
  if (node.kind === "stack") return lowerStack(node, ctx);
  return node;
};

// Margins are padding already (margin-to-padding runs before resolve-widths), so no gap left means emit-ready.
export const gapToPadding: Pass<Resolved, EmitReady> = { name: "gap-to-padding", run: (ir: Resolved, ctx: Ctx): EmitReady => asEmitReady(convert(ir, ctx)) };

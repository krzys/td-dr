import type { Ctx } from "../ctx.ts";
import { contentWidth, fixedSlot, gutterX, insetX, isOutlookOnlyCol as isMsoCol, mapChildren, SCREEN, within, type Box, type Column, type Fluid, type Node, type Padded, type Resolved, type ResolvedWidth, type RowNode, type StackNode } from "../ir/index.ts";
import { arithmeticResolver } from "./arithmetic-resolver.ts";
import { asResolved } from "./brand.ts";
import type { Pass } from "./pass.ts";

// The room a box gives its children: its content box, never less than nothing.
const slotOf = (box: Box, outer: number): number => Math.max(0, contentWidth(box, outer));

// The same on a narrow screen (geometry.ts Fluid): the content box of a container in a slot that follows it so.
const screenSlot = (box: Box, f: Fluid): Fluid => {
  const w = box.width;
  return within(w && "px" in w ? fixedSlot(w.px) : w && "pct" in w ? within(f, w.pct / 100) : f, 1, insetX(box));
};

// A column's slot on a narrow screen. A wrapping row stacks its px and grow items there (docs/support.md#wrapping-rows),
// so they fill the line; a % or calc share stays a share; elsewhere a px column is fixed.
const columnSlot = (col: Column, r: ResolvedWidth | null, row: Fluid, wrap: boolean): Fluid => {
  const w = col.width;
  const f = "pct" in w ? within(row, w.pct / 100) : "calc" in w ? within(row, w.calc.pct / 100, -w.calc.px) : wrap || !r ? row : "px" in w ? fixedSlot(r.px) : within(row, r.pct / 100);
  return within(f, 1, gutterX(col));
};

// Border-box width of a container inside `available`, reporting when it asks for more.
const boxWidth = (node: StackNode | RowNode, available: number, ctx: Ctx): number => {
  const { box } = node;
  const own = box.width && "px" in box.width ? box.width.px : undefined;
  // max-width larger than the slot is a no-op in CSS too; only a fixed width is a problem
  if (own !== undefined && own > available && !node.reportedWide) {
    ctx.diagnostics.report("W004", {
      message: `width ${own}px is wider than its slot (${available}px) and was clamped`,
      loc: node.loc,
    });
  }
  const pct = box.width && "pct" in box.width ? (available * box.width.pct) / 100 : undefined;
  return Math.min(available, box.maxWidth ?? Infinity, own ?? pct ?? available);
};

// W004 says "clamped", so the emitted width must be the clamped one too.
const clamp = <T extends StackNode | RowNode>(node: T, width: number): T =>
  node.box.width && "px" in node.box.width && node.box.width.px > width ? { ...node, box: { ...node.box, width: { px: width } } } : node;

const msoWidth = (col: Column, inner: number): ResolvedWidth | undefined => {
  const w = col.width;
  const px = "px" in w ? w.px : "pct" in w ? (inner * w.pct) / 100 : "calc" in w ? (inner * w.calc.pct) / 100 + w.calc.px : undefined;
  return px === undefined ? undefined : { px, pct: inner > 0 ? (px / inner) * 100 : 0 };
};

// A flex-shrink: 0 column the row scaled down (arithmetic-resolver W003) is narrower here than in the source.
const squeezedCol = (col: Column, r: ResolvedWidth): boolean => !!col.noShrink && "px" in col.width && r.px < col.width.px - 0.5;

// `squeezed`: the subtree sits in such a column, so a fluid image its slot clamps is one the source shows whole.
const resolve = (node: Node, available: number, ctx: Ctx, screen: Fluid, squeezed = false): Node => {
  switch (node.kind) {
    case "stack": {
      const resolvedWidth = boxWidth(node, available, ctx);
      node = clamp(node, resolvedWidth);
      const inner = slotOf(node.box, resolvedWidth);
      const narrow = screenSlot(node.box, screen);
      return { ...node, resolvedWidth, children: node.children.map((c) => resolve(c, inner, ctx, narrow, squeezed)) };
    }
    case "row": {
      const resolvedWidth = boxWidth(node, available, ctx);
      node = clamp(node, resolvedWidth);
      const inner = slotOf(node.box, resolvedWidth);
      // other clients never see an Outlook-only item, so the rest share the row as if it weren't there
      const kept = node.cols.filter((c) => !isMsoCol(c));
      const narrow = screenSlot(node.box, screen);
      const { wrap } = node;
      const widths = arithmeticResolver.resolve({ ...node, cols: kept }, inner, ctx, narrow);
      const taken = widths.reduce((sum, w) => sum + (w?.px ?? 0), 0);
      const autoSpace = Math.max(0, inner - taken - node.gap * (kept.length - 1));
      let k = 0;
      const cols = node.cols.map((col): Column => {
        if (isMsoCol(col)) {
          // its own width where it has one, else its content shrinks to fit the row (autoSpace is 0 in full rows and grids)
          const own = msoWidth(col, inner);
          const slot = columnSlot(col, own ?? null, narrow, true);
          return own ? { ...col, resolved: own, child: resolve(col.child, Math.max(0, own.px - gutterX(col)), ctx, slot, squeezed) } : { ...col, resolved: null, child: resolve(col.child, Math.max(0, inner - gutterX(col)), ctx, slot, squeezed) };
        }
        const r = widths[k++] ?? null;
        const narrowCol = columnSlot(col, r, narrow, wrap);
        // the table sizes it: auto columns (and grow ones beside them) get whatever the fixed ones leave
        if (!r) return { ...col, resolved: null, child: resolve(col.child, autoSpace, ctx, narrowCol, squeezed) };
        const slot = Math.max(0, r.px - gutterX(col));
        return { ...col, resolved: r, child: resolve(col.child, slot, ctx, narrowCol, squeezed || squeezedCol(col, r)) };
      });
      return { ...node, resolvedWidth, cols };
    }
    case "image": {
      const slot = slotOf(node.box, available);
      if (node.width !== undefined) {
        if (node.width > slot) {
          ctx.diagnostics.report("W004", {
            message: `image wider than its column (${node.width} > ${slot})`,
            loc: node.loc,
          });
          // max-width:100% clamps it where the source keeps it whole: the height follows the width, as the
          // source's square stays square (a fixed height on a clamped image distorts it there too, so elsewhere it stays)
          if (squeezed && node.fluid) {
            const width = Math.floor(slot);
            return { ...node, width, ...(node.height ? { height: Math.round((node.height * width) / node.width) } : {}) };
          }
        }
        return node;
      }
      return node.fluid ? { ...node, width: Math.floor(slot) } : node;
    }
    case "button": {
      // shrink-to-fit never exceeds the slot; the emitter sizes Outlook's shape from this cap
      const { box } = node;
      if (box.width && "px" in box.width) {
        if (box.width.px <= available) return node;
        ctx.diagnostics.report("W004", { message: `button width ${box.width.px}px is wider than its slot (${available}px) and was clamped`, loc: node.loc });
        return { ...node, box: { ...box, width: { px: available } } };
      }
      // a % width without a cap has no Outlook size to give (square corners, reported by the rule)
      if (box.width && box.maxWidth === undefined) return node;
      return { ...node, box: { ...box, maxWidth: Math.min(box.maxWidth ?? Infinity, available) } };
    }
    case "conditional":
      return { ...node, child: resolve(node.child, available, ctx, screen, squeezed) };
    case "template":
      return mapChildren(node, (c) => resolve(c, available, ctx, screen, squeezed));
    default:
      return node;
  }
};

export const resolveWidths: Pass<Padded, Resolved> = { name: "resolve-widths", run: (ir: Padded, ctx: Ctx): Resolved => asResolved(resolve(ir, ctx.options.width, ctx, SCREEN)) };

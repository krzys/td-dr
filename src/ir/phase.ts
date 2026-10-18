// Layout phases (docs/architecture.md#ir-phases). The IR is one Node type from analyze to emit; a brand on the root says
// which pass contracts hold for the whole tree, so each stage states the phase it needs:
//   Node       analyzed: margins and gaps as authored, no geometry
//   Padded     margin-to-padding ran: every margin is 0
//   Resolved   resolve-widths ran too: every stack and row has its resolvedWidth, every column a resolution
//   EmitReady  gap-to-padding ran too: every gap is 0. What emit() takes
// Only the pass that builds a phase brands a tree with it (passes/brand.ts); checkEmitReady verifies one.
import { childNodes } from "./helpers.ts";
import type { Column, Node, RowNode, SrcLoc, StackNode } from "./types.ts";

declare const paddedPhase: unique symbol;
declare const resolvedPhase: unique symbol;
declare const emitPhase: unique symbol;

export type Padded = Node & { readonly [paddedPhase]: true };
export type Resolved = Padded & { readonly [resolvedPhase]: true };
export type EmitReady = Resolved & { readonly [emitPhase]: true };

const where = (n: { loc?: SrcLoc }): string => (n.loc ? ` at ${n.loc.line}:${n.loc.col}` : "");

// A container's border-box width in a resolved tree; one without it is an internal error.
export const resolvedWidthOf = (n: StackNode | RowNode): number => {
  if (n.resolvedWidth === undefined) throw new Error(`resolved layout: ${n.kind}${where(n)} has no resolvedWidth (resolve-widths didn't run)`);
  return n.resolvedWidth;
};

// null is the table sizing a column on purpose; that is only ever an auto or grow column.
const tableSized = (c: Column): boolean => "auto" in c.width || "grow" in c.width;

type Check = (n: Node) => string | undefined;

const geometry: Check = (n) => {
  if (n.kind !== "stack" && n.kind !== "row") return undefined;
  if (n.resolvedWidth === undefined) return `${n.kind}${where(n)} has no resolvedWidth (resolve-widths didn't run)`;
  if (n.kind === "stack") return undefined;
  const i = n.cols.findIndex((c) => c.resolved === undefined || (c.resolved === null && !tableSized(c)));
  if (i < 0) return undefined;
  const c = n.cols[i]!;
  return c.resolved === undefined
    ? `column ${i + 1} of the row${where(n)} has no resolution (resolve-widths didn't run)`
    : `column ${i + 1} of the row${where(n)} is ${Object.keys(c.width)[0]}-sized but has no width; only auto and grow columns are left to the table`;
};

const lowered: Check = (n) => {
  if ((n.kind === "stack" || n.kind === "row") && n.gap !== 0) return `${n.kind}.gap must be 0${where(n)} (gap-to-padding didn't run)`;
  const m = n.kind === "inline" ? n.margin : "box" in n ? n.box.margin : undefined;
  return m && (m.top || m.right || m.bottom || m.left) ? `${n.kind}${where(n)} still has a margin (margin-to-padding didn't run)` : undefined;
};

const problem = (n: Node, checks: readonly Check[]): string | undefined => {
  for (const check of checks) {
    const p = check(n);
    if (p) return p;
  }
  for (const c of childNodes(n)) {
    const p = problem(c, checks);
    if (p) return p;
  }
  return undefined;
};

// An internal error, never the author's: a pass broke its contract.
export const checkEmitReady = (n: Node): EmitReady => {
  const p = problem(n, [geometry, lowered]);
  if (p) throw new Error(`emit: ${p}`);
  return n as EmitReady;
};

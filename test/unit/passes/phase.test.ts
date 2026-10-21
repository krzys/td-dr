import { describe, expect, test } from "vitest";
import { checkEmitReady, emptyBox, sides, type Column, type Node, type RowNode, type StackNode } from "../../../src/ir/index.ts";
import { emit } from "../../../src/emit/emit.ts";
import { flattenStacks } from "../../../src/passes/flatten-stacks.ts";
import { gapToPadding } from "../../../src/passes/gap-to-padding.ts";
import { runPasses } from "../../../src/passes/index.ts";
import { marginToPadding } from "../../../src/passes/margin-to-padding.ts";
import { resolveWidths } from "../../../src/passes/resolve-widths.ts";
import { testCtx } from "../../helpers/index.ts";
import { givenPadded } from "../../helpers/phase.ts";

const inline: Node = { kind: "inline", html: "x", style: {}, margin: sides(0) };
const col = (width: Column["width"], extra: Partial<Column> = {}): Column => ({ width, valign: "top", child: inline, ...extra });
const row = (cols: Column[], extra: Partial<RowNode> = {}): RowNode => ({ kind: "row", box: emptyBox(), gap: 0, wrap: false, cols, resolvedWidth: 600, loc: { line: 3, col: 5 }, ...extra });
const stack = (children: Node[], extra: Partial<StackNode> = {}): StackNode => ({ kind: "stack", box: emptyBox(), children, gap: 0, collapse: false, resolvedWidth: 600, ...extra });

describe("layout phases", () => {
  test("the passes take an analyzed tree to an emit-ready one: auto columns are the table's, the rest have widths", () => {
    const cols = [col({ auto: true }), col({ px: 200 }), col({ grow: 1 })];
    const analyzed: Node = { kind: "stack", box: emptyBox(), gap: 8, collapse: false, children: [{ kind: "row", box: emptyBox(), gap: 10, wrap: false, cols }] };
    const out = runPasses(analyzed, testCtx()) as StackNode;
    expect(() => checkEmitReady(out)).not.toThrow();
    const r = (out.children[0] as RowNode).cols;
    // grow beside an auto column is the table's too: there is no leftover to compute
    expect(r.map((c) => c.resolved && c.resolved.px)).toEqual([null, 210, null]);
  });

  test("an Outlook-only item without a width of its own is left to the table", () => {
    const mso = col({ auto: true }, { child: { kind: "conditional", target: "mso", child: inline } });
    const out = resolveWidths.run(givenPadded(row([col({ px: 100 }), mso])), testCtx()) as RowNode;
    expect(out.cols[1]!.resolved).toBeNull();
  });

  test("an unresolved tree is an internal error naming the pass, not something to emit", () => {
    const { resolvedWidth: _, ...unsized } = stack([inline]);
    expect(() => checkEmitReady(unsized)).toThrow("emit: stack has no resolvedWidth (resolve-widths didn't run)");
    expect(() => checkEmitReady(stack([row([col({ px: 100 })])]))).toThrow("emit: column 1 of the row at 3:5 has no resolution (resolve-widths didn't run)");
  });

  test("only auto and grow columns may be left to the table", () => {
    for (const width of [{ px: 100 }, { pct: 50 }, { calc: { pct: 50, px: -10 } }] as const) {
      const kind = Object.keys(width)[0];
      expect(() => checkEmitReady(stack([row([col(width, { resolved: null })])]))).toThrow(`column 1 of the row at 3:5 is ${kind}-sized but has no width`);
    }
    expect(() => checkEmitReady(stack([row([col({ auto: true }, { resolved: null }), col({ grow: 1 }, { resolved: null })])]))).not.toThrow();
  });

  test("gaps and margins left over are internal errors too", () => {
    expect(() => checkEmitReady(stack([inline], { gap: 4, loc: { line: 2, col: 1 } }))).toThrow("emit: stack.gap must be 0 at 2:1 (gap-to-padding didn't run)");
    expect(() => checkEmitReady(stack([{ ...inline, margin: sides(4, 0) } as Node]))).toThrow("emit: inline still has a margin (margin-to-padding didn't run)");
  });

  test("a custom pass list runs as given and promises no phase", () => {
    const seen: string[] = [];
    const mk = (name: string) => ({ name, run: (n: Node) => (seen.push(name), n) });
    const out = runPasses(stack([inline], { gap: 4 }), testCtx(), [mk("a"), mk("b")]);
    expect(seen).toEqual(["a", "b"]);
    expect(() => checkEmitReady(out)).toThrow("gap");
  });

  test("the types chain the passes only in order (checked by tsc)", () => {
    const ctx = testCtx();
    const analyzed: Node = stack([{ ...inline, margin: sides(4, 0) } as Node]);
    // @ts-expect-error margin-to-padding skipped: an analyzed tree is not Padded
    const noPadding = () => resolveWidths.run(analyzed, ctx);
    // @ts-expect-error resolve-widths skipped
    const noWidths = () => gapToPadding.run(marginToPadding.run(analyzed, ctx), ctx);
    // @ts-expect-error gap-to-padding skipped
    const noGaps = () => emit(resolveWidths.run(marginToPadding.run(analyzed, ctx), ctx), ctx);
    void [noPadding, noWidths, noGaps];
    const chained = flattenStacks.run(gapToPadding.run(resolveWidths.run(marginToPadding.run(analyzed, ctx), ctx), ctx), ctx);
    expect(emit(chained, ctx).html).toContain("padding:4px 0;");
  });
});

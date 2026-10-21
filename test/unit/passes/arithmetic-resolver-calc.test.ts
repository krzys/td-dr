import { describe, expect, test } from "vitest";
import { emptyBox, type Node, type RowNode, type WidthSpec } from "../../../src/ir/index.ts";
import { arithmeticResolver } from "../../../src/passes/arithmetic-resolver.ts";
import { codesOf, testCtx } from "../../helpers/index.ts";

const leaf: Node = { kind: "raw", html: "" };
const row = (widths: WidthSpec[], gap = 0, wrap = false): RowNode => ({
  kind: "row",
  box: emptyBox(),
  gap,
  wrap,
  cols: widths.map((width) => ({ width, valign: "top" as const, child: leaf })),
});
const calc = (pct: number, px: number): WidthSpec => ({ calc: { pct, px } });
const px = (r: ReturnType<typeof arithmeticResolver.resolve>) => r.map((c) => c?.px);

describe("arithmeticResolver calc() columns", () => {
  test("calc is exact px = content * P / 100 + N, with the column's share as pct", () => {
    const r = arithmeticResolver.resolve(row([calc(50, -10), calc(50, -10)], 20, true), 600, testCtx());
    expect(px(r)).toEqual([290, 290]);
    expect(r[0]?.pct).toBeCloseTo((290 / 600) * 100, 6);
  });

  test("two calc(50% - 10px) columns with a 20px gap share one line at 600", () => {
    const ctx = testCtx();
    arithmeticResolver.resolve(row([calc(50, -10), calc(50, -10)], 20, true), 600, ctx);
    expect(codesOf(ctx)).toEqual([]);
  });

  test("a calc column keeps its fractional width in a wrapping row (no floor)", () => {
    const r = arithmeticResolver.resolve(row([calc(33.3333, -8)], 0, true), 588, testCtx());
    expect(r[0]?.px).toBeCloseTo(188, 2);
    expect(Number.isInteger(r[0]?.px)).toBe(false);
  });

  test("calc(30% - 8px) beside a grow column: 172 + 16 + 412", () => {
    expect(px(arithmeticResolver.resolve(row([calc(30, -8), { grow: 1 }], 16), 600, testCtx()))).toEqual([172, 412]);
  });

  test("a calc column is never treated as a fixed px column", () => {
    // the whole-pixel leftover goes to a share column, not to a px one
    const r = arithmeticResolver.resolve(row([calc(33.3333, 0), calc(33.3333, 0), calc(33.3333, 0)]), 100, testCtx());
    expect(px(r)!.reduce((a, b) => a! + b!, 0)).toBe(100);
    const mixed = arithmeticResolver.resolve(row([{ px: 10 }, calc(45, 0), calc(45, 0)]), 101, testCtx());
    expect(px(mixed)![0]).toBe(10);
    expect(px(mixed)!.reduce((a, b) => a! + b!, 0)).toBe(101);
  });

  test("a negative calc result is 0", () => {
    expect(px(arithmeticResolver.resolve(row([calc(5, -100)], 0, true), 600, testCtx()))).toEqual([0]);
  });

  test("a % column's max-width clamps its px but not its share", () => {
    const capped = row([{ pct: 50 }], 0, true);
    capped.cols[0]!.child = { kind: "stack", box: { ...emptyBox(), maxWidth: 200 }, children: [], gap: 0, collapse: false };
    expect(arithmeticResolver.resolve(capped, 600, testCtx())[0]).toEqual({ px: 200, pct: 50 });
  });

  test("a column shrunk to the row reports a share of 100", () => {
    expect(arithmeticResolver.resolve(row([{ pct: 150 }], 0, true), 600, testCtx())[0]).toEqual({ px: 600, pct: 100 });
  });

  test("a grow column beside an unrounded % column stays whole px", () => {
    const r = arithmeticResolver.resolve(row([{ pct: 33.3333 }, { px: 100, grow: 1 } as WidthSpec], 0, true), 600, testCtx());
    expect(r[1]?.px).toBe(400);
  });
});

import { describe, expect, test } from "vitest";
import { emptyBox, type Node, type RowNode, type WidthSpec } from "../../../src/ir/index.ts";
import { arithmeticResolver } from "../../../src/passes/arithmetic-resolver.ts";
import { codesOf, testCtx } from "../../helpers/index.ts";

const leaf: Node = { kind: "raw", html: "" };
const row = (widths: WidthSpec[], gap = 0): RowNode => ({
  kind: "row",
  box: emptyBox(),
  gap,
  wrap: false,
  cols: widths.map((width) => ({ width, valign: "top" as const, child: leaf })),
});
const px = (r: ReturnType<typeof arithmeticResolver.resolve>) => r.map((c) => c && c.px);

describe("arithmeticResolver", () => {
  test("px + grow", () => {
    const r = arithmeticResolver.resolve(row([{ px: 200 }, { grow: 1 }]), 600, testCtx());
    expect(r).toEqual([
      { px: 200, pct: 33.33 },
      { px: 400, pct: 66.67 },
    ]);
  });

  test("pct of the content box", () => {
    expect(px(arithmeticResolver.resolve(row([{ pct: 25 }, { pct: 75 }]), 600, testCtx()))).toEqual([150, 450]);
  });

  test("gaps are subtracted before sharing", () => {
    const r = arithmeticResolver.resolve(row([{ grow: 1 }, { grow: 1 }], 20), 600, testCtx());
    expect(px(r)).toEqual([290, 290]);
  });

  test("rounding leftovers go to the last column", () => {
    const r = arithmeticResolver.resolve(row([{ grow: 1 }, { grow: 1 }, { grow: 1 }], 0), 100, testCtx());
    expect(px(r)).toEqual([33, 33, 34]);
    const g = arithmeticResolver.resolve(row([{ grow: 1 }, { grow: 1 }, { grow: 1 }], 5), 100, testCtx());
    expect(px(g)!.reduce((a, b) => a! + b!, 0)! + 10).toBe(100);
  });

  test("under-filled fixed rows are not stretched", () => {
    expect(px(arithmeticResolver.resolve(row([{ px: 100 }, { px: 100 }]), 600, testCtx()))).toEqual([100, 100]);
  });

  test("auto makes grow columns null", () => {
    const ctx = testCtx();
    const r = arithmeticResolver.resolve(row([{ px: 100 }, { auto: true }, { grow: 1 }]), 600, ctx);
    expect(px(r)).toEqual([100, null, null]);
    expect(codesOf(ctx)).toEqual([]);
  });

  test("overflow warns and scales down", () => {
    const ctx = testCtx();
    const r = arithmeticResolver.resolve(row([{ px: 400 }, { px: 400 }]), 600, ctx);
    expect(px(r)).toEqual([300, 300]);
    expect(codesOf(ctx)).toEqual(["W003"]);
  });

  test("empty row", () => {
    expect(arithmeticResolver.resolve(row([]), 600, testCtx())).toEqual([]);
  });
});

describe("resolver edge cases", () => {
  const row = (widths: RowNode["cols"][number]["width"][], gap = 0): RowNode => ({
    kind: "row", box: emptyBox(), gap, wrap: false,
    cols: widths.map((width) => ({ width, valign: "top" as const, child: { kind: "raw" as const, html: "" } })),
  });
  const px = (r: RowNode, w: number) => arithmeticResolver.resolve(r, w, testCtx()).map((c) => c?.px);

  test("thirds in percent still fill the row", () => {
    expect(px(row([{ pct: 33.33 }, { pct: 33.33 }, { pct: 33.33 }]), 600)).toEqual([199, 199, 202]);
  });
  test("leftover pixels go to a grow column, not a px one", () => {
    expect(px(row([{ grow: 1 }, { grow: 1 }, { grow: 1 }, { px: 50 }]), 151)).toEqual([33, 33, 35, 50]);
  });
  test("pct is of the content box, not of the space left after gaps", () => {
    expect(px(row([{ pct: 50 }, { grow: 1 }], 20), 600)).toEqual([300, 280]);
  });
  test("an authored percentage stays exact, the px only floors it", () => {
    const out = arithmeticResolver.resolve(row([{ pct: 30 }, { pct: 40 }, { pct: 30 }]), 568, testCtx());
    expect(out.map((c) => c?.pct)).toEqual([30, 40, 30]);
    expect(out.map((c) => c?.px)).toEqual([170, 227, 171]);
  });
});

test("a grow column's own padding (lifted margins) doesn't flex", () => {
  const cols = [{ grow: 1 }, { grow: 1 }].map((width, i) => ({
    width, valign: "top" as const, child: { kind: "raw" as const, html: "" },
    ...(i === 0 ? { padding: { top: 0, right: 10, bottom: 0, left: 10 } } : {}),
  }));
  const r = arithmeticResolver.resolve({ kind: "row", box: emptyBox(), gap: 0, wrap: false, cols }, 600, testCtx());
  expect(r.map((c) => c?.px)).toEqual([310, 290]);
});

describe("arithmeticResolver wrapping rows", () => {
    const wrapRow = (widths: WidthSpec[], gap = 0): RowNode => ({ ...row(widths, gap), wrap: true });

    test("columns wider than the row are not scaled down and not topped up", () => {
      const ctx = testCtx();
      const r = arithmeticResolver.resolve(wrapRow([{ px: 400 }, { px: 300 }]), 600, ctx);
      expect(px(r)).toEqual([400, 300]);
      expect(codesOf(ctx)).toEqual([]);
      expect(px(arithmeticResolver.resolve(wrapRow([{ px: 250 }, { px: 250 }]), 601, testCtx()))).toEqual([250, 250]);
    });

    test("a heavily padded row of px columns doesn't get the % line-break warning", () => {
      const ctx = testCtx();
      const r = wrapRow([{ px: 100 }, { px: 100 }]);
      const padded = { ...r, box: { ...r.box, padding: { top: 0, right: 190, bottom: 0, left: 190 } } };
      arithmeticResolver.resolve(padded, 220, ctx);
      expect(codesOf(ctx)).toEqual([]);
    });

    test("an item wider than the line is clamped to it with W003", () => {
      const ctx = testCtx();
      const r = arithmeticResolver.resolve(wrapRow([{ px: 700 }, { px: 100 }]), 600, ctx);
      expect(px(r)).toEqual([600, 100]);
      expect(codesOf(ctx)).toEqual(["W003"]);
    });

    test("a grow column shares what the fixed columns leave", () => {
      expect(px(arithmeticResolver.resolve(wrapRow([{ px: 200 }, { grow: 1 }]), 600, testCtx()))).toEqual([200, 400]);
    });

    test("a grow column with no room left takes a line of its own", () => {
      const r = arithmeticResolver.resolve(wrapRow([{ px: 400 }, { px: 200 }, { grow: 1 }]), 600, testCtx());
      expect(px(r)).toEqual([400, 200, 600]);
    });

    test("a grow column fills the leftover of the line it wraps to, not of the whole row", () => {
      const r = arithmeticResolver.resolve(wrapRow([{ px: 400 }, { px: 300 }, { grow: 1 }]), 600, testCtx());
      expect(px(r)).toEqual([400, 300, 300]);
    });

    test("px-basis grow items fill their own line on top of the basis, by grow factor", () => {
      const ctx = testCtx();
      const r = arithmeticResolver.resolve(
        wrapRow([{ px: 184, grow: 1 }, { px: 184, grow: 1 }, { px: 344, grow: 2 }, { px: 184, grow: 1 }], 8),
        568,
        ctx,
      );
      // 184+184+8 leaves 192; 344+184+8 leaves 32, shared 2:1, the rounding pixel goes to the last grower
      expect(px(r)).toEqual([280, 280, 365, 195]);
      expect(codesOf(ctx)).toEqual(["W003"]);
    });

    test("a grow item alone on its line fills it without a warning", () => {
      const ctx = testCtx();
      expect(px(arithmeticResolver.resolve(wrapRow([{ px: 400 }, { px: 300, grow: 1 }]), 600, ctx))).toEqual([400, 600]);
      expect(codesOf(ctx)).toEqual([]);
    });

    test("grow next to an auto item is dropped with a W003", () => {
      const ctx = testCtx();
      const r = arithmeticResolver.resolve(wrapRow([{ px: 200, grow: 1 }, { auto: true }]), 600, ctx);
      expect(px(r)).toEqual([200, null]);
      expect(ctx.diagnostics.list().map((d) => d.message)).toEqual(["flex-grow is ignored in a wrapping row with auto-width items"]);
    });

    test("% lines: silent when they stay one line down to a phone, W003 when the source stacks earlier", () => {
      const quiet = testCtx();
      arithmeticResolver.resolve(wrapRow([{ pct: 48 }, { pct: 48 }], 12), 600, quiet);
      expect(codesOf(quiet)).toEqual([]);
      const loud = testCtx();
      arithmeticResolver.resolve(wrapRow([{ pct: 48 }, { pct: 48 }], 20), 580, loud);
      expect(loud.diagnostics.list().map((d) => d.message)).toEqual(["% columns with a gap stop sharing a line once the row is narrower than 500px in the source, but stay side by side in the output"]);
    });

    test("% lines are checked down to the narrowest phones (320px), not to one test viewport", () => {
      const ctx = testCtx();
      // 14 / (1 - 0.96) = 350px: a 360px phone stacks the source
      arithmeticResolver.resolve(wrapRow([{ pct: 48 }, { pct: 48 }], 14), 600, ctx);
      expect(ctx.diagnostics.list().map((d) => d.message)).toEqual(["% columns with a gap stop sharing a line once the row is narrower than 350px in the source, but stay side by side in the output"]);
    });

    test("silent when two columns the browser separates stay separate in the output", () => {
      const ctx = testCtx();
      arithmeticResolver.resolve(wrapRow([{ px: 296 }, { px: 296 }], 20), 600, ctx);
      expect(codesOf(ctx)).toEqual([]);
    });

    test("% columns keep exact widths, so a line cut from them can't rejoin once rounded", () => {
      const ctx = testCtx();
      expect(px(arithmeticResolver.resolve(wrapRow([{ pct: 49 }, { pct: 49 }], 12), 588, ctx))).toEqual([288.12, 288.12]);
      expect(codesOf(ctx)).toEqual([]);
    });

    test("33.3333% x 3 fills the line", () => {
      const out = arithmeticResolver.resolve(wrapRow([{ pct: 33.3333 }, { pct: 33.3333 }, { pct: 33.3333 }]), 600, testCtx());
      expect(out.map((r) => r?.pct)).toEqual([33.3333, 33.3333, 33.3333]);
      expect(out.reduce((s, r) => s + (r?.px ?? 0), 0)).toBeCloseTo(600, 2);
    });

    test("a grow item stops at its max-width and the sibling takes the rest", () => {
      const capped = wrapRow([{ px: 180, grow: 1 }, { px: 180, grow: 1 }]);
      capped.cols[0]!.child = { kind: "stack", box: { ...emptyBox(), maxWidth: 250 }, children: [], gap: 0, collapse: false };
      expect(px(arithmeticResolver.resolve(capped, 600, testCtx()))).toEqual([250, 350]);
    });

    test("fractional px bases that rejoin once floored report the rounding", () => {
      const ctx = testCtx();
      arithmeticResolver.resolve(wrapRow([{ px: 295.6 }, { px: 295.6 }], 9), 600, ctx);
      expect(ctx.diagnostics.list().map((d) => d.message)).toEqual(["a wrapping line the browser cuts here fits on one line once widths are rounded to whole pixels"]);
    });

    test("a fixed basis above its max-width is clamped before lines are cut", () => {
      const r = wrapRow([{ px: 300 }, { px: 300 }, { px: 100 }]);
      r.cols[0]!.child = { kind: "stack", box: { ...emptyBox(), maxWidth: 200 }, children: [], gap: 0, collapse: false };
      expect(px(arithmeticResolver.resolve(r, 600, testCtx()))).toEqual([200, 300, 100]);
    });

    test("three 40% columns wrap 2+1", () => {
      expect(px(arithmeticResolver.resolve(wrapRow([{ pct: 40 }, { pct: 40 }, { pct: 40 }], 12), 600, testCtx()))).toEqual([240, 240, 240]);
    });

    test("% columns keep their share and wrap by it", () => {
      expect(px(arithmeticResolver.resolve(wrapRow([{ pct: 48 }, { pct: 48 }]), 588, testCtx()))).toEqual([282.24, 282.24]);
      expect(px(arithmeticResolver.resolve(wrapRow([{ pct: 60 }, { pct: 60 }]), 600, testCtx()))).toEqual([360, 360]);
    });
});

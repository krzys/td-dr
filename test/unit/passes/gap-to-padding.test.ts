import { describe, expect, test } from "vitest";
import {
  emptyBox,
  mapChildren,
  sides,
  type Box,
  type Column,
  type Node,
  type RowNode,
  type StackNode,
} from "../../../src/ir/index.ts";
import { gapToPadding } from "../../../src/passes/gap-to-padding.ts";
import { testCtx } from "../../helpers/index.ts";
import { givenResolved } from "../../helpers/phase.ts";

const run = (n: Node) => gapToPadding.run(givenResolved(n), testCtx());
const img: Node = { kind: "image", box: emptyBox(), src: "a.png", alt: "" };
const col = (width: Column["width"], resolved?: Column["resolved"], extra: Partial<Column> = {}): Column => ({
  width,
  valign: "top",
  child: img,
  ...(resolved ? { resolved } : {}),
  ...extra,
});
const row = (cols: Column[], gap: number, resolvedWidth?: number, box: Partial<Box> = {}): RowNode => ({
  kind: "row",
  box: { ...emptyBox(), ...box },
  gap,
  wrap: false,
  cols,
  ...(resolvedWidth !== undefined ? { resolvedWidth } : {}),
});
const stack = (children: Node[], gap: number, extra: Partial<StackNode> = {}): StackNode => ({
  kind: "stack",
  box: emptyBox(),
  children,
  gap,
  collapse: false,
  ...extra,
});

describe("gap-to-padding", () => {
  test("two px cols: the gutter is split between them, px sums to content, pct to 100", () => {
    const out = run(
      row([col({ px: 290 }, { px: 290, pct: 48.33 }), col({ px: 290 }, { px: 290, pct: 48.33 })], 20, 600),
    ) as RowNode;
    expect(out.gap).toBe(0);
    expect(out.cols[0]!.resolved).toEqual({ px: 300, pct: 50 });
    expect(out.cols[1]!.resolved).toEqual({ px: 300, pct: 50 });
    expect(out.cols[0]!.padding).toEqual(sides(0, 10, 0, 0));
    expect(out.cols[1]!.padding).toEqual(sides(0, 0, 0, 10));
    expect(out.cols.reduce((s, c) => s + c.resolved!.px, 0)).toBe(600);
    expect(out.cols.reduce((s, c) => s + c.resolved!.pct, 0)).toBeCloseTo(100, 1);
  });

  test("row padding is subtracted from row content", () => {
    const out = run(
      row([col({ px: 290 }, { px: 290, pct: 0 }), col({ px: 290 }, { px: 290, pct: 0 })], 20, 620, {
        padding: sides(0, 10),
      }),
    ) as RowNode;
    expect(out.cols[1]!.resolved).toEqual({ px: 300, pct: 50 });
  });

  test("three px cols with gap sum back to row content", () => {
    const out = run(
      row([0, 1, 2].map(() => col({ px: 160 }, { px: 160, pct: 0 })), 10, 500),
    ) as RowNode;
    const px = out.cols.map((c) => c.resolved!.px);
    expect(px).toEqual([165, 170, 165]);
    expect(px.reduce((a, b) => a + b)).toBe(500);
    expect(out.cols.map((c) => c.resolved!.pct)).toEqual([33, 34, 33]);
  });

  test("grow cols", () => {
    const out = run(
      row([col({ grow: 1 }, { px: 290, pct: 0 }), col({ grow: 1 }, { px: 290, pct: 0 })], 20, 600),
    ) as RowNode;
    expect(out.cols[1]!.resolved!.px).toBe(300);
    expect(out.cols[0]!.resolved!.pct + out.cols[1]!.resolved!.pct).toBeCloseTo(100, 1);
  });

  test("three equal grow cols carry equal padding, so they stay equal when the % scales", () => {
    const out = run(
      row([1, 2, 3].map(() => col({ grow: 1 }, { px: 181, pct: 0 })), 18, 580),
    ) as RowNode;
    expect(out.cols.map((c) => [c.padding!.left, c.padding!.right])).toEqual([[0, 12], [6, 6], [12, 0]]);
    expect(out.cols.map((c) => c.resolved!.pct)).toEqual([33.33, 33.33, 33.33]);
  });

  test("uneven grows get padding in proportion; too uneven falls back to split gutters", () => {
    const even = run(row([col({ grow: 1 }, { px: 135, pct: 0 }), col({ grow: 2 }, { px: 270, pct: 0 }), col({ grow: 1 }, { px: 135, pct: 0 })], 20, 580)) as RowNode;
    expect(even.cols.map((c) => c.padding!.left + c.padding!.right)).toEqual([10, 20, 10]);
    expect(even.cols.map((c) => c.resolved!.pct)).toEqual([25, 50, 25]);
    const skewed = run(row([col({ grow: 4 }, { px: 400, pct: 0 }), col({ grow: 1 }, { px: 100, pct: 0 }), col({ grow: 1 }, { px: 100, pct: 0 })], 20, 640)) as RowNode;
    expect(skewed.cols.map((c) => [c.padding!.left, c.padding!.right])).toEqual([[0, 10], [10, 10], [10, 0]]);
  });

  test("painted stretched cards keep the plain split (their gutters become spacer cells)", () => {
    const card: Node = { kind: "stack", box: { ...emptyBox(), background: "#fff" }, children: [img], gap: 0, collapse: false };
    const out = run(row([1, 2, 3].map(() => col({ grow: 1 }, { px: 181, pct: 0 }, { stretch: true, child: card })), 18, 580)) as RowNode;
    expect(out.cols.map((c) => [c.padding!.left, c.padding!.right])).toEqual([[0, 9], [9, 9], [9, 0]]);
    const bare = run(row([1, 2, 3].map(() => col({ grow: 1 }, { px: 181, pct: 0 }, { stretch: true })), 18, 580)) as RowNode;
    expect(bare.cols.map((c) => [c.padding!.left, c.padding!.right])).toEqual([[0, 12], [6, 6], [12, 0]]);
  });

  test("border is subtracted from row content", () => {
    const b = { width: 2, style: "solid" as const, color: "#000" };
    const out = run(
      row([col({ px: 100 }, { px: 100, pct: 0 }), col({ px: 100 }, { px: 100, pct: 0 })], 10, 214, {
        border: { left: b, right: b },
      }),
    ) as RowNode;
    expect(out.cols[1]!.resolved).toEqual({ px: 105, pct: 50 });
  });

  test("auto col gets padding only; existing padding is added to", () => {
    const out = run(
      row(
        [
          col({ px: 100 }, { px: 100, pct: 100 }),
          col({ auto: true }),
          col({ px: 50 }, { px: 50, pct: 0 }, { padding: sides(1, 2, 3, 4) }),
        ],
        8,
        300,
      ),
    ) as RowNode;
    expect(out.cols[1]!.padding).toEqual(sides(0, 4, 0, 4));
    expect(out.cols[1]!.resolved).toBeUndefined();
    expect(out.cols[2]!.padding).toEqual(sides(1, 2, 3, 8));
    expect(out.cols[2]!.resolved!.px).toBe(54);
  });

  test("missing resolvedWidth: pct from px sum", () => {
    const out = run(row([col({ px: 100 }, { px: 100, pct: 0 }), col({ px: 100 }, { px: 100, pct: 0 })], 20)) as RowNode;
    expect(out.cols.map((c) => c.resolved!.pct)).toEqual([50, 50]);
  });

  test("nested rows; column child untouched apart from its own lowering", () => {
    const inner = row([col({ px: 10 }, { px: 10, pct: 0 }), col({ px: 10 }, { px: 10, pct: 0 })], 5, 20);
    const out = run(
      stack([row([col({ px: 20 }, { px: 20, pct: 100 }, { child: inner })], 0, 20)], 0),
    ) as StackNode;
    const c = (out.children[0] as RowNode).cols[0]!;
    expect((c.child as RowNode).gap).toBe(0);
    expect((c.child as RowNode).cols.map((x) => x.resolved!.px)).toEqual([12, 13]);
    expect(c.resolved).toEqual({ px: 20, pct: 100 });
  });

  test("stack gap wraps children after the first", () => {
    const loc = { line: 3, col: 1 };
    const kid: Node = { ...img, loc };
    const out = run(
      stack([img, kid, img], 12, {
        resolvedWidth: 300,
        box: {
          ...emptyBox(),
          padding: sides(0, 10),
          border: { left: { width: 1, style: "solid", color: "#000" } },
        },
      }),
    ) as StackNode;
    expect(out.gap).toBe(0);
    expect(out.children[0]).toBe(img);
    const w = out.children[1] as StackNode;
    expect(w).toMatchObject({ kind: "stack", gap: 0, collapse: false, resolvedWidth: 279, loc, children: [kid] });
    expect(w.box.padding).toEqual(sides(12, 0, 0, 0));
    expect(out.children).toHaveLength(3);
  });

  test("stack without resolvedWidth leaves wrapper without it", () => {
    const w = (run(stack([img, img], 4)) as StackNode).children[1] as StackNode;
    expect("resolvedWidth" in w).toBe(false);
  });

  test("gap 0 is identity; input not mutated; post-condition", () => {
    const flat = stack([row([col({ px: 1 }, { px: 1, pct: 100 })], 0, 1)], 0);
    expect(run(flat)).toEqual(flat);
    const tree = stack(
      [img, row([col({ px: 5 }, { px: 5, pct: 0 }), col({ px: 5 }, { px: 5, pct: 0 })], 3, 13)],
      7,
    );
    const snap = structuredClone(tree);
    const out = run(tree);
    expect(tree).toEqual(snap);
    const zero = (n: Node): boolean => {
      let ok = (n.kind !== "row" && n.kind !== "stack") || n.gap === 0;
      mapChildren(n, (c) => {
        ok = ok && zero(c);
        return c;
      });
      return ok;
    };
    expect(zero(out)).toBe(true);
  });

  describe("wrapping rows", () => {
    const wrapRow = (cols: Column[], gap: number, resolvedWidth: number, box: Partial<Box> = {}): RowNode => ({
      ...row(cols, gap, resolvedWidth, box),
      wrap: true,
    });

    test("half the gutter on both sides of every column, edge halves come off the row padding", () => {
      const out = run(
        wrapRow([0, 1, 2].map(() => col({ px: 200 }, { px: 200, pct: 33 })), 12, 600, { padding: sides(12) }),
      ) as RowNode;
      expect(out.gap).toBe(0);
      for (const c of out.cols) {
        expect(c.padding).toEqual(sides(0, 6, 0, 6));
        expect(c.resolved?.px).toBe(212);
      }
      expect(out.box.padding).toEqual(sides(12, 6, 12, 6));
    });

    test("padding smaller than half a gap bottoms out at 0; auto columns get padding only", () => {
      const out = run(wrapRow([col({ auto: true }), col({ px: 100 }, { px: 100, pct: 0 }, { padding: sides(0, 0, 8, 0) })], 10, 300, { padding: sides(0, 2, 0, 0) })) as RowNode;
      expect(out.box.padding).toEqual(sides(0, 0, 0, 0));
      expect(out.cols[0]!.padding).toEqual(sides(0, 5, 0, 5));
      expect(out.cols[0]!.resolved).toBeUndefined();
      expect(out.cols[1]!.padding).toEqual(sides(0, 5, 8, 5));
    });

    test("what the row padding can't give back comes out of a line's edge columns", () => {
      const out = run(wrapRow([0, 1].map(() => col({ px: 292 }, { px: 292, pct: 0 })), 16, 600)) as RowNode;
      expect(out.cols.map((c) => c.resolved?.px)).toEqual([300, 300]); // 8px off the left edge, 8px off the right
      // a full 592px line (600 minus 4px padding each side) still fills exactly 600 once the padding is spent
      const full = run(wrapRow([col({ px: 592 }, { px: 592, pct: 100 })], 20, 600, { padding: sides(0, 4, 0, 4) })) as RowNode;
      expect(full.cols[0]!.resolved?.px).toBe(600);
      expect(full.box.padding).toEqual(sides(0, 0, 0, 0));
    });

    test("an auto end column passes the edge shortfall to the nearest sized column", () => {
      const out = run(wrapRow([col({ auto: true }), col({ px: 300 }, { px: 300, pct: 50 }), col({ px: 200 }, { px: 200, pct: 33 })], 16, 600)) as RowNode;
      expect(out.cols.map((c) => c.resolved?.px)).toEqual([undefined, 308, 208]);
    });

    test("a capped share column keeps its pre-cap share plus gutters over the row's inner width", () => {
      // calc(50% - 10px) = 280 of 580, capped to 200; padding 10 is spent on the half gaps, so inner = 600
      const out = run(wrapRow([col({ calc: { pct: 50, px: -10 } }, { px: 200, pct: (280 / 580) * 100 })], 20, 600, { padding: sides(0, 10, 0, 10) })) as RowNode;
      expect(out.cols[0]!.resolved).toEqual({ px: 220, pct: 50 });
    });

    test("a filled line pays the left shortfall on its first column and the right one on its last", () => {
      const out = run(wrapRow([0, 1].map(() => col({ px: 290 }, { px: 290, pct: 0 })), 16, 600, { padding: sides(0, 4, 0, 0) })) as RowNode;
      expect(out.cols.map((c) => c.resolved!.px)).toEqual([298, 302]);
    });

    test("a lone column overflowing on both sides pays exactly shortL + shortR", () => {
      // padding 2 left / 6 right, gap 20: shortL 8, shortR 4; the 596px column is alone on its line
      const out = run(wrapRow([col({ px: 592 }, { px: 592, pct: 100 })], 20, 600, { padding: sides(0, 6, 0, 2) })) as RowNode;
      expect(out.cols[0]!.resolved?.px).toBe(592 + 20 - 12);
    });

    test("lines that fit keep full widths, so the browser's line breaks survive", () => {
      // 296 + 20 + 296 > 600: two lines. Shrinking each by the 20px shortfall would put them on one.
      const out = run(wrapRow([0, 1].map(() => col({ px: 296 }, { px: 296, pct: 0 })), 20, 600)) as RowNode;
      expect(out.cols.map((c) => c.resolved?.px)).toEqual([316, 316]);
    });

    test("a row with an auto column takes the whole edge shortfall from its sized ends", () => {
      // the table measures the auto column, so the emitter keeps the row on one line: 300 | auto | 200, gap 16, no padding
      const out = run(wrapRow([col({ px: 300 }, { px: 300, pct: 50 }), col({ auto: true }), col({ px: 200 }, { px: 200, pct: 33 })], 16, 600)) as RowNode;
      expect(out.cols.map((c) => c.resolved?.px)).toEqual([308, undefined, 208]);
    });

    test("an odd gap splits into halves", () => {
      const out = run(wrapRow([col({ px: 100 }, { px: 100, pct: 0 })], 5, 300)) as RowNode;
      expect(out.cols[0]!.padding).toEqual(sides(0, 2.5, 0, 2.5));
    });
  });
});

describe("wrapping rows of shares", () => {
  const share = (pct: number, px: number): Column => ({ width: { pct }, valign: "top", child: { kind: "raw", html: "" }, resolved: { px, pct } });
  const shareRow = (cols: Column[], gap: number): RowNode => ({ kind: "row", box: emptyBox(), gap, wrap: true, cols, resolvedWidth: 600 });

  test("gutters sit between columns, none at the line ends, so the shares stay exact", () => {
    const ctx = testCtx();
    const out = gapToPadding.run(givenResolved(shareRow([share(48.33, 290), share(48.33, 290)], 20)), ctx) as RowNode;
    expect(out.cols.map((c) => [c.padding?.left, c.padding?.right, c.resolved?.px])).toEqual([[0, 10, 300], [10, 0, 300]]);
    expect(ctx.diagnostics.list()).toEqual([]);
  });

  test("a break the line's own width can't force falls back to edge gutters and says so", () => {
    const ctx = testCtx();
    const out = gapToPadding.run(givenResolved(shareRow([share(49, 294), share(49, 294)], 20)), ctx) as RowNode;
    expect(out.cols[0]?.padding?.left).toBe(10);
    expect(ctx.diagnostics.list().map((d) => d.code)).toEqual(["W003"]);
  });
});

describe("negative gaps", () => {
  test("are no gap: nothing is padded and the tree is emit-ready", () => {
    const s = run(stack([img, img], -4)) as StackNode;
    expect(s.gap).toBe(0);
    expect(s.children).toEqual([img, img]);
    const r = run(row([col({ px: 100 }, { px: 100, pct: 50 }), col({ px: 100 }, { px: 100, pct: 50 })], -6, 200)) as RowNode;
    expect(r.gap).toBe(0);
    expect(r.cols.map((c) => c.padding)).toEqual([undefined, undefined]);
  });

  test("compiled, the declaration is dropped with a W002 instead of a crash", async () => {
    const { compile } = await import("../../../src/index.ts");
    const out = compile('<div style="display:flex;flex-direction:column;gap:-4px"><p>a</p><p>b</p></div><div style="display:flex;column-gap:calc(10px - 20px)"><p>a</p><p>b</p></div>', { lang: "en" });
    expect(out.diagnostics.map((d) => d.code)).toEqual(["W002", "W002"]);
    expect(out.html).not.toMatch(/padding:[^;"]*-\d/);
  });
});

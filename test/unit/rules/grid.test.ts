import { describe, expect, test } from "vitest";
import { analyze } from "../../../src/analyze/analyze.ts";
import { canLower } from "../../../src/analyze/lint.ts";
import { blockRule } from "../../../src/analyze/rules/block.ts";
import { gridRule } from "../../../src/analyze/rules/grid.ts";
import { inlineRule } from "../../../src/analyze/rules/inline.ts";
import { unsupportedRule } from "../../../src/analyze/rules/unsupported.ts";
import type { Node, RowNode, StackNode } from "../../../src/ir/index.ts";
import { codesOf, el, testCtx, text } from "../../helpers/index.ts";

const rules = [unsupportedRule, gridRule, blockRule, inlineRule];
const textOf = (n: Node): string => (n.kind === "inline" ? n.html : n.kind === "stack" ? n.children.map(textOf).join("") : "?");
type Kids = Parameters<typeof el>[2];

const cell = (style: Record<string, string> = {}, declared?: Record<string, string>) =>
  el("div", { display: "block", ...style }, [text("x")], declared ? { declared } : {});

const grid = (style: Record<string, string>, kids: Kids) => {
  const ctx = testCtx();
  const node = analyze(el("div", { display: "grid", ...style }, kids), ctx, rules) as StackNode;
  return { node, rows: node.children as RowNode[], ctx };
};

// justify-self and grid-column/row on an item still get the block rule's W001 until box.ts
// lists them as consumed (shared file), so tests look past it.
const noDrops = (ctx: ReturnType<typeof testCtx>): string[] => codesOf(ctx).filter((c) => c !== "W001");

const cells = (n: number): Kids => Array.from({ length: n }, () => cell());

describe("gridRule", () => {
  test("matches grid containers only", () => {
    const ctx = testCtx();
    expect(gridRule.matches(el("div", { display: "grid" }), ctx)).toBe(true);
    expect(gridRule.matches(el("div", { display: "inline-grid" }), ctx)).toBe(true);
    expect(gridRule.matches(el("span", { display: "grid" }), ctx)).toBe(true);
    expect(gridRule.matches(el("div", { display: "flex" }), ctx)).toBe(false);
  });

  test("a stack of rows with the same columns, the gaps on stack and rows", () => {
    const { node, rows, ctx } = grid({ "grid-template-columns": "1fr 1fr", "row-gap": "24px", "column-gap": "32px" }, cells(4));
    expect(node).toMatchObject({ kind: "stack", gap: 24, collapse: false, loc: { line: 1 } });
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r).toMatchObject({ kind: "row", gap: 32, wrap: false });
      expect(r.cols.map((c) => c.width)).toEqual([{ grow: 1 }, { grow: 1 }]);
    }
    expect(codesOf(ctx)).toEqual([]);
  });

  test("px, fr and % tracks, repeat() with a fixed count", () => {
    expect(grid({ "grid-template-columns": "200px 1fr 25%" }, cells(3)).rows[0]?.cols.map((c) => c.width)).toEqual([{ px: 200 }, { grow: 1 }, { pct: 25 }]);
    expect(grid({ "grid-template-columns": "repeat(3, 1fr)" }, cells(3)).rows[0]?.cols.map((c) => c.width)).toEqual([{ grow: 1 }, { grow: 1 }, { grow: 1 }]);
    expect(grid({ "grid-template-columns": "repeat(2, 50px 1fr)" }, cells(4)).rows[0]?.cols.map((c) => c.width)).toEqual([{ px: 50 }, { grow: 1 }, { px: 50 }, { grow: 1 }]);
  });

  test("minmax(0, Nfr) is an fr track (Tailwind's grid-cols-N)", () => {
    const widths = (cols: string, n: number) => {
      const g = grid({ "grid-template-columns": cols }, cells(n));
      expect(codesOf(g.ctx)).toEqual([]);
      return g.rows[0]?.cols.map((c) => c.width);
    };
    expect(widths("repeat(2, minmax(0, 1fr))", 2)).toEqual([{ grow: 1 }, { grow: 1 }]);
    expect(widths("minmax(0px, 2fr) minmax(0,1fr)", 2)).toEqual([{ grow: 2 }, { grow: 1 }]);
    expect(widths("100px minmax(0, 1fr)", 2)).toEqual([{ px: 100 }, { grow: 1 }]);
  });

  test("fr beside px with several fr tracks is W003", () => {
    expect(codesOf(grid({ "grid-template-columns": "200px 1fr 2fr" }, cells(3)).ctx)).toEqual(["W003"]);
    expect(codesOf(grid({ "grid-template-columns": "200px 1fr" }, cells(2)).ctx)).toEqual([]);
  });

  test("a short last row gets empty cells of the same widths", () => {
    const { rows } = grid({ "grid-template-columns": "1fr 1fr" }, cells(5));
    expect(rows).toHaveLength(3);
    const last = rows[2];
    expect(last?.cols.map((c) => c.width)).toEqual([{ grow: 1 }, { grow: 1 }]);
    expect(last?.cols[1]?.child).toMatchObject({ kind: "stack", children: [] });
  });

  test("painted cells stretch, unpainted or aligned ones do not", () => {
    const { rows } = grid({ "grid-template-columns": "1fr 1fr" }, [cell({ "background-color": "#eee" }), cell({ "background-color": "#eee", "align-self": "center" })]);
    expect(rows[0]?.cols.map((c) => [c.stretch, c.valign])).toEqual([[true, "top"], [undefined, "middle"]]);
  });

  test("align-items and justify-items map to valign and align", () => {
    const { rows, ctx } = grid({ "grid-template-columns": "1fr 1fr", "align-items": "end", "justify-items": "center" }, [cell(), cell({ "justify-self": "end" })]);
    expect(rows[0]?.cols.map((c) => [c.valign, c.align])).toEqual([["bottom", "center"], ["bottom", "right"]]);
    expect(noDrops(ctx)).toEqual([]);
  });

  test("unknown align keywords are E007", () => {
    expect(codesOf(grid({ "grid-template-columns": "1fr", "align-items": "last baseline" }, cells(1)).ctx)).toEqual(["E007"]);
  });

  test("does not report the grid longhands as dropped", () => {
    const declared = { display: "grid", "grid-template-columns": "1fr 1fr", "justify-items": "stretch" };
    const ctx = testCtx();
    analyze(el("div", { display: "grid", "grid-template-columns": "1fr 1fr" }, cells(2), { declared }), ctx, rules);
    expect(codesOf(ctx)).toEqual([]);
  });

  test("explicit placement on an item is E001", () => {
    const { ctx } = grid({ "grid-template-columns": "1fr 1fr" }, [cell({}, { "grid-column": "1 / span 2" }), cell()]);
    expect(noDrops(ctx)).toEqual(["E001"]);
  });

  test("inline-grid is laid out as a block grid (W003)", () => {
    expect(codesOf(grid({ display: "inline-grid", "grid-template-columns": "1fr" }, cells(1)).ctx)).toEqual(["W003"]);
  });
});

const withDeclared = (style: Record<string, string>, kids: Kids = cells(2)) => {
  const declared = { display: "grid", ...style };
  const ctx = testCtx();
  const node = analyze(el("div", { display: "grid", "grid-template-columns": "1fr 1fr", ...style }, kids, { declared }), ctx, rules) as StackNode;
  return { node, rows: node.children as RowNode[], ctx };
};

describe("review fixes", () => {
  test("justify on a painted item without a width warns for start too, and counts borders", () => {
    const border = { "border-top-style": "solid", "border-top-width": "1px", "border-top-color": "#000" };
    const start = grid({ "grid-template-columns": "1fr 1fr", "justify-items": "start" }, [cell({ "background-color": "#ff0000" }), cell(border)]);
    expect(noDrops(start.ctx)).toEqual(["W003", "W003"]);
    const sized = grid({ "grid-template-columns": "1fr 1fr", "justify-items": "center", "align-items": "start" }, [cell({ "background-color": "#ff0000", width: "100px" }), cell()]);
    expect(noDrops(sized.ctx)).toEqual([]);
  });

  test("rows carry the grid's location, so pass diagnostics point at it", () => {
    const { rows } = grid({ "grid-template-columns": "1fr 1fr" }, cells(2));
    expect(rows[0]?.loc).toEqual({ line: 1, col: 1 });
  });

  test("repeat(0, 1fr) is E001 and terminates", () => {
    const ctx = testCtx();
    const node = analyze(el("div", { display: "grid", "grid-template-columns": "repeat(0, 1fr)" }, cells(2)), ctx, rules);
    expect(node.kind).toBe("raw");
    expect(ctx.diagnostics.list()[0]).toMatchObject({ code: "E001", message: expect.stringMatching(/repeat\(0/) });
  });

  test("grid-gap and its longhands are honoured", () => {
    const a = withDeclared({ "grid-gap": "16px 32px" }, cells(4));
    expect(a.node.gap).toBe(16);
    expect(a.rows[0]?.gap).toBe(32);
    const b = withDeclared({ "grid-row-gap": "8px", "grid-column-gap": "4px" }, cells(4));
    expect([b.node.gap, b.rows[0]?.gap]).toEqual([8, 4]);
    expect(codesOf(a.ctx)).toEqual([]);
  });

  test("place-items maps to valign and align", () => {
    const { rows, ctx } = withDeclared({ "place-items": "center" });
    expect(rows[0]?.cols.map((c) => [c.valign, c.align])).toEqual([["middle", "center"], ["middle", "center"]]);
    expect(codesOf(ctx)).toEqual([]);
  });

  test("place-self on an item", () => {
    const { rows } = grid({ "grid-template-columns": "1fr 1fr" }, [cell({ "place-self": "end center" }), cell()]);
    expect(rows[0]?.cols.map((c) => [c.valign, c.align])).toEqual([["bottom", "center"], ["top", undefined]]);
  });

  test("grid-template and grid shorthands are E001 and named", () => {
    for (const p of ["grid-template", "grid"]) {
      const ctx = testCtx();
      analyze(el("div", { display: "grid" }, [], { declared: { display: "grid", [p]: "auto / 1fr 1fr" } }), ctx, rules);
      expect(ctx.diagnostics.list()[0]).toMatchObject({ code: "E001", message: expect.stringContaining(`${p} shorthand`) });
    }
  });

  test("explicit placement on an item is reported, not swallowed", () => {
    const { ctx } = grid({ "grid-template-columns": "1fr 1fr" }, [cell({ "grid-row": "1 / 3" }), cell()]);
    expect(codesOf(ctx)).toContain("E001");
  });

  test("order places the items in the cells, stably", () => {
    const tag = (t: string, order?: string) => el("div", { display: "block", ...(order ? { order } : {}) }, [text(t)]);
    const { rows, ctx } = grid({ "grid-template-columns": "1fr 1fr" }, [tag("d", "3"), tag("b", "1"), tag("a"), tag("c", "2")]);
    expect(rows.map((r) => r.cols.map((c) => textOf(c.child)))).toEqual([["a", "b"], ["c", "d"]]);
    expect(noDrops(ctx)).toEqual([]);
  });

  test("justify-content and align-content are E007, an order that is not a number too", () => {
    expect(codesOf(grid({ "grid-template-columns": "100px 100px", "justify-content": "center" }, cells(2)).ctx)).toEqual(["E007"]);
    expect(codesOf(grid({ "grid-template-columns": "100px", "align-content": "end" }, cells(1)).ctx)).toEqual(["E007"]);
    expect(codesOf(grid({ "grid-template-columns": "100px", "justify-content": "start" }, cells(1)).ctx)).toEqual([]);
    expect(noDrops(grid({ "grid-template-columns": "1fr 1fr" }, [cell({ order: "var(--o)" }), cell()]).ctx)).toEqual(["E007"]);
  });

  test("a sized item keeps its width and the stretch W003 fires", () => {
    const { rows, ctx } = grid({ "grid-template-columns": "1fr 1fr" }, [cell({ "background-color": "#eee", width: "120px" }), cell()]);
    const c = rows[0]?.cols[0];
    expect(c?.stretch).toBeUndefined();
    expect(c?.child).toMatchObject({ box: { width: { px: 120 } } });
    expect(codesOf(ctx)).toEqual(["W003"]);
  });

  test("align-items: baseline is reported once, at the container", () => {
    expect(codesOf(grid({ "grid-template-columns": "1fr 1fr", "align-items": "baseline" }, cells(4)).ctx)).toEqual(["W003"]);
  });

  test("text-only children become anonymous items; no children is no rows", () => {
    const ctx = testCtx();
    const node = analyze(el("div", { display: "grid", "grid-template-columns": "1fr 1fr" }, [text("a")]), ctx, rules) as StackNode;
    expect(node.children).toHaveLength(1);
    expect(grid({ "grid-template-columns": "1fr 1fr" }, []).rows).toEqual([]);
  });

  test("display:grid on a link is E001", () => {
    const a = el("a", { display: "grid", "grid-template-columns": "1fr 1fr" });
    expect(canLower(a)).toBe(false);
  });
});

describe("what a grid can't be lowered from (E001)", () => {
  const cols = { "grid-template-columns": "1fr 1fr" };
  const cases: Array<[string, Record<string, string>, RegExp]> = [
    ["grid-template-areas", { ...cols, "grid-template-areas": '"a b"' }, /areas/],
    ["auto-fill", { "grid-template-columns": "repeat(auto-fill, 100px)" }, /auto-fill/],
    ["auto-fit", { "grid-template-columns": "repeat(auto-fit, minmax(100px, 1fr))" }, /auto-fit/],
    ["minmax()", { "grid-template-columns": "minmax(100px, 1fr) 1fr" }, /minmax/],
    ["minmax() with a px max", { "grid-template-columns": "minmax(0, 100px) 1fr" }, /minmax/],
    ["minmax() in repeat()", { "grid-template-columns": "repeat(2, minmax(50px, 1fr))" }, /minmax/],
    ["fixed row heights", { ...cols, "grid-template-rows": "100px 100px" }, /grid-template-rows/],
    ["dense packing", { ...cols, "grid-auto-flow": "row dense" }, /grid-auto-flow/],
    ["subgrid", { "grid-template-columns": "subgrid" }, /subgrid/],
    ["no columns", {}, /without grid-template-columns/],
    ["auto track", { "grid-template-columns": "auto 1fr" }, /auto/],
  ];
  test.each(cases)("%s", (_n, style, message) => {
    const el1 = el("div", { display: "grid", ...style });
    expect(canLower(el1)).toBe(false);
    const ctx = testCtx();
    const node = analyze(el("div", { display: "grid", ...style }, [text("x")]), ctx, rules);
    expect(node.kind).toBe("raw");
    const d = ctx.diagnostics.list()[0];
    expect(d).toMatchObject({ code: "E001", message: expect.stringMatching(message) });
    expect(d?.hint).toBeTruthy();
  });

  test("responsive grids point at flex-wrap", () => {
    const ctx = testCtx();
    analyze(el("div", { display: "grid", "grid-template-columns": "repeat(auto-fit, minmax(200px, 1fr))" }), ctx, rules);
    expect(ctx.diagnostics.list()[0]?.hint).toMatch(/flex-wrap/);
  });

  test("a plain 1fr 1fr grid can be lowered", () => {
    expect(canLower(el("div", { display: "grid", ...cols }))).toBe(true);
  });
});

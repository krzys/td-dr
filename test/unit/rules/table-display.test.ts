import { describe, expect, test } from "vitest";
import { analyze } from "../../../src/analyze/analyze.ts";
import { canLower, lintElement } from "../../../src/analyze/lint.ts";
import { blockRule } from "../../../src/analyze/rules/block.ts";
import { inlineRule } from "../../../src/analyze/rules/inline.ts";
import { tableDisplayRule } from "../../../src/analyze/rules/table-display.ts";
import { unsupportedRule } from "../../../src/analyze/rules/unsupported.ts";
import type { Node, RowNode, StackNode } from "../../../src/ir/index.ts";
import { codesOf, el, testCtx, text } from "../../helpers/index.ts";

const rules = [unsupportedRule, tableDisplayRule, blockRule, inlineRule];
type Kids = Parameters<typeof el>[2];

const part = (display: string, style: Record<string, string> = {}, kids: Kids = [text("x")], attrs: Record<string, string> = {}) =>
  el("div", { display, ...style }, kids, { attrs });
const cell = (style: Record<string, string> = {}, kids: Kids = [text("x")]) => part("table-cell", { "padding-top": "4px", ...style }, kids);
const tr = (...cells: Array<ReturnType<typeof el>>) => el("div", { display: "table-row" }, cells);

const table = (style: Record<string, string>, kids: Kids) => {
  const ctx = testCtx();
  const node = analyze(el("div", { display: "table", ...style }, kids, { line: 3 }), ctx, rules);
  return { node, ctx };
};
const textOf = (n: Node): string => (n.kind === "inline" ? n.html : n.kind === "stack" ? n.children.map(textOf).join("") : "?");

describe("tableDisplayRule", () => {
  test("matches display: table on a div, not a real table or a link", () => {
    const ctx = testCtx();
    expect(tableDisplayRule.matches(el("div", { display: "table" }), ctx)).toBe(true);
    expect(tableDisplayRule.matches(el("table", { display: "table" }), ctx)).toBe(false);
    expect(tableDisplayRule.matches(el("a", { display: "table" }), ctx)).toBe(false);
    expect(tableDisplayRule.matches(el("div", { display: "table-cell" }), ctx)).toBe(false);
  });

  test("cells become columns: auto without a table width, equal with one", () => {
    const loose = table({}, [cell(), cell()]).node as RowNode;
    expect(loose).toMatchObject({ kind: "row", loc: { line: 3 } });
    expect(loose.cols.map((c) => c.width)).toEqual([{ auto: true }, { auto: true }]);
    const full = table({ width: "100%" }, [cell(), cell()]).node as RowNode;
    expect(full.cols.map((c) => c.width)).toEqual([{ grow: 1 }, { grow: 1 }]);
  });

  test("cell width px (outer) and % go to the column; vertical-align to valign", () => {
    const { node, ctx } = table({ width: "100%" }, [
      cell({ width: "100px", "padding-left": "10px", "vertical-align": "middle" }),
      cell({ width: "25%", "box-sizing": "border-box", "vertical-align": "bottom" }),
      cell({ "vertical-align": "baseline" }),
    ]);
    const row = node as RowNode;
    expect(row.cols.map((c) => c.width)).toEqual([{ px: 110 }, { pct: 25 }, { grow: 1 }]);
    expect(row.cols.map((c) => c.valign)).toEqual(["middle", "bottom", "top"]);
    expect(row.cols.every((c) => c.child.kind === "stack" && !c.child.box.width)).toBe(true);
    expect(codesOf(ctx)).toEqual([]);
  });

  test("border-spacing is the gap, and separated borders keep it around the edge", () => {
    const { node } = table({ "border-spacing": "8px 3px" }, [cell(), cell()]);
    const row = node as RowNode;
    expect(row.gap).toBe(8);
    expect(row.box.padding).toMatchObject({ left: 8, right: 8, top: 3, bottom: 3 });
    const collapsed = table({ "border-spacing": "8px", "border-collapse": "collapse" }, [cell(), cell()]).node as RowNode;
    expect(collapsed.gap).toBe(0);
    expect(collapsed.box.padding.left).toBe(0);
  });

  test("border-spacing in em is E006", () => {
    expect(codesOf(table({ "border-spacing": "1em" }, [cell()]).ctx)).toEqual(["E006"]);
  });

  test("rows become a stack of rows that share the first width of each column", () => {
    const { node } = table({ "border-spacing": "0 6px" }, [
      tr(cell({ width: "80px", "box-sizing": "border-box" }), cell()),
      tr(cell(), cell({ "vertical-align": "middle" })),
    ]);
    const stack = node as StackNode;
    expect(stack).toMatchObject({ kind: "stack", gap: 6, collapse: false });
    const rows = stack.children as RowNode[];
    expect(rows.map((r) => r.cols.map((c) => c.width))).toEqual(Array(2).fill([{ px: 80 }, { auto: true }]));
    expect(rows[1]!.cols[1]!.valign).toBe("middle");
  });

  test("a short row is padded with empty cells", () => {
    const rows = (table({}, [tr(cell(), cell()), tr(cell())]).node as StackNode).children as RowNode[];
    expect(rows[1]!.cols).toHaveLength(2);
    expect(rows[1]!.cols[1]!.child).toMatchObject({ kind: "stack", children: [] });
  });

  test("a single row is the row itself", () => {
    expect(table({}, [tr(cell(), cell())]).node.kind).toBe("row");
  });

  test("block children make a plain stack; a centered one without a width is a placed one-column row", () => {
    const plain = table({}, [part("block", {}, [text("hi")])]).node as StackNode;
    expect(plain.kind).toBe("stack");
    const centered = table({ "margin-left": "auto", "margin-right": "auto" }, [part("block", {}, [text("hi")])]).node as RowNode;
    expect(centered).toMatchObject({ kind: "row", box: { align: "center" }, cols: [{ width: { auto: true } }] });
    expect(textOf(centered.cols[0]!.child)).toBe("hi");
    const sized = table({ "margin-left": "auto", "margin-right": "auto", width: "300px" }, [part("block", {}, [text("hi")])]).node as StackNode;
    expect(sized).toMatchObject({ kind: "stack", box: { align: "center", width: { px: 300 } } });
  });

  test("table-layout and vertical-align on the table are not reported as dropped", () => {
    const { ctx } = table({ "table-layout": "fixed", width: "100%" }, [cell(), cell()]);
    expect(codesOf(ctx)).toEqual([]);
  });

  test("a painted auto-width table shrinks to its content: the paint sits on a stack in a one-column row", () => {
    for (const [style, align] of [[{}, "left"], [{ "margin-left": "auto", "margin-right": "auto" }, "center"]] as const) {
      const { node, ctx } = table({ "background-color": "#eee", ...style }, [cell(), cell()]);
      const outer = node as RowNode;
      expect(outer.box.align).toBe(align);
      expect(outer.cols).toHaveLength(1);
      const stack = outer.cols[0]!.child as StackNode;
      expect(stack.box.background).toBeTruthy();
      expect(stack.box.align).toBeUndefined();
      expect(stack.children[0]).toMatchObject({ kind: "row" });
      expect(codesOf(ctx)).toEqual([]);
    }
    const full = table({ "background-color": "#eee", width: "100%" }, [cell(), cell()]).node as RowNode;
    expect(full.cols).toHaveLength(2);
  });

  test("a painted block-mode table without a width shrinks the same way", () => {
    const outer = table({ "background-color": "#eee" }, [part("block")]).node as RowNode;
    expect(outer).toMatchObject({ kind: "row", box: { align: "left" } });
    expect((outer.cols[0]!.child as StackNode).box.background).toBeTruthy();
  });

  test("border-spacing does not widen a px table: the spacing goes inside the width", () => {
    const row = table({ width: "600px", "border-spacing": "10px" }, [cell(), cell()]).node as RowNode;
    expect(row.box.width).toEqual({ px: 600 });
    expect(row.box.padding).toMatchObject({ left: 10, right: 10 });
  });

  test("template attributes on a row or a cell are E012", () => {
    for (const attrs of [{ "data-email-if": "x" }, { "data-email-each": "xs" }]) {
      const row = part("table-row", {}, [cell()], attrs);
      expect(codesOf(table({}, [row]).ctx)).toEqual(["E012"]);
      expect(codesOf(table({}, [part("table-cell", {}, [text("x")], attrs), cell()]).ctx)).toEqual(["E012"]);
    }
  });

  test("an outlook-only cell is E001, not a column", () => {
    const { node, ctx } = table({}, [cell(), part("table-cell", {}, [text("x")], { "data-email": "outlook-only" })]);
    expect(codesOf(ctx)).toEqual(["E001"]);
    expect((node as RowNode).cols).toHaveLength(1);
  });

  test("a comment between cells and an rtl table are W001", () => {
    const comment = { type: "comment", data: "[if mso]" } as const;
    expect(codesOf(table({}, [cell(), comment, cell()]).ctx)).toEqual(["W001"]);
    expect(codesOf(table({ direction: "rtl" }, [cell(), cell()]).ctx)).toEqual(["W001"]);
  });

  test("an unknown vertical-align is E007", () => {
    expect(codesOf(table({}, [cell({ "vertical-align": "sub" })]).ctx)).toEqual(["E007"]);
  });
});

describe("lint of table displays", () => {
  const bad = (node: ReturnType<typeof el>) => {
    const ctx = testCtx();
    const found = lintElement(node, ctx);
    return { found, ctx };
  };

  test("a div table with cells, rows or blocks lowers", () => {
    expect(canLower(el("div", { display: "table" }, [cell(), cell()]))).toBe(true);
    expect(canLower(el("div", { display: "table" }, [tr(cell())]))).toBe(true);
    expect(canLower(el("div", { display: "table" }, [part("block")]))).toBe(true);
  });

  test("text blocks and inline tags with display: table keep E001 instead of losing their tag", () => {
    for (const tag of ["ul", "ol", "p", "h1", "h3", "blockquote", "pre", "hr", "span", "em"]) {
      const node = el(tag, { display: "table", "margin-left": "auto", "margin-right": "auto" }, [text("x")]);
      expect(canLower(node)).toBe(false);
      const { ctx } = bad(node);
      expect(codesOf(ctx)).toEqual(["E001"]);
    }
  });

  test("cells and rows only lower inside a table", () => {
    const inTable = (style: Record<string, string>) => ({ ...el("div", style), parentStyle: { display: "table" } });
    expect(canLower(inTable({ display: "table-cell" }))).toBe(true);
    expect(canLower(inTable({ display: "table-row" }))).toBe(true);
    expect(canLower(el("div", { display: "table-cell" }))).toBe(false);
    expect(canLower({ ...el("div", { display: "table-row" }), parentStyle: { display: "table-row" } })).toBe(false);
  });

  test.each([
    ["caption", "table-caption"],
    ["header group", "table-header-group"],
    ["inline-table", "inline-table"],
  ])("%s keeps E001 with a hint", (_n, display) => {
    const { found, ctx } = bad(el("div", { display }));
    expect(found).toBe(true);
    expect(codesOf(ctx)).toEqual(["E001"]);
    expect(ctx.diagnostics.list()[0]?.hint).toContain("table-cell");
  });

  test("mixed children, text beside cells, loose row content and spans are E001", () => {
    for (const kids of [
      [cell(), part("block")],
      [cell(), text("loose")],
      [cell(), tr(cell())],
      [tr(cell(), part("block"))],
      [part("table-cell", {}, [text("x")], { colspan: "2" })],
      [tr(part("table-cell", {}, [text("x")], { rowspan: "2" }))],
    ] as Kids[]) {
      const { found, ctx } = bad(el("div", { display: "table" }, kids));
      expect(found).toBe(true);
      expect(codesOf(ctx)).toEqual(["E001"]);
      expect(ctx.diagnostics.list()[0]?.hint).toBeTruthy();
    }
  });
});

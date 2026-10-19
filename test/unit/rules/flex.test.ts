import { describe, expect, test } from "vitest";
import { analyze } from "../../../src/analyze/analyze.ts";
import { buttonRule } from "../../../src/analyze/rules/button.ts";
import { blockRule } from "../../../src/analyze/rules/block.ts";
import { reorder } from "../../../src/analyze/order.ts";
import { flexRule } from "../../../src/analyze/rules/flex.ts";
import { inlineRule } from "../../../src/analyze/rules/inline.ts";
import { compile } from "../../../src/index.ts";
import type { Node, RowNode, StackNode } from "../../../src/ir/index.ts";
import { codesOf, el, testCtx, text } from "../../helpers/index.ts";

const rules = [flexRule, blockRule, inlineRule];
const textOf = (n: Node): string => (n.kind === "inline" ? n.html : n.kind === "stack" ? n.children.map(textOf).join("") : "?");
type Kids = Parameters<typeof el>[2];

const item = (style: Record<string, string> = {}, kids: Kids = [text("x")]) => el("div", { display: "block", ...style }, kids);

const row = (style: Record<string, string>, kids: Kids) => {
  const ctx = testCtx();
  const node = analyze(el("div", { display: "flex", ...style }, kids), ctx, rules) as RowNode;
  return { node, cols: node.cols, ctx };
};

const col = (style: Record<string, string>, kids: Kids) => {
  const ctx = testCtx();
  const node = analyze(el("div", { display: "flex", "flex-direction": "column", ...style }, kids), ctx, rules) as StackNode;
  return { node, ctx };
};

describe("flexRule", () => {
  test("matches flex containers only", () => {
    const ctx = testCtx();
    expect(flexRule.matches(el("div", { display: "flex" }), ctx)).toBe(true);
    expect(flexRule.matches(el("div", { display: "inline-flex" }), ctx)).toBe(true);
    expect(flexRule.matches(el("div", { display: "block" }), ctx)).toBe(false);
    expect(flexRule.matches(el("span", { display: "flex" }), ctx)).toBe(true);
    expect(flexRule.matches(el("a", { display: "flex" }), ctx)).toBe(false);
  });

  describe("row widths", () => {
    test("px + grow mix", () => {
      const { node, cols, ctx } = row({ "column-gap": "12px" }, [
        item({ "flex-basis": "160px", "flex-grow": "0", width: "160px" }),
        item({ "flex-grow": "1", "flex-basis": "0%" }),
      ]);
      expect(node).toMatchObject({ kind: "row", gap: 12, wrap: false, loc: { line: 1 } });
      expect(cols.map((c) => c.width)).toEqual([{ px: 160 }, { grow: 1 }]);
      expect(codesOf(ctx)).toEqual([]);
    });

    test("px width without basis", () => {
      expect(row({}, [item({ width: "100px" })]).cols[0]?.width).toEqual({ px: 100 });
    });

    test("flex-shrink: 0 keeps a px column from shrinking", () => {
      const { cols } = row({}, [
        item({ "flex-grow": "1" }),
        item({ "flex-basis": "176px", "flex-shrink": "0" }),
        item({ "flex-basis": "120px" }),
        item({ "flex-basis": "20%", "flex-shrink": "0" }),
      ]);
      expect(cols.map((c) => c.noShrink)).toEqual([undefined, true, undefined, undefined]);
    });

    test("percentages", () => {
      const { cols, ctx } = row({}, [item({ width: "30%" }), item({ "flex-basis": "70%" })]);
      expect(cols.map((c) => c.width)).toEqual([{ pct: 30 }, { pct: 70 }]);
      expect(codesOf(ctx)).toEqual([]);
    });

    test("pct with horizontal margins is E006", () => {
      expect(codesOf(row({}, [item({ width: "50%", "margin-left": "8px" })]).ctx)).toContain("E006");
    });

    test("auto items, including text runs", () => {
      const { cols } = row({}, [text("hello "), item(), el("span", { display: "block" }, [text("s")])]);
      expect(cols.map((c) => c.width)).toEqual([{ auto: true }, { auto: true }, { auto: true }]);
      expect(cols[0]?.child.kind).toBe("inline");
    });

    test("margins, padding and border go into the outer px width", () => {
      const { cols } = row({}, [
        item({
          width: "100px", "padding-left": "10px", "padding-right": "6px", "margin-left": "4px", "margin-right": "4px",
          "border-left-width": "2px", "border-left-style": "solid", "border-left-color": "#000000",
        }),
      ]);
      expect(cols[0]?.width).toEqual({ px: 126 });
    });

    test("border-box keeps padding inside, margins still added", () => {
      const { cols } = row({}, [item({ width: "100px", "box-sizing": "border-box", "padding-left": "10px", "margin-left": "5px" })]);
      expect(cols[0]?.width).toEqual({ px: 105 });
    });

    test("px basis with grow is grow plus W003", () => {
      const { cols, ctx } = row({}, [item({ "flex-grow": "1", "flex-basis": "200px" })]);
      expect(cols[0]?.width).toEqual({ grow: 1 });
      expect(codesOf(ctx)).toEqual(["W003"]);
    });

    test("wrap flag", () => {
      expect(row({ "flex-wrap": "wrap" }, [item()]).node.wrap).toBe(true);
    });

    test("percentage gap is E006", () => {
      expect(codesOf(row({ "column-gap": "5%" }, [item()]).ctx)).toEqual(["E006"]);
    });
  });

  describe("valign", () => {
    const valigns = (container: string, self?: string) =>
      row({ "align-items": container }, [item(self ? { "align-self": self } : {})]).cols[0]?.valign;
    test("mapping", () => {
      expect(valigns("flex-start")).toBe("top");
      expect(valigns("start")).toBe("top");
      expect(valigns("center")).toBe("middle");
      expect(valigns("flex-end")).toBe("bottom");
      expect(valigns("end")).toBe("bottom");
      expect(valigns("stretch")).toBe("top");
      expect(valigns("normal")).toBe("top");
    });
    test("align-self wins over align-items", () => {
      expect(valigns("flex-start", "center")).toBe("middle");
      expect(valigns("center", "auto")).toBe("middle");
    });
    test("baseline is top plus W003", () => {
      const { cols, ctx } = row({ "align-items": "baseline" }, [item()]);
      expect(cols[0]?.valign).toBe("top");
      expect(codesOf(ctx)).toEqual(["W003"]);
    });
    test("stretch marks columns; only boxes that can't fill the cell warn", () => {
      const bg = { "background-color": "#eeeeee" };
      const full = row({}, [item(bg), item()]);
      expect(full.cols.map((c) => c.stretch)).toEqual([true, true]);
      expect(codesOf(full.ctx)).toEqual([]);
      expect(codesOf(row({}, [item({ ...bg, "max-width": "100px" }), item()]).ctx)).toEqual(["W003"]);
      const top = row({ "align-items": "flex-start" }, [item(bg), item()]);
      expect(top.cols.map((c) => c.stretch)).toEqual([undefined, undefined]);
      expect(codesOf(top.ctx)).toEqual([]);
    });
  });

  describe("justify-content", () => {
    test("normal and flex-start do nothing", () => {
      for (const jc of ["normal", "flex-start", "start", "left"]) {
        const { cols, node, ctx } = row({ "justify-content": jc }, [item({ width: "50px" }), item()]);
        expect(cols.map((c) => c.align)).toEqual([undefined, undefined]);
        expect(node.box.width).toBeUndefined();
        expect(codesOf(ctx)).toEqual([]);
      }
    });

    test("space-between: left, center, right on fixed columns", () => {
      const { cols } = row({ "justify-content": "space-between" }, [item({ width: "50px" }), item(), item({ width: "40px" })]);
      expect(cols.map((c) => c.align)).toEqual(["left", "center", "right"]);
    });

    test("space-between leaves grow columns alone", () => {
      const { cols } = row({ "justify-content": "space-between" }, [item({ width: "50px" }), item({ "flex-grow": "1", "flex-basis": "0%" })]);
      expect(cols.map((c) => c.align)).toEqual(["left", undefined]);
    });

    test("space-around/evenly warn, all-grow is a no-op", () => {
      const a = row({ "justify-content": "space-around" }, [item({ width: "50px" }), item({ width: "50px" })]);
      expect(a.cols.map((c) => c.align)).toEqual(["left", "right"]);
      expect(codesOf(a.ctx)).toEqual(["W003"]);
      const grow = { "flex-grow": "1", "flex-basis": "0%" };
      const b = row({ "justify-content": "space-evenly" }, [item(grow), item(grow)]);
      expect(b.cols.map((c) => c.align)).toEqual([undefined, undefined]);
      expect(codesOf(b.ctx)).toEqual([]);
    });

    test("center with px columns shrinks the row", () => {
      const { cols, node, ctx } = row({ "justify-content": "center" }, [item({ width: "100px" }), item({ width: "60px" })]);
      expect(cols.map((c) => c.align)).toEqual(["center", "center"]);
      expect(node.box.width).toEqual({ px: 160 });
      expect(node.box.align).toBe("center");
      expect(codesOf(ctx)).toEqual([]);
    });

    test("flex-end with px columns aligns right, row padding counts", () => {
      const { cols, node } = row({ "justify-content": "flex-end", "padding-left": "10px", "padding-right": "10px" }, [item({ width: "100px" })]);
      expect(cols[0]?.align).toBe("right");
      expect(node.box.width).toEqual({ px: 120 });
      expect(node.box.align).toBe("right");
    });

    test("center or flex-end with content-sized columns places the shrink-wrapped row", () => {
      const { cols, node, ctx } = row({ "justify-content": "center" }, [item({ width: "100px" }), item()]);
      expect(cols.map((c) => c.align)).toEqual([undefined, undefined]);
      expect(node.box.width).toBeUndefined();
      expect(node.box.align).toBe("center");
      expect(codesOf(ctx)).toEqual([]);
      expect(row({ "justify-content": "flex-end" }, [item()]).node.box.align).toBe("right");
    });

    test("a painted row of content-sized columns keeps its size and centres the cells in it", () => {
      const { node, ctx } = row({ "justify-content": "center", "background-color": "#eee" }, [item()]);
      expect(node.box.align).toBeUndefined();
      expect(node.cols[0]?.align).toBe("center");
      expect(codesOf(ctx)).toEqual([]);
    });

    test("two grow columns beside a px column warn: the table splits by content", () => {
      const grow = (g: string) => item({ "flex-grow": g, "flex-basis": "0%" });
      expect(codesOf(row({}, [grow("2"), grow("1"), item({ width: "100px", "flex-shrink": "0" })]).ctx)).toContain("W003");
      expect(codesOf(row({}, [grow("1"), item({ width: "100px" })]).ctx)).not.toContain("W003");
    });

    test("center with grow columns is a no-op", () => {
      const { node, ctx } = row({ "justify-content": "center" }, [item({ "flex-grow": "1", "flex-basis": "0%" })]);
      expect(node.box.width).toBeUndefined();
      expect(codesOf(ctx)).toEqual([]);
    });
  });

  describe("E007", () => {
    test.each([
      [{ "flex-direction": "row-reverse" }, "flex-direction: row-reverse"],
      [{ "flex-direction": "column-reverse" }, "flex-direction: column-reverse"],
      [{ "flex-wrap": "wrap-reverse" }, "flex-wrap: wrap-reverse"],
      [{ "align-content": "space-between" }, "align-content: space-between"],
    ])("container %j", (style, msg) => {
      const { ctx } = row(style, [item()]);
      const d = ctx.diagnostics.list().filter((x) => x.code === "E007");
      expect(d).toHaveLength(1);
      expect(d[0]?.message).toContain(msg);
    });

    test("order reorders the items, stably, default 0", () => {
      const tag = (t: string, order?: string) => el("div", { display: "block", ...(order ? { order } : {}) }, [text(t)]);
      const { cols, ctx } = row({}, [tag("a", "1"), tag("b"), tag("c", "-1"), tag("d", "1")]);
      const html = cols.map((c) => textOf(c.child));
      expect(html).toEqual(["c", "b", "a", "d"]);
      expect(codesOf(ctx)).toEqual([]);
    });

    test("an Outlook-only item travels with the item before it", () => {
      const inline = (html: string): Node => ({ kind: "inline", html, style: {}, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
      const mso = (html: string): Node => ({ kind: "conditional", target: "mso", child: inline(html) });
      const order = (o: string) => el("div", { order: o });
      const items = [{ node: inline("a"), el: order("2") }, { node: mso("ghost") }, { node: mso("ghost2") }, { node: inline("b") }, { node: mso("lead") }];
      const names = reorder(items, () => {}).map((i) => (i.node.kind === "inline" ? i.node.html : i.node.kind === "conditional" && i.node.child.kind === "inline" ? i.node.child.html : "?"));
      expect(names).toEqual(["b", "lead", "a", "ghost", "ghost2"]);
    });

    test("order in a column", () => {
      const tag = (t: string, order: string) => el("div", { display: "block", order }, [text(t)]);
      const { node } = col({}, [tag("a", "2"), tag("b", "1")]);
      expect(node.children.map(textOf)).toEqual(["b", "a"]);
    });

    test("order that is not a number, or on a looped item, stays E007", () => {
      expect(codesOf(row({}, [item({ order: "var(--o)" }), item()]).ctx)).toEqual(["E007"]);
      const looped: Node = { kind: "template", op: "each", path: "items", child: { kind: "inline", html: "x", style: {}, margin: { top: 0, right: 0, bottom: 0, left: 0 } } };
      const ctx = testCtx();
      const reported: string[] = [];
      const items = [{ node: looped, el: item({ order: "2" }) }, { node: looped }];
      expect(reorder(items, (_e, v) => void reported.push(v))).toBe(items);
      expect(reported).toEqual(["2"]);
    });

    test("order 0 and supported align-content are fine", () => {
      expect(codesOf(row({ "align-content": "stretch" }, [item({ order: "0" })]).ctx)).toEqual([]);
      expect(codesOf(row({ "align-content": "flex-start" }, [item()]).ctx)).toEqual([]);
    });
  });

  describe("column", () => {
    test("stack with row gap, non-collapsing", () => {
      const { node, ctx } = col({ "row-gap": "10px", "column-gap": "3px" }, [item(), item()]);
      expect(node).toMatchObject({ kind: "stack", gap: 10, collapse: false });
      expect(node.children).toHaveLength(2);
      expect(codesOf(ctx)).toEqual([]);
    });

    test("align-items center sets align on boxed items and centers text items via the cell", () => {
      const { node, ctx } = col({ "align-items": "center" }, [item(), text("plain")]);
      expect((node.children[0] as StackNode).box.align).toBe("center");
      expect(node.children[1]).toMatchObject({ kind: "inline", style: { "text-align": "center" } });
      expect(codesOf(ctx)).toEqual(["W003"]); // only the unsized div
    });

    test("unsized unpainted div: W003 without text-align, silent with it", () => {
      expect(codesOf(col({ "align-items": "center" }, [item()]).ctx)).toEqual(["W003"]);
      expect(codesOf(col({ "align-items": "center" }, [item({ "text-align": "center" })]).ctx)).toEqual([]);
      expect(codesOf(col({ "align-items": "center" }, [item({ width: "100px" })]).ctx)).toEqual([]);
    });

    test("an item's auto margins win over align-items", () => {
      const { node } = col({ "align-items": "flex-end" }, [item({ width: "100px", "margin-left": "auto", "margin-right": "auto" })]);
      expect((node.children[0] as StackNode).box.align).toBe("center");
    });

    test("align-self and flex-end", () => {
      const { node } = col({ "align-items": "flex-end" }, [item(), item({ "align-self": "center" }), item({ "align-self": "flex-start" })]);
      expect(node.children.map((c) => (c as StackNode).box.align)).toEqual(["right", "center", undefined]);
    });

    test("flex-grow is W001 only when authored", () => {
      expect(codesOf(col({}, [item({ "flex-grow": "1" })]).ctx)).toEqual(["W001"]);
      expect(codesOf(col({}, [item({ "flex-grow": "0" })]).ctx)).toEqual([]);
      expect(codesOf(col({}, [item()]).ctx)).toEqual([]);
    });

    test("column-reverse is E007", () => {
      expect(codesOf(col({ "flex-direction": "column-reverse" }, [item()]).ctx)).toEqual(["E007"]);
    });
  });

  describe("review fixes", () => {
    const diags = (ctx: ReturnType<typeof testCtx>, code: string) => ctx.diagnostics.list().filter((d) => d.code === code);
    const g = { "flex-grow": "1", "flex-basis": "0%" };

    test("center with px columns includes the gap in the row width", () => {
      const { node } = row({ "justify-content": "center", "column-gap": "12px" }, [item({ width: "100px" }), item({ width: "60px" })]);
      expect(node.box.width).toEqual({ px: 172 });
    });

    test("center with all-pct and px+pct columns warns", () => {
      expect(codesOf(row({ "justify-content": "center" }, [item({ width: "30%" }), item({ width: "30%" })]).ctx)).toEqual(["W003"]);
      const mix = row({ "justify-content": "flex-end" }, [item({ width: "100px" }), item({ width: "30%" })]);
      expect(codesOf(mix.ctx)).toEqual(["W003"]);
      expect(mix.cols.map((c) => c.align)).toEqual(["right", undefined]);
    });

    test("center with a set width or a painted row keeps the box's size; the cells are centred in it", () => {
      const w = row({ "justify-content": "center", width: "300px" }, [item({ width: "100px" })]);
      expect(w.node.box.width).toEqual({ px: 300 });
      expect(w.node.cols[0]?.align).toBe("center");
      expect(codesOf(w.ctx)).toEqual([]);
      const p = row({ "justify-content": "center", "background-color": "#eeeeee" }, [item({ width: "100px" })]);
      expect(p.node.box.width).toBeUndefined();
      expect(codesOf(p.ctx)).toEqual([]);
    });

    test("unknown justify-content and align-items give one E007 each", () => {
      const a = row({ "justify-content": "safe center" }, [item(), item(), item()]);
      expect(diags(a.ctx, "E007")).toHaveLength(1);
      expect(diags(a.ctx, "E007")[0]?.message).toContain("justify-content");
      const b = row({ "align-items": "safe center" }, [item(), item(), item()]);
      expect(diags(b.ctx, "E007")).toHaveLength(1);
      expect(diags(b.ctx, "E007")[0]?.message).toContain("align-items");
    });

    test("invalid align-self is E007 naming align-self at the item", () => {
      const ctx = testCtx();
      const bad = el("div", { display: "block", "align-self": "last baseline" }, [text("x")], { line: 7 });
      analyze(el("div", { display: "flex" }, [item(), bad]), ctx, rules);
      const d = diags(ctx, "E007");
      expect(d).toHaveLength(1);
      expect(d[0]?.message).toContain("align-self");
      expect(d[0]?.loc).toMatchObject({ line: 7 });
    });

    test("order E007 points at the item, container props at the container", () => {
      const ctx = testCtx();
      const bad = el("div", { display: "block", order: "calc(1 + 1)" }, [text("x")], { line: 9 });
      analyze(el("div", { display: "flex", "flex-wrap": "wrap-reverse" }, [bad], { line: 2 }), ctx, rules);
      expect(diags(ctx, "E007").map((d) => d.loc?.line).sort()).toEqual([2, 9]);
    });

    test("baseline gives a single W003 for several items", () => {
      expect(codesOf(row({ "align-items": "baseline" }, [item(), item(), item()]).ctx)).toEqual(["W003"]);
    });

    test("column center with text-align center is silent", () => {
      const c = col({ "align-items": "center", "text-align": "center" }, [
        el("span", { display: "block", "text-align": "center" }, [text("a")]),
        text("b"),
      ]);
      expect(codesOf(c.ctx)).toEqual([]);
      expect(codesOf(col({ "align-items": "center" }, [text("b")]).ctx)).toEqual([]);
    });

    test("column flex-start with a painted item without width warns", () => {
      const bg = { "background-color": "#eeeeee" };
      expect(codesOf(col({ "align-items": "flex-start" }, [item(bg)]).ctx)).toEqual(["W003"]);
      expect(codesOf(col({ "align-items": "flex-start" }, [item({ ...bg, width: "100px" })]).ctx)).toEqual([]);
      expect(codesOf(col({ "align-items": "center" }, [item(bg)]).ctx)).toEqual(["W003"]);
    });

    test("margin-left: auto on a row item aligns its column right", () => {
      const { cols } = row({}, [item({ width: "50px" }), item({ width: "50px", "margin-left": "auto" })]);
      expect(cols.map((c) => c.align)).toEqual([undefined, "right"]);
    });

    test("negative margins count as 0", () => {
      expect(row({}, [item({ width: "100px", "margin-left": "-10px" })]).cols[0]?.width).toEqual({ px: 100 });
    });

    test("flex-basis 0 without grow is W003; flex: auto and content are quiet", () => {
      const z = row({}, [item({ "flex-basis": "0" })]);
      expect(z.cols[0]?.width).toEqual({ auto: true });
      expect(codesOf(z.ctx)).toEqual(["W003"]);
      const a = row({}, [item({ "flex-grow": "1", "flex-basis": "auto" })]);
      expect(a.cols[0]?.width).toEqual({ grow: 1 });
      expect(codesOf(a.ctx)).toEqual([]);
      const c = row({}, [item({ "flex-basis": "content" })]);
      expect(c.cols[0]?.width).toEqual({ auto: true });
      expect(codesOf(c.ctx)).toEqual([]);
      expect(row({ "justify-content": "center" }, [item(g), item({ width: "50px" })]).node.box.width).toBeUndefined();
    });
  });

  describe("calc() widths", () => {
    const calcOf = (basis: string, style: Record<string, string> = {}, parent: Record<string, string> = {}) =>
      row(parent, [item({ "flex-basis": basis, ...style }), item()]);

    test("calc(P% - Npx) and calc(P% + Npx), either operand order", () => {
      expect(calcOf("calc(50% - 10px)").cols[0]?.width).toEqual({ calc: { pct: 50, px: -10 } });
      expect(calcOf("calc(25% + 8px)").cols[0]?.width).toEqual({ calc: { pct: 25, px: 8 } });
      expect(calcOf("calc(8px + 25%)").cols[0]?.width).toEqual({ calc: { pct: 25, px: 8 } });
      expect(calcOf("calc(33.3333% - 8px)").cols[0]?.width).toEqual({ calc: { pct: 33.3333, px: -8 } });
    });

    test("wrapping or not, no diagnostics", () => {
      expect(codesOf(calcOf("calc(50% - 10px)").ctx)).toEqual([]);
      const w = row({ "flex-wrap": "wrap" }, [item({ "flex-basis": "calc(50% - 10px)" }), item({ "flex-basis": "calc(50% - 10px)" })]);
      expect(w.cols[0]?.width).toEqual({ calc: { pct: 50, px: -10 } });
      expect(codesOf(w.ctx)).toEqual([]);
    });

    test("content-box padding and side margins ride on the px part", () => {
      expect(calcOf("calc(50% - 10px)", { "padding-left": "6px", "padding-right": "6px" }).cols[0]?.width).toEqual({ calc: { pct: 50, px: 2 } });
      expect(calcOf("calc(50% - 10px)", { "padding-left": "6px", "box-sizing": "border-box" }).cols[0]?.width).toEqual({ calc: { pct: 50, px: -10 } });
      expect(calcOf("calc(50% - 10px)", { "margin-left": "4px" }).cols[0]?.width).toEqual({ calc: { pct: 50, px: -6 } });
    });

    test("flex-grow beside a calc basis is dropped with a W003", () => {
      const r = calcOf("calc(50% - 10px)", { "flex-grow": "1" });
      expect(r.cols[0]?.width).toEqual({ calc: { pct: 50, px: -10 } });
      expect(codesOf(r.ctx)).toEqual(["W003"]);
    });

    test("anything else stays E006 with the calc hint", () => {
      for (const v of ["calc(50vw - 10px)", "calc(50% - 1em)", "calc(100% - calc(20px + 10px))", "calc(50% / 2)", "calc(50% * 2)", "calc(50%-10px)", "calc(10px - 50%)"]) {
        const r = calcOf(v);
        expect(codesOf(r.ctx), v).toContain("E006");
        expect(r.cols[0]?.width, v).toEqual({ auto: true });
      }
      const r = calcOf("calc(50% / 2)");
      expect(r.ctx.diagnostics.list().find((d) => d.code === "E006")?.hint).toBe("use calc(P% - Npx) or calc(P% + Npx)");
    });

    test("a calc column is a share for justify-content, not px", () => {
      const r = row({ "justify-content": "center" }, [item({ "flex-basis": "calc(50% - 10px)" }), item({ width: "50px" })]);
      expect(r.node.box.width).toBeUndefined();
      expect(codesOf(r.ctx)).toEqual(["W003"]);
    });

    test("the wrap edge-inset W003 is honest about auto items", () => {
      // shares (% or calc) usually keep exact widths, so the flex rule leaves them to gap-to-padding
      const shares = row({ "flex-wrap": "wrap", "column-gap": "16px", "padding-bottom": "16px" }, [item({ "flex-basis": "calc(50% - 8px)" }), item({ "flex-basis": "calc(50% - 8px)" })]);
      expect(shares.ctx.diagnostics.list()).toEqual([]);
      const sized = row({ "flex-wrap": "wrap", "column-gap": "16px", "padding-bottom": "16px" }, [item({ "flex-basis": "200px" }), item({ "flex-basis": "200px" })]);
      expect(sized.ctx.diagnostics.list()[0]?.message).toContain("a line that fills the row loses that");
      const auto = row({ "flex-wrap": "wrap", "column-gap": "16px", "padding-bottom": "16px" }, [item({ "flex-basis": "100px" }), item(), item({ "flex-basis": "100px" })]);
      expect(auto.ctx.diagnostics.list()[0]?.message).toContain("the first and last sized items lose that from their width");
    });
  });

  describe("fix round 2", () => {
    test("pct flex-basis with padding needs calc unless border-box", () => {
      const bad = row({}, [item({ "flex-basis": "50%", "padding-left": "10px" })]);
      expect(codesOf(bad.ctx)).toContain("E006");
      const ok = row({}, [item({ "flex-basis": "50%", "padding-left": "10px", "box-sizing": "border-box" })]);
      expect(codesOf(ok.ctx)).toEqual([]);
    });

    test("flex-basis px wins over a different width", () => {
      const { cols } = row({}, [item({ "flex-basis": "200px", width: "100px" })]);
      expect(cols[0]?.width).toEqual({ px: 200 });
      expect((cols[0]?.child as unknown as StackNode).box.width).toBeUndefined();
    });

    test("nav: margin-left auto on a middle link pushes it and the rest right", () => {
      const { cols } = row({}, [item({ width: "50px" }), item({ width: "50px", "margin-left": "auto" }), item({ width: "50px" })]);
      expect(cols.map((c) => c.align)).toEqual([undefined, "right", "right"]);
    });

    test("nav: margin-right auto on the first item pushes the rest right", () => {
      const { cols } = row({}, [item({ width: "50px", "margin-right": "auto" }), item({ width: "50px" }), item({ width: "50px" })]);
      expect(cols.map((c) => c.align)).toEqual([undefined, "right", "right"]);
    });

    test("wrapping row with justify-content center is not given a fixed width", () => {
      const { node, ctx } = row({ "flex-wrap": "wrap", "justify-content": "center" }, [item({ width: "300px" }), item({ width: "300px" }), item({ width: "300px" })]);
      expect(node.box.width).toBeUndefined();
      expect(codesOf(ctx)).toEqual([]);
      expect(node.cols.map((c) => c.align)).toEqual(["center", "center", "center"]);
    });
  });

  describe("wrapping rows", () => {
    test("a px basis or width is the column width; a grow item carries its factor for the resolver", () => {
      const { cols, ctx } = row({ "flex-wrap": "wrap" }, [
        item({ "flex-basis": "200px" }),
        item({ width: "150px" }),
        item({ "flex-grow": "1", "flex-basis": "180px", "padding-left": "10px", "padding-right": "10px" }),
      ]);
      expect(cols.map((c) => c.width)).toEqual([{ px: 200 }, { px: 150 }, { px: 200, grow: 1 }]);
      expect(codesOf(ctx)).toEqual([]);
    });

    test("grow without a px basis keeps its width and says why it can't wrap well", () => {
      const { cols, ctx } = row({ "flex-wrap": "wrap" }, [item({ "flex-grow": "1" }), item({ "flex-grow": "1", "flex-basis": "50%" }), item({ "flex-grow": "1", "flex-basis": "0px" })]);
      expect(cols.map((c) => Object.keys(c.width)[0])).toEqual(["grow", "grow", "grow"]);
      const d = ctx.diagnostics.list();
      expect(d.map((x) => x.code)).toEqual(["W003", "W003", "W003"]);
      expect(d[0]?.message).toContain("needs a px flex-basis or width");
    });

    test("a px basis with grow never reaches a non-wrapping row: no px spec carries grow there", () => {
      const { cols } = row({}, [item({ "flex-grow": "1", "flex-basis": "200px" }), item({ width: "100px" })]);
      expect(cols.map((c) => c.width)).toEqual([{ grow: 1 }, { px: 100 }]);
      expect(cols.some((c) => "px" in c.width && "grow" in c.width)).toBe(false);
    });

    test("a button in a px-basis grow item keeps the basis width (VML survives) and says it doesn't grow", () => {
      const ctx = testCtx();
      const btn = el("a", { display: "block", "flex-grow": "1", "flex-basis": "200px", "box-sizing": "border-box", "border-radius": "6px", "background-color": "#4f46e5", color: "#ffffff", "padding-left": "20px", "padding-right": "20px", "padding-top": "10px", "padding-bottom": "10px", "font-size": "16px" }, [text("Go")], { attrs: { href: "#" } });
      const node = analyze(el("div", { display: "flex", "flex-wrap": "wrap" }, [btn]), ctx, [buttonRule, flexRule, blockRule, inlineRule]) as RowNode;
      expect(node.cols[0]?.width).toEqual({ px: 200, grow: 1 });
      expect(node.cols[0]?.child).toMatchObject({ kind: "button", box: { width: { px: 200 } } });
      expect(ctx.diagnostics.list().some((d) => d.message.includes("keeps its basis width"))).toBe(true);
    });

    test("a % width stays a % column without a warning", () => {
      const { cols, ctx } = row({ "flex-wrap": "wrap" }, [item({ "flex-basis": "48%" }), item({ width: "48%" })]);
      expect(cols.map((c) => c.width)).toEqual([{ pct: 48 }, { pct: 48 }]);
      expect(codesOf(ctx)).toEqual([]);
    });

    test("auto-width items are W003 once, auto margins are W003", () => {
      expect(codesOf(row({ "flex-wrap": "wrap" }, [item(), item()]).ctx)).toEqual(["W003"]);
      expect(codesOf(row({ "flex-wrap": "wrap" }, [item({ width: "100px" }), item({ width: "100px", "margin-left": "auto" })]).ctx)).toEqual(["W003"]);
    });

    test("row-gap becomes bottom spacing in every column and comes off the row's bottom padding", () => {
      const { node, cols, ctx } = row(
        { "flex-wrap": "wrap", "row-gap": "12px", "column-gap": "8px", "padding-top": "10px", "padding-bottom": "12px", "padding-left": "4px", "padding-right": "4px" },
        [item({ width: "100px" }), item({ width: "100px" })],
      );
      expect(node.gap).toBe(8);
      expect(cols.map((c) => c.padding?.bottom)).toEqual([12, 12]);
      expect(node.box.padding.bottom).toBe(0);
      expect(node.box.padding.top).toBe(10);
      expect(codesOf(ctx)).toEqual([]);
    });

    test("a gap the row's padding can't absorb is W003", () => {
      expect(codesOf(row({ "flex-wrap": "wrap", "column-gap": "8px" }, [item({ width: "100px" })]).ctx)).toEqual(["W003"]);
      expect(codesOf(row({ "flex-wrap": "wrap", "column-gap": "8px", "padding-left": "4px", "padding-right": "4px" }, [item({ width: "100px" })]).ctx)).toEqual([]);
    });

    test("row-gap on a non-wrapping row is ignored", () => {
      const { cols } = row({ "row-gap": "12px" }, [item({ width: "100px" })]);
      expect(cols[0]?.padding).toBeUndefined();
    });

    test("painted items in a wrap row can't stretch: W003 once per row, silent for top/center", () => {
      const painted = () => [item({ width: "100px", "background-color": "#eee" }), item({ width: "100px", "background-color": "#eee" })];
      const { cols, ctx } = row({ "flex-wrap": "wrap" }, painted());
      expect(cols.every((c) => !c.stretch)).toBe(true);
      expect(codesOf(ctx)).toEqual(["W003"]);
      expect(codesOf(row({ "flex-wrap": "wrap", "align-items": "flex-start" }, painted()).ctx)).toEqual([]);
      expect(codesOf(row({ "flex-wrap": "wrap", "align-items": "center" }, painted()).ctx)).toEqual([]);
      expect(codesOf(row({ "flex-wrap": "wrap" }, [item({ width: "100px" }), item({ width: "100px" })]).ctx)).toEqual([]);
    });

    test("justify-content: space-between is approximated, flex-end aligns the lines", () => {
      expect(codesOf(row({ "flex-wrap": "wrap", "justify-content": "space-between" }, [item({ width: "100px" })]).ctx)).toEqual(["W003"]);
      expect(row({ "flex-wrap": "wrap", "justify-content": "flex-end" }, [item({ width: "100px" })]).cols[0]?.align).toBe("right");
    });
  });

  test("nested row in column", () => {
    const inner = el("div", { display: "flex" }, [item({ width: "40px" }), item({ "flex-grow": "1", "flex-basis": "0%" })]);
    const { node, ctx } = col({ "row-gap": "8px" }, [item(), inner]);
    expect(node.children.map((c) => c.kind)).toEqual(["stack", "row"]);
    expect((node.children[1] as RowNode).cols.map((c) => c.width)).toEqual([{ px: 40 }, { grow: 1 }]);
    expect(codesOf(ctx)).toEqual([]);
  });

  test("container properties are not reported as dropped", () => {
    const style = { "flex-direction": "row", "justify-content": "space-between", "align-items": "center", "column-gap": "8px", "flex-wrap": "wrap", "padding-left": "4px", "padding-right": "4px" };
    const ctx = testCtx();
    analyze(el("div", { display: "flex", ...style }, [item({ width: "100px" })], { declared: { display: "flex", ...style } }), ctx, rules);
    expect(codesOf(ctx)).toEqual(["W003"]); // only space-between on a wrapping row
  });
});

describe("grow columns own their width", () => {
  test("flex:1 with a px width fills its share", () => {
    const ctx = testCtx();
    const row = flexRule.analyze(
      el("div", { display: "flex" }, [el("div", { display: "block", "flex-grow": "1", "flex-basis": "0%", width: "100px" }, [text("a")])]),
      ctx,
      (n) => blockRule.analyze(n, ctx, () => ({ kind: "raw", html: "" })),
    ) as RowNode;
    expect(row.cols[0]?.width).toEqual({ grow: 1 });
    expect((row.cols[0]?.child as StackNode).box.width).toBeUndefined();
  });
});

describe("item margins", () => {
  test("side margins become cell padding, so grow items keep them and cards still stretch", () => {
    const ctx = testCtx();
    const bg = { display: "block", "flex-grow": "1", "flex-basis": "0%", "background-color": "#eeeeee" };
    const row = flexRule.analyze(
      el("div", { display: "flex" }, [el("div", { ...bg, "margin-left": "10px", "margin-right": "10px" }, [text("a")]), el("div", bg, [text("b")])]),
      ctx,
      (n) => blockRule.analyze(n, ctx, () => ({ kind: "raw", html: "" })),
    ) as RowNode;
    expect(row.cols[0]?.padding).toEqual({ top: 0, right: 10, bottom: 0, left: 10 });
    expect((row.cols[0]?.child as StackNode).box.margin).toMatchObject({ left: 0, right: 0 });
    expect(row.cols.map((c) => c.stretch)).toEqual([true, true]);
    expect(codesOf(ctx)).toEqual([]);
  });
});

describe("min-height column spacing", () => {
  const column = (jc: string, kids: string, css = "") =>
    `<style>${css}</style><div style="display:flex;flex-direction:column;justify-content:${jc};min-height:300px"><p class="a">A</p>${kids}<p>C</p></div>`;
  const w003 = (html: string, template?: "handlebars") =>
    compile(html, { strict: true, ...(template ? { template } : {}) }).diagnostics.filter((d) => d.code === "W003").map((d) => d.message);

  test("space-* with an item hidden on some screen, or a loop or lone if among the items, is W003", () => {
    const hidden = "@media (max-width:480px){.a{display:none}}";
    expect(w003(column("space-evenly", "<p>B</p>", hidden))).toEqual([expect.stringContaining("where one is hidden")]);
    expect(w003(column("space-between", '<p data-email-each="xs">B</p>'), "handlebars")).toEqual([expect.stringContaining("where a template repeats")]);
    expect(w003(column("space-around", '<p data-email-if="x">B</p>'), "handlebars")).toHaveLength(1);
  });

  test("a fixed number of items, or center and flex-end, which place the items as one group, are exact", () => {
    expect(w003(column("space-between", "<p>B</p>"))).toEqual([]);
    expect(w003(column("space-evenly", '<p data-email-if="x">B</p><p data-email-else>D</p>'), "handlebars")).toEqual([]);
    expect(w003(column("center", "<p>B</p>", "@media (max-width:480px){.a{display:none}}"))).toEqual([]);
    expect(w003(column("flex-end", '<p data-email-each="xs">B</p>'), "handlebars")).toEqual([]);
  });
});

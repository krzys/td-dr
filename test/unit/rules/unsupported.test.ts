import { describe, expect, test } from "vitest";
import { analyze } from "../../../src/analyze/analyze.ts";
import { blockRule } from "../../../src/analyze/rules/block.ts";
import { inlineRule } from "../../../src/analyze/rules/inline.ts";
import { unsupportedRule } from "../../../src/analyze/rules/unsupported.ts";
import { codesOf, el, testCtx, text } from "../../helpers/index.ts";

describe("unsupportedRule", () => {
  test("matches without reporting", () => {
    const ctx = testCtx();
    expect(unsupportedRule.matches(el("div", { display: "grid" }), ctx)).toBe(true);
    expect(unsupportedRule.matches(el("div", { display: "block" }), ctx)).toBe(false);
    expect(codesOf(ctx)).toEqual([]);
  });

  test("emits the element as raw html and reports", () => {
    const ctx = testCtx();
    const grid = el("div", { display: "grid" }, [text("hi")], { declared: { display: "grid" } });
    const node = analyze(grid, ctx, [unsupportedRule, blockRule, inlineRule]);
    expect(node).toMatchObject({ kind: "raw", loc: { line: 1 } });
    expect(node.kind === "raw" && node.html).toBe('<div style="display:grid">hi</div>');
    expect(codesOf(ctx)).toEqual(["E001"]);
  });

  test("positioned elements go through in normal flow: their containing block is gone", () => {
    const ctx = testCtx();
    const pos = { position: "absolute", left: "0", bottom: "-40px", "z-index": "1", color: "red" };
    const mark = el("div", { display: "block", ...pos }, [el("span", { position: "relative", top: "-6px" }, [text("K")], { declared: { position: "relative", top: "-6px" } })], { declared: pos });
    const node = analyze(mark, ctx, [unsupportedRule, blockRule, inlineRule]);
    expect(node.kind === "raw" && node.html).toBe('<div style="color:red"><span>K</span></div>');
    expect(codesOf(ctx)).toEqual(["E002", "E002"]);
  });

  test("gradient text inside raw html becomes solid too", () => {
    const ctx = testCtx();
    const clip = { "background-image": "linear-gradient(90deg, #c7cdfb, #f6cfe3)", "background-clip": "text", color: "transparent" };
    const mark = el("div", { display: "block", position: "absolute", ...clip }, [text("K")], { declared: { position: "absolute", ...clip } });
    const node = analyze(mark, ctx, [unsupportedRule, blockRule, inlineRule]);
    expect(node.kind === "raw" && node.html).toBe('<div style="color:#c7cdfb;-webkit-text-fill-color:#c7cdfb">K</div>');
    expect(codesOf(ctx)).toEqual(["E002", "W001"]);
  });

  test("lints what's inside the raw html", () => {
    const ctx = testCtx();
    const tree = el("div", { display: "grid" }, [el("p", { float: "left" })]);
    analyze(tree, ctx, [unsupportedRule]);
    expect(codesOf(ctx)).toEqual(["E001", "E004"]);
  });

  test("unsupported child inside a block gives one raw child and one E004", () => {
    const ctx = testCtx();
    const tree = el("div", { display: "block" }, [el("div", { display: "block", float: "left" })]);
    const node = analyze(tree, ctx, [unsupportedRule, blockRule, inlineRule]);
    expect(node.kind === "stack" && node.children.map((c) => c.kind)).toEqual(["raw"]);
    expect(codesOf(ctx)).toEqual(["E004"]);
  });

  test("non-strict still emits it, as a warning", () => {
    const ctx = testCtx({ strict: false });
    analyze(el("div", { transform: "rotate(3deg)" }), ctx, [unsupportedRule]);
    expect(ctx.diagnostics.list()[0]?.severity).toBe("warning");
  });

  test("<svg> is E008 by default and W010 with allowSvg; other elements stay errors", () => {
    const svg = () => el("svg", { display: "inline" }, [], { attrs: { viewBox: "0 0 8 8" } });
    const off = testCtx();
    analyze(svg(), off, [unsupportedRule, blockRule, inlineRule]);
    expect(codesOf(off)).toEqual(["E008"]);
    const on = testCtx({ allowSvg: true });
    const node = analyze(svg(), on, [unsupportedRule, blockRule, inlineRule]);
    expect(node.kind === "raw" && node.html).toBe('<svg viewBox="0 0 8 8" style="display:inline"></svg>');
    expect(codesOf(on)).toEqual(["W010"]);
    expect(on.diagnostics.list()[0]).toMatchObject({ severity: "warning", message: "<svg> kept: Gmail and Outlook don't show it", loc: { line: 1 } });
    const video = testCtx({ allowSvg: true });
    analyze(el("video", { display: "block" }), video, [unsupportedRule, blockRule, inlineRule]);
    expect(codesOf(video)).toEqual(["E008"]);
  });
  test("svg inside text is W010 with allowSvg and E008 without", () => {
    const p = () => el("p", { display: "block" }, [text("Hi "), el("svg", { display: "inline" }, [], { attrs: { viewBox: "0 0 8 8" } }), text(" there")]);
    const off = testCtx();
    analyze(p(), off, [unsupportedRule, blockRule, inlineRule]);
    expect(codesOf(off)).toEqual(["E008"]);
    const on = testCtx({ allowSvg: true });
    analyze(p(), on, [unsupportedRule, blockRule, inlineRule]);
    expect(codesOf(on)).toEqual(["W010"]);
  });

  test("allowSvg only changes E008: an error on the svg itself stays", () => {
    const ctx = testCtx({ allowSvg: true });
    const svg = el("svg", { display: "inline", transform: "rotate(45deg)" }, [], { declared: { transform: "rotate(45deg)" } });
    analyze(svg, ctx, [unsupportedRule, blockRule, inlineRule]);
    expect(codesOf(ctx).sort()).toEqual(["E003", "W010"]);
  });
});

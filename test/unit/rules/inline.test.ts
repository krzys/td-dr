import { describe, expect, test } from "vitest";
import { analyze } from "../../../src/analyze/analyze.ts";
import { blockRule } from "../../../src/analyze/rules/block.ts";
import { inlineRule } from "../../../src/analyze/rules/inline.ts";
import { unsupportedRule } from "../../../src/analyze/rules/unsupported.ts";
import { codesOf, el, testCtx, text } from "../../helpers/index.ts";

const rules = [unsupportedRule, blockRule, inlineRule];

describe("inlineRule", () => {
  test("matches text blocks and inline elements, not containers", () => {
    const ctx = testCtx();
    expect(inlineRule.matches(el("p", { display: "block" }), ctx)).toBe(true);
    expect(inlineRule.matches(el("span", {}), ctx)).toBe(true);
    expect(inlineRule.matches(el("div", { display: "block" }), ctx)).toBe(false);
  });

  test("a paragraph becomes an inline node with its margins lifted", () => {
    const ctx = testCtx();
    const p = el("p", { display: "block", "margin-top": "16px", "margin-bottom": "16px", color: "#111111" }, [text("Hello")]);
    const node = analyze(p, ctx, rules);
    expect(node).toMatchObject({
      kind: "inline",
      margin: { top: 16, right: 0, bottom: 16, left: 0 },
      style: { color: "#111111" },
    });
    expect(node.kind === "inline" && node.html).toContain("margin:0");
  });

  test("lints the subtree", () => {
    const ctx = testCtx();
    const p = el("p", { display: "block" }, [el("span", { position: "absolute" }), el("video")]);
    analyze(p, ctx, rules);
    expect(codesOf(ctx)).toEqual(["E002", "E008"]);
  });

  test("percentage margins are E006", () => {
    const ctx = testCtx();
    analyze(el("p", { display: "block", "margin-left": "5%" }), ctx, rules);
    expect(codesOf(ctx)).toEqual(["E006"]);
  });
});

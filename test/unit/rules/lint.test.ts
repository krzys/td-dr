import { describe, expect, test } from "vitest";
import { canLower, lintElement, lintTree } from "../../../src/analyze/lint.ts";
import { codesOf, el, testCtx, text } from "../../helpers/index.ts";

const lint = (tag: string, style: Record<string, string>, declared?: Record<string, string>) => {
  const ctx = testCtx();
  const node = el(tag, style, [], declared ? { declared } : {});
  const bad = lintElement(node, ctx);
  return { bad, codes: codesOf(ctx), ctx };
};

describe("lintElement", () => {
  test.each([
    ["grid", "grid"],
    ["inline-grid", "inline-grid"],
    ["subgrid", "subgrid"],
    ["table-row", "table-row"],
  ])("display %s on a div is E001", (_n, display) => {
    expect(lint("div", { display })).toMatchObject({ bad: true, codes: ["E001"] });
  });

  test("table displays are fine on table tags", () => {
    expect(lint("table", { display: "table" }).bad).toBe(false);
    expect(lint("td", { display: "table-cell" }).bad).toBe(false);
  });

  test.each(["absolute", "fixed", "sticky"])("position %s is E002", (position) => {
    expect(lint("div", { position }).codes).toEqual(["E002"]);
  });

  test("relative needs a real offset to count", () => {
    expect(lint("div", { position: "relative", top: "0" }).bad).toBe(false);
    expect(lint("div", { position: "relative" }).bad).toBe(false);
    expect(lint("div", { position: "relative", left: "-4px" })).toMatchObject({ bad: true, codes: ["E002"] });
  });

  test("transform, float", () => {
    expect(lint("div", { transform: "rotate(5deg)" }).codes).toEqual(["E003"]);
    expect(lint("div", { transform: "none" }).bad).toBe(false);
    expect(lint("div", { float: "left" }).codes).toEqual(["E004"]);
    expect(lint("span", { float: "right" }).codes).toEqual(["E004"]);
    expect(lint("img", { float: "none" }).bad).toBe(false);
  });

  test("float on an img is the align attribute, not an error", () => {
    expect(lint("img", { float: "left" }).bad).toBe(false);
    expect(lint("img", { float: "right" }).bad).toBe(false);
  });

  test("a picture with an img child is fine, one without stays E008", () => {
    const ctx = testCtx();
    const pic = el("picture", {}, [el("img", {}, [], { attrs: { src: "a.png" } })]);
    expect(lintElement(pic, ctx)).toBe(false);
  });

  test("authored animation and transition are E009, none is ignored", () => {
    expect(lint("div", {}, { "animation-name": "pulse" }).codes).toEqual(["E009"]);
    expect(lint("div", {}, { "transition-property": "all" }).codes).toEqual(["E009"]);
    expect(lint("div", {}, { "animation-name": "none" }).bad).toBe(false);
  });

  test("zero durations next to none don't count", () => {
    expect(lint("div", {}, { "transition-property": "none", "transition-duration": "0s" }).bad).toBe(false);
    expect(lint("div", {}, { "animation-name": "none", "animation-duration": "0s" }).bad).toBe(false);
  });

  test("<picture> without an img is E008", () => {
    expect(lint("picture", {}).codes).toEqual(["E008"]);
  });

  test.each(["video", "audio", "canvas", "iframe", "object", "embed", "svg", "form", "input", "select", "textarea", "button"])(
    "<%s> is E008",
    (tag) => {
      expect(lint(tag, {}).codes).toEqual(["E008"]);
    },
  );

  test("messages name the property and value, and carry the location", () => {
    const { ctx } = lint("div", { position: "fixed" });
    const [d] = ctx.diagnostics.list();
    expect(d?.message).toContain("position: fixed");
    expect(d?.loc).toEqual({ line: 1, col: 1 });
  });

  test("several problems on one element are all reported", () => {
    expect(lint("div", { float: "left", transform: "scale(2)" }).codes).toEqual(["E003", "E004"]);
  });

  test("canLower is silent", () => {
    expect(canLower(el("div", { float: "left" }))).toBe(false);
    expect(canLower(el("div", {}))).toBe(true);
  });
});

describe("lintTree", () => {
  test("walks descendants", () => {
    const ctx = testCtx();
    const tree = el("div", {}, [text("x"), el("p", {}, [el("span", { position: "absolute" })]), el("svg")]);
    lintTree(tree, ctx);
    expect(codesOf(ctx)).toEqual(["E002", "E008"]);
  });
});

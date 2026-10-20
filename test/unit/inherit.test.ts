import { describe, expect, test } from "vitest";
import { computeValues } from "../../src/style/inherit.ts";
import { LEGACY_ALIGN } from "../../src/style/props.ts";
import type { ComputedStyle, StyledElement, StyledNode } from "../../src/style/types.ts";
import { codesOf, styledFrom, testCtx } from "../helpers/index.ts";

const run = (values: Record<string, string>, parent?: ComputedStyle) => {
  const ctx = testCtx();
  const style = computeValues({ values, authored: new Set() }, parent, ctx, { line: 3, col: 1 });
  return { style, ctx };
};

describe("inheritance", () => {
  test("inherited props and custom props come from the parent, others don't", () => {
    const { style } = run({}, { color: "red", "margin-top": "1px", "--x": "7", display: "flex" });
    expect(style).toEqual({ color: "red", "--x": "7" });
  });

  test("cascaded values win", () => {
    expect(run({ color: "blue" }, { color: "red" }).style.color).toBe("blue");
  });

  test("inherit, initial, unset", () => {
    const parent = { color: "red", "font-weight": "bold", "margin-top": "5px", display: "block" };
    expect(run({ "margin-top": "inherit" }, parent).style["margin-top"]).toBe("5px");
    expect(run({ color: "initial" }, parent).style.color).toBeUndefined();
    expect(run({ color: "unset" }, parent).style.color).toBe("red");
    expect(run({ display: "unset" }, parent).style.display).toBeUndefined();
    expect(run({ "margin-top": "revert" }, parent).style["margin-top"]).toBeUndefined();
  });

  test("-webkit-center & co. are the side for text-align and carry on to the blocks below", () => {
    const centre = run({ "text-align": "-webkit-center" }).style;
    expect([centre["text-align"], centre[LEGACY_ALIGN]]).toEqual(["center", "center"]);
    expect(run({}, centre).style[LEGACY_ALIGN]).toBe("center");
    expect(run({ "text-align": "inherit" }, centre).style[LEGACY_ALIGN]).toBe("center");
    expect(run({ "text-align": "center" }, centre).style[LEGACY_ALIGN]).toBeUndefined();
    expect(run({ "text-align": "initial" }, centre).style[LEGACY_ALIGN]).toBeUndefined();
    expect(run({ "text-align": "-webkit-right" }, centre).style).toMatchObject({ "text-align": "right", [LEGACY_ALIGN]: "right" });
    const table = run({ display: "table" }, centre).style;
    expect([table["text-align"], table[LEGACY_ALIGN]]).toEqual(["start", undefined]);
    expect(run({ display: "table", "text-align": "center" }, centre).style["text-align"]).toBe("center");
  });

  test("keyword on a missing parent value drops it", () => {
    expect(run({ "margin-top": "inherit" }).style).toEqual({});
  });
});

describe("var()", () => {
  test("resolves from inherited and own custom props", () => {
    const { style } = run({ color: "var(--c)", "padding-top": "var(--gap, 4px)" }, { "--c": "green" });
    expect(style.color).toBe("green");
    expect(style["padding-top"]).toBe("4px");
  });

  test("custom props reference each other", () => {
    const { style } = run({ "--a": "var(--b)", "--b": "12px", "margin-top": "var(--a)" });
    expect(style["margin-top"]).toBe("12px");
    expect(style["--a"]).toBe("12px");
  });

  test("nested fallback", () => {
    expect(run({ color: "var(--nope, var(--also, red))" }).style.color).toBe("red");
  });

  test("cycles and unresolved refs warn and drop", () => {
    const a = run({ "--a": "var(--b)", "--b": "var(--a)", color: "var(--a)" });
    expect(a.style).toEqual({});
    expect(codesOf(a.ctx)).toEqual(["W001", "W001", "W001"]);
    const b = run({ color: "var(--missing)" });
    expect(b.style.color).toBeUndefined();
    expect(codesOf(b.ctx)).toEqual(["W001"]);
  });

  test("var() inside a shorthand is expanded after substitution", () => {
    const { style } = run({ margin: "var(--m) auto", "--m": "2px" });
    expect(style).toMatchObject({ "margin-top": "2px", "margin-right": "auto", "margin-bottom": "2px", "margin-left": "auto" });
  });

  test("em in a custom prop is resolved where it's used", () => {
    expect(run({ "--s": "2em", "font-size": "10px", "padding-top": "var(--s)" }).style["padding-top"]).toBe("20px");
  });
});

describe("units", () => {
  test("font-size: px, em and % of the parent, rem, keywords", () => {
    const parent = { "font-size": "20px" };
    expect(run({ "font-size": "14px" }, parent).style["font-size"]).toBe("14px");
    expect(run({ "font-size": "1.5em" }, parent).style["font-size"]).toBe("30px");
    expect(run({ "font-size": "50%" }, parent).style["font-size"]).toBe("10px");
    expect(run({ "font-size": "2rem" }, parent).style["font-size"]).toBe("32px");
    expect(run({ "font-size": "large" }, parent).style["font-size"]).toBe("18px");
    expect(run({ "font-size": "xxx-large" }).style["font-size"]).toBe("48px");
    expect(run({ "font-size": "larger" }, parent).style["font-size"]).toBe("24px");
    expect(run({ "font-size": "smaller" }, parent).style["font-size"]).toBe("16.67px");
  });

  test("font-size defaults to 16 without a parent", () => {
    expect(run({ "font-size": "2em" }).style["font-size"]).toBe("32px");
  });

  test("other lengths use the element's own font-size", () => {
    const { style } = run({ "font-size": "1.34em", "padding-top": "1em", "margin-top": "0.5em" }, { "font-size": "16px" });
    expect(style["font-size"]).toBe("21.44px");
    expect(style["padding-top"]).toBe("21.44px");
    expect(style["margin-top"]).toBe("10.72px");
  });

  test("absolute units", () => {
    const { style } = run({ "padding-top": "12pt", "padding-right": "1in", "padding-bottom": "2.54cm", "padding-left": "25.4mm", "margin-top": "1rem" });
    expect(style).toMatchObject({ "padding-top": "16px", "padding-right": "96px", "padding-bottom": "96px", "padding-left": "96px", "margin-top": "16px" });
  });

  test("zero is written as 0", () => {
    const { style } = run({ "margin-top": "0px", "margin-bottom": "0em", "padding-top": "0" });
    expect(style).toMatchObject({ "margin-top": "0", "margin-bottom": "0", "padding-top": "0" });
  });

  test("multi-value and trimmed numbers", () => {
    expect(run({ "border-spacing": "2.5000px 1em" }).style["border-spacing"]).toBe("2.5px 16px");
    expect(run({ "padding-top": "0.333em", "font-size": "10px" }).style["padding-top"]).toBe("3.33px");
  });

  test("percentages stay as authored", () => {
    const { style } = run({ width: "50%", "padding-left": "4%" });
    expect(style).toMatchObject({ width: "50%", "padding-left": "4%" });
  });

  test("line-height", () => {
    const parent = { "font-size": "10px" };
    expect(run({ "line-height": "1.5" }, parent).style["line-height"]).toBe("1.5");
    expect(run({ "line-height": "normal" }, parent).style["line-height"]).toBe("normal");
    expect(run({ "line-height": "2em" }, parent).style["line-height"]).toBe("20px");
    expect(run({ "line-height": "150%" }, parent).style["line-height"]).toBe("15px");
    expect(run({ "line-height": "24px" }, parent).style["line-height"]).toBe("24px");
  });

  test("line-height inherits as computed", () => {
    const child = run({}, run({ "font-size": "10px", "line-height": "2em" }).style).style;
    expect(child["line-height"]).toBe("20px");
  });

  test("border-width keywords", () => {
    expect(run({
      "border-top-width": "thin",
      "border-left-width": "medium",
      "border-right-width": "thick",
      "border-top-style": "solid",
      "border-left-style": "solid",
      "border-right-style": "solid",
    }).style).toMatchObject({
      "border-top-width": "1px",
      "border-left-width": "3px",
      "border-right-width": "5px",
    });
  });

  test("vw, vh, ch, ex and calc() are E006 and dropped", () => {
    for (const v of ["10vw", "5vh", "2vmin", "3vmax", "2ch", "1ex", "calc(1px + 2vw)", "calc(100% - 4px)", "min(1px, 2vw)", "max(1px,2vw)", "clamp(1px, 2vw, 3px)", "4px 10vw"]) {
      const { style, ctx } = run({ "padding-top": v });
      expect(style["padding-top"], v).toBeUndefined();
      expect(codesOf(ctx), v).toEqual(["E006"]);
      expect(ctx.diagnostics.list()[0]?.loc).toEqual({ line: 3, col: 1 });
    }
    const fs = run({ "font-size": "calc(1em + 2vw)" });
    expect(fs.style["font-size"]).toBeUndefined();
    expect(codesOf(fs.ctx)).toEqual(["E006"]);
  });

  test("strings, urls and non-lengths are left alone", () => {
    const { style } = run({
      "font-family": "'Font 2em', Arial",
      "background-image": "url(img/10em.png)",
      color: "#1e90ff",
      "transition-duration": "0.3s",
      transform: "rotate(45deg)",
    });
    expect(style).toMatchObject({
      "font-family": "'Font 2em', Arial",
      "background-image": "url(img/10em.png)",
      color: "#1e90ff",
      "transition-duration": "0.3s",
      transform: "rotate(45deg)",
    });
  });

  test("never emits undefined values", () => {
    const { style } = run({ color: "var(--x)", "margin-top": "inherit", "padding-top": "calc(1px)" });
    expect(Object.values(style).every((v) => typeof v === "string")).toBe(true);
  });

  test("unparsable shorthand warns", () => {
    const { style, ctx } = run({ margin: "1px 2px 3px 4px 5px" });
    expect(style).toEqual({});
    expect(codesOf(ctx)).toEqual(["W002"]);
  });
});

describe("review fixes", () => {
  test("border width is 0 without a visible style", () => {
    const a = run({ "border-top-width": "2px", "border-top-style": "none", "border-left-width": "2px", "border-right-width": "2px", "border-right-style": "solid" }).style;
    expect(a["border-top-width"]).toBe("0");
    expect(a["border-left-width"]).toBe("0");
    expect(a["border-right-width"]).toBe("2px");
  });

  test("border shorthands through computeValues", () => {
    expect(run({ border: "0" }).style["border-top-width"]).toBe("0");
    expect(run({ border: "thick solid" }).style["border-top-width"]).toBe("5px");
  });

  test("background shorthand with a colour outside the last layer warns and drops", () => {
    for (const v of ["red url(a.png), url(b.png)", "#222 linear-gradient(red, blue), #fff"]) {
      const { style, ctx } = run({ background: v });
      expect(style).toEqual({});
      expect(codesOf(ctx)).toEqual(["W002"]);
    }
  });

  test("junk in margin/padding/gap warns", () => {
    for (const [p, v] of [["margin", "1px / 2px"], ["padding", "1px,2px"], ["gap", "1px / 2px"]] as const) {
      const { style, ctx } = run({ [p]: v });
      expect(style).toEqual({});
      expect(codesOf(ctx)).toEqual(["W002"]);
    }
  });

  test("background resets earlier colour parts", () => {
    expect(run({ background: "url(x.png)" }).style).toMatchObject({ "background-color": "transparent", "background-image": "url(x.png)" });
    expect(run({ background: "none" }).style).toMatchObject({ "background-color": "transparent", "background-image": "none" });
  });

  test("var() font shorthand with em line-height", () => {
    const { style } = run({ "--f": "bold 2em/1.5em Arial", font: "var(--f)" }, { "font-size": "10px" });
    expect(style).toMatchObject({ "font-size": "20px", "line-height": "30px", "font-weight": "bold", "font-family": "Arial" });
  });

  test("last font-size wins", () => {
    expect(run({ font: "var(--f)", "--f": "12px Arial", "font-size": "20px" }).style["font-size"]).toBe("20px");
  });

  test("custom props with keywords and unsupported units", () => {
    const parent = { "--a": "5px", "--b": "7px" };
    const { style } = run({ "--a": "inherit", "--b": "initial" }, parent);
    expect(style["--a"]).toBe("5px");
    expect(style["--b"]).toBeUndefined();
    const bad = run({ "--w": "10vw", "padding-top": "var(--w)" });
    expect(bad.style["padding-top"]).toBeUndefined();
    expect(codesOf(bad.ctx)).toEqual(["E006"]);
  });

  // The cascade orders keys; the var() shorthand has to land in the right slot.
  test("var() shorthand and longhand follow key order", () => {
    const vars = { "--m": "1px" };
    const longLast = run({ ...vars, margin: "var(--m)", "margin-left": "5px" }).style;
    expect(longLast["margin-left"]).toBe("5px");
    expect(longLast["margin-top"]).toBe("1px");
    const longFirst = run({ ...vars, "margin-left": "5px", margin: "var(--m)" }).style;
    expect(longFirst["margin-left"]).toBe("1px");
  });

  test("cycle with fallbacks still fails", () => {
    const { style, ctx } = run({ "--a": "var(--b, 1px)", "--b": "var(--a, 2px)" });
    expect(style).toEqual({});
    expect(codesOf(ctx)).toEqual(["W001", "W001"]);
  });
});

describe("logical shorthands with var()", () => {
  const p = (html: string) => {
    const ctx = testCtx();
    const body = styledFrom(html, ctx);
    const find = (n: StyledNode): StyledElement | undefined =>
      n.type !== "element" ? undefined : n.tag === "p" ? n : n.children.map(find).find(Boolean);
    return { style: find(body)!.style, ctx };
  };

  test("resolve onto the physical sides, flipped in rtl", () => {
    const css = "<style>p{--x:1px 2px;padding-inline:var(--x);padding-block:var(--x)}</style>";
    const ltr = p(`${css}<p>x</p>`);
    expect(ltr.style).toMatchObject({ "padding-left": "1px", "padding-right": "2px", "padding-top": "1px", "padding-bottom": "2px" });
    expect(codesOf(ltr.ctx)).toEqual([]);
    expect(p(`${css}<div dir="rtl"><p>x</p></div>`).style).toMatchObject({ "padding-left": "2px", "padding-right": "1px" });
  });
});

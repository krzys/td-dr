import { describe, expect, test } from "vitest";
import { expandDeclaration, parsePending, toPhysical } from "../../src/style/shorthands.ts";

const x = (p: string, v: string) => Object.fromEntries(expandDeclaration(p, v));

describe("expandDeclaration", () => {
  test("passes longhands and unknown props through", () => {
    expect(expandDeclaration("color", "red")).toEqual([["color", "red"]]);
    expect(expandDeclaration("margin-top", "3px")).toEqual([["margin-top", "3px"]]);
  });

  test("margin and padding take 1 to 4 values", () => {
    expect(x("padding", "4px")).toEqual({ "padding-top": "4px", "padding-right": "4px", "padding-bottom": "4px", "padding-left": "4px" });
    expect(x("margin", "1px 2px")).toMatchObject({ "margin-top": "1px", "margin-right": "2px", "margin-bottom": "1px", "margin-left": "2px" });
    expect(x("margin", "1px 2px 3px")).toMatchObject({ "margin-bottom": "3px", "margin-left": "2px" });
    expect(x("margin", "1px 2px 3px 4px")).toMatchObject({ "margin-left": "4px" });
    expect(x("margin", "0 auto")).toMatchObject({ "margin-left": "auto", "margin-top": "0" });
  });

  test("too many values is dropped", () => {
    expect(expandDeclaration("margin", "1px 2px 3px 4px 5px")).toEqual([]);
  });

  test("border", () => {
    const b = x("border", "1px solid #ccc");
    expect(b["border-top-width"]).toBe("1px");
    expect(b["border-left-style"]).toBe("solid");
    expect(b["border-bottom-color"]).toBe("#ccc");
    expect(x("border", "1px solid rgb(0, 0, 0)")["border-top-color"]).toBe("rgb(0, 0, 0)");
    expect(x("border-bottom", "2px dashed red")).toEqual({ "border-bottom-width": "2px", "border-bottom-style": "dashed", "border-bottom-color": "red" });
  });

  test("border: none and missing parts", () => {
    expect(x("border", "none")).toMatchObject({ "border-top-style": "none", "border-top-width": "0" });
    expect(x("border-top", "solid")).toMatchObject({ "border-top-width": "medium", "border-top-color": "currentcolor" });
  });

  test("border-width/style/color", () => {
    expect(x("border-width", "1px 2px")).toEqual({ "border-top-width": "1px", "border-right-width": "2px", "border-bottom-width": "1px", "border-left-width": "2px" });
    expect(x("border-style", "solid")["border-left-style"]).toBe("solid");
    expect(x("border-color", "red blue")["border-right-color"]).toBe("blue");
  });

  test("border-radius keeps the part before the slash", () => {
    expect(x("border-radius", "4px")).toEqual({ "border-top-left-radius": "4px", "border-top-right-radius": "4px", "border-bottom-right-radius": "4px", "border-bottom-left-radius": "4px" });
    expect(x("border-radius", "1px 2px 3px / 9px")).toEqual({ "border-top-left-radius": "1px", "border-top-right-radius": "2px", "border-bottom-right-radius": "3px", "border-bottom-left-radius": "2px" });
  });

  test("background", () => {
    expect(x("background", "#fff")).toEqual({ "background-color": "#fff", "background-image": "none" });
    expect(x("background", "url(a/b.png) no-repeat")).toEqual({ "background-color": "transparent", "background-image": "url(a/b.png)", "background-repeat": "no-repeat" });
    expect(x("background", "red url(x.png) center / cover no-repeat")).toEqual({
      "background-color": "red",
      "background-image": "url(x.png)",
      "background-position": "center",
      "background-size": "cover",
      "background-repeat": "no-repeat",
    });
    expect(x("background", "rgb(1, 2, 3) 0 0")).toMatchObject({ "background-color": "rgb(1, 2, 3)", "background-position": "0 0" });
  });

  test("font", () => {
    expect(x("font", "italic bold 16px/1.5 Georgia, serif")).toEqual({
      "font-style": "italic",
      "font-variant": "normal",
      "font-weight": "bold",
      "font-size": "16px",
      "line-height": "1.5",
      "font-family": "Georgia, serif",
    });
    expect(x("font", "14px 'Helvetica Neue', Arial")).toMatchObject({ "font-weight": "normal", "line-height": "normal", "font-family": "'Helvetica Neue', Arial" });
    expect(x("font", "600 1.2em / 24px Arial")).toMatchObject({ "font-weight": "600", "font-size": "1.2em", "line-height": "24px" });
    expect(x("font", "small Arial")["font-size"]).toBe("small");
    expect(expandDeclaration("font", "16px")).toEqual([]);
  });

  test("flex", () => {
    const f = (v: string) => {
      const r = x("flex", v);
      return [r["flex-grow"], r["flex-shrink"], r["flex-basis"]];
    };
    expect(f("none")).toEqual(["0", "0", "auto"]);
    expect(f("auto")).toEqual(["1", "1", "auto"]);
    expect(f("1")).toEqual(["1", "1", "0%"]);
    expect(f("2 3")).toEqual(["2", "3", "0%"]);
    expect(f("2 3 10px")).toEqual(["2", "3", "10px"]);
    expect(f("1 1 0")).toEqual(["1", "1", "0"]);
    expect(f("200px")).toEqual(["1", "1", "200px"]);
    expect(f("0 0 25%")).toEqual(["0", "0", "25%"]);
  });

  test("flex-flow and gap", () => {
    expect(x("flex-flow", "column wrap")).toEqual({ "flex-direction": "column", "flex-wrap": "wrap" });
    expect(x("flex-flow", "wrap")).toEqual({ "flex-direction": "row", "flex-wrap": "wrap" });
    expect(x("gap", "8px")).toEqual({ "row-gap": "8px", "column-gap": "8px" });
    expect(x("gap", "8px 16px")).toEqual({ "row-gap": "8px", "column-gap": "16px" });
  });

  test("list-style", () => {
    expect(x("list-style", "none")).toEqual({ "list-style-type": "none", "list-style-image": "none" });
    expect(x("list-style", "square inside")).toEqual({ "list-style-type": "square", "list-style-position": "inside" });
  });

  test("global keywords hit every longhand", () => {
    expect(x("margin", "inherit")).toEqual({ "margin-top": "inherit", "margin-right": "inherit", "margin-bottom": "inherit", "margin-left": "inherit" });
    expect(Object.keys(x("border", "initial"))).toHaveLength(12);
    expect(x("font", "unset")["font-size"]).toBe("unset");
  });

  test("shorthand with var() gives every longhand a pending value", () => {
    const out = expandDeclaration("margin", "var(--m) auto");
    expect(out.map(([n]) => n)).toEqual(["margin-top", "margin-right", "margin-bottom", "margin-left"]);
    for (const [, v] of out) expect(parsePending(v)).toEqual({ prop: "margin", value: "var(--m) auto" });
    expect(parsePending("1px")).toBeUndefined();
  });

  test("layered backgrounds keep their layers; the colour only comes from the last one", () => {
    expect(x("background", "linear-gradient(rgba(0,0,0,.4), rgba(0,0,0,.4)), url(hero.png) center/cover")).toMatchObject({
      "background-image": "linear-gradient(rgba(0,0,0,.4), rgba(0,0,0,.4)), url(hero.png)",
      "background-position": "0% 0%, center",
      "background-size": "auto, cover",
      "background-color": "transparent",
    });
    expect(x("background", "url(a.png) center/cover, #222")).toMatchObject({ "background-image": "url(a.png)", "background-color": "#222", "background-size": "cover" });
    expect(expandDeclaration("background", "red url(a.png), url(b.png)")).toEqual([]);
    expect(x("background", "linear-gradient(red, blue)")["background-image"]).toBe("linear-gradient(red, blue)");
  });

  test("slashes and commas outside border-radius/font/background are dropped", () => {
    expect(expandDeclaration("margin", "1px / 2px")).toEqual([]);
    expect(expandDeclaration("padding", "1px,2px")).toEqual([]);
    expect(expandDeclaration("gap", "1px / 2px")).toEqual([]);
    expect(expandDeclaration("gap", "1px,2px")).toEqual([]);
    expect(x("font", "12px/1.5 Arial, sans-serif")["font-family"]).toBe("Arial, sans-serif");
  });

  test("more border, list-style and background cases", () => {
    expect(x("border", "0")).toMatchObject({ "border-top-style": "none", "border-top-width": "0" });
    expect(x("border", "thick solid")).toMatchObject({ "border-left-width": "thick", "border-left-style": "solid", "border-left-color": "currentcolor" });
    expect(x("list-style", "none inside")).toEqual({ "list-style-type": "none", "list-style-position": "inside", "list-style-image": "none" });
    expect(x("background", "none")).toEqual({ "background-color": "transparent", "background-image": "none" });
    expect(x("background", "#fff 0 0 / 100% auto no-repeat")).toEqual({
      "background-color": "#fff",
      "background-image": "none",
      "background-position": "0 0",
      "background-size": "100% auto",
      "background-repeat": "no-repeat",
    });
  });
});

describe("logical properties (horizontal-tb)", () => {
  test("block sides are top and bottom", () => {
    expect(x("padding-block", "16px")).toEqual({ "padding-top": "16px", "padding-bottom": "16px" });
    expect(x("margin-block", "1px 2px")).toEqual({ "margin-top": "1px", "margin-bottom": "2px" });
    expect(x("padding-block-start", "3px")).toEqual({ "padding-top": "3px" });
    expect(x("margin-block-end", "3px")).toEqual({ "margin-bottom": "3px" });
    expect(x("inset-block", "0 4px")).toEqual({ top: "0", bottom: "4px" });
    expect(x("inset-block-start", "1px")).toEqual({ top: "1px" });
  });

  test("inline sides stay start/end until the cascade knows the direction", () => {
    expect(x("padding-inline", "24px")).toEqual({ "padding-inline-start": "24px", "padding-inline-end": "24px" });
    expect(x("margin-inline", "auto")).toEqual({ "margin-inline-start": "auto", "margin-inline-end": "auto" });
    expect(x("inset-inline", "1px 2px")).toEqual({ "inset-inline-start": "1px", "inset-inline-end": "2px" });
    expect(x("padding-inline-start", "1px")).toEqual({ "padding-inline-start": "1px" });
    expect(expandDeclaration("padding-inline", "1px 2px 3px")).toEqual([]);
  });

  test("inset is top/right/bottom/left", () => {
    expect(x("inset", "0")).toEqual({ top: "0", right: "0", bottom: "0", left: "0" });
    expect(x("inset", "1px 2px")).toEqual({ top: "1px", right: "2px", bottom: "1px", left: "2px" });
  });

  test("logical borders", () => {
    expect(x("border-block", "1px solid red")).toEqual({
      "border-top-width": "1px", "border-top-style": "solid", "border-top-color": "red",
      "border-bottom-width": "1px", "border-bottom-style": "solid", "border-bottom-color": "red",
    });
    expect(x("border-block-end", "2px dashed")).toMatchObject({ "border-bottom-width": "2px", "border-bottom-style": "dashed" });
    expect(x("border-inline-start", "1px solid")).toMatchObject({ "border-inline-start-width": "1px", "border-inline-start-style": "solid" });
    expect(x("border-inline", "1px solid")).toMatchObject({ "border-inline-start-width": "1px", "border-inline-end-style": "solid" });
    expect(x("border-block-width", "1px 2px")).toEqual({ "border-top-width": "1px", "border-bottom-width": "2px" });
    expect(x("border-inline-color", "red")).toEqual({ "border-inline-start-color": "red", "border-inline-end-color": "red" });
    expect(x("border-block-start-style", "solid")).toEqual({ "border-top-style": "solid" });
  });

  test("sizes", () => {
    expect(x("inline-size", "100px")).toEqual({ width: "100px" });
    expect(x("block-size", "10px")).toEqual({ height: "10px" });
    expect(x("max-inline-size", "600px")).toEqual({ "max-width": "600px" });
    expect(x("min-block-size", "1px")).toEqual({ "min-height": "1px" });
  });

  test("keywords and var() pass through", () => {
    expect(x("padding-block", "inherit")).toEqual({ "padding-top": "inherit", "padding-bottom": "inherit" });
    expect(x("inline-size", "var(--w)")).toEqual({ width: "var(--w)" });
    const p = expandDeclaration("padding-inline", "var(--x)");
    expect(p.map(([n]) => n)).toEqual(["padding-inline-start", "padding-inline-end"]);
    expect(parsePending(p[0]![1])).toEqual({ prop: "padding-inline", value: "var(--x)" });
  });
});

describe("toPhysical", () => {
  test("inline start/end follow direction", () => {
    expect(toPhysical("padding-inline-start", "ltr")).toBe("padding-left");
    expect(toPhysical("padding-inline-start", "rtl")).toBe("padding-right");
    expect(toPhysical("margin-inline-end", "rtl")).toBe("margin-left");
    expect(toPhysical("inset-inline-end", "ltr")).toBe("right");
    expect(toPhysical("border-inline-start-color", "rtl")).toBe("border-right-color");
    expect(toPhysical("padding-left", "rtl")).toBe("padding-left");
  });
});

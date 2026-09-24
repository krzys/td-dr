import { describe, expect, test } from "vitest";
import { lowerColors } from "../../src/style/colors.ts";
import { computeValues } from "../../src/style/inherit.ts";
import { reduceMath } from "../../src/style/units.ts";
import { codesOf, testCtx } from "../helpers/index.ts";

const r = (v: string, fs = 16, rem = 16) => reduceMath(v, { em: fs, rem });

describe("calc reduction", () => {
  test("lengths in mixed units", () => {
    expect(r("calc(0.25rem * 6)")).toBe("24px");
    expect(r("calc(1rem + 4px)")).toBe("20px");
    expect(r("calc(2em - 1px)", 10)).toBe("19px");
    expect(r("calc(6 * 0.25rem)")).toBe("24px");
  });

  test("unitless ratios", () => {
    expect(r("calc(1.25 / 0.875)")).toBe("1.4286");
  });

  test("nesting and precedence", () => {
    expect(r("calc(2 * (1px + 3px) + calc(10px / 2))")).toBe("13px");
    expect(r("calc(1px + 2px * 3)")).toBe("7px");
    expect(r("calc(10px - 4px - 1px)")).toBe("5px");
  });

  test("min, max, clamp", () => {
    expect(r("min(10px, 1rem)")).toBe("10px");
    expect(r("max(10px, 1rem)")).toBe("16px");
    expect(r("clamp(10px, 50px, 20px)")).toBe("20px");
  });

  test("inside a longer value", () => {
    expect(r("calc(1rem * 2) calc(1px + 1px)")).toBe("32px 2px");
  });

  test("what can't fold stays, with its inside folded", () => {
    expect(r("calc(100% - 20px)")).toBe("calc(100% - 20px)");
    expect(r("calc(100% - calc(2 * 10px))")).toBe("calc(100% - 20px)");
    expect(r("calc(100% - 1vw)")).toBe("calc(100% - 1vw)");
    expect(r("calc(1px / 0)")).toBe("calc(1px / 0)");
    expect(r("min(50%, 300px)")).toBe("min(50%, 300px)");
    expect(r("calc(100% * 2px)")).toBe("calc(100% * 2px)");
  });

  test("% and px together fold to calc(P% ± Npx)", () => {
    expect(r("calc(50% - 0.5rem)")).toBe("calc(50% - 8px)");
    expect(r("calc(100% - 20px - 10px)")).toBe("calc(100% - 30px)");
    expect(r("calc(100% / 3 - 10px)")).toBe("calc(33.3333% - 10px)");
    expect(r("calc(10px + 25%)")).toBe("calc(25% + 10px)");
    expect(r("calc((100% - 2rem) / 2)")).toBe("calc(50% - 16px)");
    expect(r("calc(50% + 10px - 10px)")).toBe("50%");
    expect(r("calc(100% - 100% + 4px)")).toBe("4px");
  });
});

describe("colour lowering", () => {
  test("oklch matches Tailwind's hex", () => {
    expect(lowerColors("oklch(51.1% 0.262 276.966)")).toBe("#4f39f6");
    expect(lowerColors("oklch(27.9% 0.041 260.031)")).toBe("#1d293d");
  });

  test("alpha becomes rgba", () => {
    expect(lowerColors("oklch(0.5 0.1 100 / 0.2)")).toBe("rgba(113, 100, 11, 0.2)");
    expect(lowerColors("color-mix(in oklab, oklch(51.1% 0.262 276.966) 50%, transparent)")).toBe("rgba(79, 57, 246, 0.5)");
  });

  test("other spaces", () => {
    expect(lowerColors("color-mix(in srgb, red 30%, blue)")).toBe("#4d00b3");
    expect(lowerColors("hwb(120 10% 20%)")).toBe("#1acc1a");
    expect(lowerColors("lab(50% 40 59.5)")).toMatch(/^#[0-9a-f]{6}$/);
    expect(lowerColors("oklch(from red l c h)")).toBe("#ff0000");
  });

  test("out-of-gamut colours clip like Chromium", () => {
    expect(lowerColors("color(display-p3 1 0 0)")).toBe("#ff0000");
    expect(lowerColors("oklch(70% 0.4 30)")).toBe("#ff0000");
  });

  test("space syntax with alpha becomes rgba", () => {
    expect(lowerColors("hsl(0 100% 50% / .5)")).toBe("rgba(255, 0, 0, 0.5)");
    expect(lowerColors("2px solid rgb(0 0 0 / 50%)")).toBe("2px solid rgba(0, 0, 0, 0.5)");
    expect(lowerColors("hsl(120 100% 25%)")).toBe("hsl(120 100% 25%)");
  });

  test("urls and strings are left alone", () => {
    const grad = lowerColors("oklch(50% 0.2 30)");
    expect(grad).toMatch(/^#[0-9a-f]{6}$/);
    expect(lowerColors("url(/img/hero.2x.png), linear-gradient(oklch(50% 0.2 30), red)")).toBe(`url(/img/hero.2x.png), linear-gradient(${grad}, red)`);
    expect(lowerColors('url("/img/lab(1).png"), linear-gradient(oklch(50% 0.2 30), red)')).toBe(`url("/img/lab(1).png"), linear-gradient(${grad}, red)`);
    expect(lowerColors('"color(Pro)", Arial')).toBe('"color(Pro)", Arial');
  });

  test("currentColor is the colour passed in", () => {
    expect(lowerColors("color-mix(in srgb, red 50%, currentColor)", "#0000ff")).toBe("#800080");
    expect(lowerColors("color-mix(in srgb, red 50%, currentColor)")).toBe("color-mix(in srgb, red 50%, currentColor)");
  });

  test("gradient stops and shorthands", () => {
    expect(lowerColors("linear-gradient(to right, oklch(0.5 0.1 100), #fff)")).toBe("linear-gradient(to right, #71640b, #fff)");
    expect(lowerColors("1px solid oklch(0.5 0.1 100)")).toBe("1px solid #71640b");
  });

  test("plain values are untouched", () => {
    expect(lowerColors("#abc")).toBe("#abc");
    expect(lowerColors("rgb(1 2 3)")).toBe("rgb(1 2 3)");
  });
});

describe("computeValues", () => {
  const run = (values: Record<string, string>) => {
    const ctx = testCtx();
    return { style: computeValues({ values, authored: new Set() }, undefined, ctx), ctx };
  };

  test("var() into calc and oklch", () => {
    const { style, ctx } = run({
      "--spacing": "0.25rem",
      "--c": "oklch(51.1% 0.262 276.966)",
      "padding-top": "calc(var(--spacing) * 6)",
      "line-height": "calc(1.25 / 0.875)",
      color: "var(--c)",
      "border-top-color": "color-mix(in oklab, var(--c) 50%, transparent)",
    });
    expect(style["padding-top"]).toBe("24px");
    expect(style["line-height"]).toBe("1.4286");
    expect(style.color).toBe("#4f39f6");
    expect(style["border-top-color"]).toBe("rgba(79, 57, 246, 0.5)");
    expect(codesOf(ctx)).toEqual([]);
  });

  test("a colour that can't be lowered is dropped with a W001 at the source", () => {
    const { style, ctx } = run({ color: "color-mix(in srgb, red 50%, Canvas)" });
    expect(style.color).toBeUndefined();
    expect(codesOf(ctx)).toEqual(["W001"]);
    expect(ctx.diagnostics.list()[0]?.hint).toMatch(/hex/);
  });

  test("colour-looking text in strings and urls is kept", () => {
    const { style, ctx } = run({ "font-family": '"color(Pro)", Arial', "background-image": 'url("/img/lab(1).png")' });
    expect(style["font-family"]).toBe('"color(Pro)", Arial');
    expect(style["background-image"]).toBe('url("/img/lab(1).png")');
    expect(codesOf(ctx)).toEqual([]);
  });

  test("currentColor in color-mix is the element's colour, or the parent's for color itself", () => {
    const ctx = testCtx();
    const style = computeValues(
      {
        values: {
          "border-top-color": "color-mix(in srgb, currentColor 50%, transparent)",
          color: "color-mix(in srgb, red 50%, currentColor)",
        },
        authored: new Set(),
      },
      { color: "#0000ff" },
      ctx,
    );
    expect(style.color).toBe("#800080");
    expect(style["border-top-color"]).toBe("rgba(128, 0, 128, 0.5)");
    expect(codesOf(ctx)).toEqual([]);
  });

  test("font-size folds calc() before reading % and keywords", () => {
    const { style, ctx } = run({ "font-size": "calc(120%)", "padding-top": "1em" });
    expect(style["font-size"]).toBe("19.2px");
    expect(style["padding-top"]).toBe("19.2px");
    expect(codesOf(ctx)).toEqual([]);
    expect(codesOf(run({ "font-size": "calc(10)" }).ctx)).toEqual(["E006"]);
    expect(codesOf(run({ "font-size": "10" }).ctx)).toEqual(["E006"]);
  });

  test("Tailwind's calc(50% - 0.5rem) basis reaches the flex rule folded", () => {
    expect(run({ "flex-basis": "calc(50% - 0.5rem)" }).style["flex-basis"]).toBe("calc(50% - 8px)");
  });

  test("calc(P% - Npx) widths still pass through", () => {
    expect(run({ width: "calc(50% - calc(2 * 8px))" }).style.width).toBe("calc(50% - 16px)");
  });

  test("an irreducible calc elsewhere is still E006", () => {
    expect(codesOf(run({ "padding-top": "calc(100% - 4px)" }).ctx)).toEqual(["E006"]);
  });
});

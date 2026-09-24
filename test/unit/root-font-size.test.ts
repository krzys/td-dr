import { describe, expect, test } from "vitest";
import { computeValues } from "../../src/style/inherit.ts";
import { parseMedia } from "../../src/style/media.ts";
import { reduceMath, resolveFontSize, toPx } from "../../src/style/units.ts";
import type { StyledElement, StyledNode } from "../../src/style/types.ts";
import { styledDocFrom, testCtx } from "../helpers/index.ts";

const find = (n: StyledNode, cls: string): StyledElement | undefined => {
  if (n.type !== "element") return undefined;
  if (n.attrs["class"] === cls) return n;
  for (const c of n.children) {
    const hit = find(c, cls);
    if (hit) return hit;
  }
  return undefined;
};

// the computed style of the element with class "t"
const styleOf = (css: string, body = '<p class="t">x</p>') => {
  const doc = styledDocFrom(`<html><head><style>${css}</style></head><body>${body}</body></html>`);
  return find(doc.body, "t")!.style;
};

describe("units with a root font-size", () => {
  const f = { em: 10, rem: 20 };

  test("rem reads the root size, em the element's", () => {
    expect(toPx("1rem 1em", f)).toBe("20px 10px");
    expect(reduceMath("calc(1rem + 1em)", f)).toBe("30px");
    expect(reduceMath("min(1rem, 15px) max(1rem, 15px) clamp(1px, 2rem, 30px)", f)).toBe("15px 20px 30px");
    expect(reduceMath("calc(50% - 0.5rem)", f)).toBe("calc(50% - 10px)");
  });

  test("font-size: rem the root's, em and % the parent's, keywords their own table", () => {
    expect(resolveFontSize("2rem", f)).toBe("40px");
    expect(resolveFontSize("2em", f)).toBe("20px");
    expect(resolveFontSize("150%", f)).toBe("15px");
    expect(resolveFontSize("calc(1rem + 1em)", f)).toBe("30px");
    expect(resolveFontSize("medium", f)).toBe("16px");
    expect(resolveFontSize("large", f)).toBe("18px");
  });
});

describe("computeValues", () => {
  const values = (v: Record<string, string>) => ({ values: v, authored: new Set<string>() });

  test("rem is what the caller says the root is", () => {
    const s = computeValues(values({ "padding-top": "1rem", "font-size": "2rem" }), { "font-size": "12px" }, testCtx(), undefined, 10);
    expect(s["font-size"]).toBe("20px");
    expect(s["padding-top"]).toBe("10px");
  });

  test("on the root, font-size is relative to 16px and the rest to that font-size", () => {
    const root = computeValues(values({ "font-size": "2rem", "padding-top": "1rem", "margin-top": "1em" }), undefined, testCtx(), undefined, "root");
    expect(root["font-size"]).toBe("32px");
    expect(root["padding-top"]).toBe("32px");
    expect(root["margin-top"]).toBe("32px");
    expect(computeValues(values({ "font-size": "150%" }), undefined, testCtx(), undefined, "root")["font-size"]).toBe("24px");
    expect(computeValues(values({ "font-size": "1.25em" }), undefined, testCtx(), undefined, "root")["font-size"]).toBe("20px");
  });

  test("without a root size, rem is 16px", () => {
    expect(computeValues(values({ "padding-top": "1rem", "font-size": "10px" }), undefined, testCtx())["padding-top"]).toBe("16px");
  });
});

describe("rem through the style stage", () => {
  test.each([
    ["10px", "10px"],
    ["62.5%", "10px"],
    ["1.25em", "20px"],
    ["1.5rem", "24px"],
    ["large", "18px"],
    ["x-small", "10px"],
  ])("html { font-size: %s } makes 1rem %s", (size, px) => {
    const s = styleOf(`html{font-size:${size}} .t{padding-top:1rem;width:10rem;font-size:1rem}`);
    expect(s["padding-top"]).toBe(px);
    expect(s["font-size"]).toBe(px);
    expect(s["width"]).toBe(`${Number.parseFloat(px) * 10}px`);
  });

  test(":root works like html", () => {
    expect(styleOf(":root{font-size:20px} .t{margin-top:0.5rem}")["margin-top"]).toBe("10px");
  });

  test("rem stays the root's through several levels of em font sizes", () => {
    const body = '<div style="font-size:1.5em"><div style="font-size:0.5em"><p class="t">x</p></div></div>';
    const s = styleOf("html{font-size:20px} .t{padding-top:1rem;padding-bottom:1em;font-size:1em}", body);
    expect(s["font-size"]).toBe("15px");
    expect(s["padding-top"]).toBe("20px");
    expect(s["padding-bottom"]).toBe("15px");
  });

  test("rem inside calc(), min(), max() and clamp()", () => {
    const s = styleOf("html{font-size:10px} .t{padding-top:calc(1rem + 2px);padding-right:min(3rem, 50px);padding-bottom:max(1rem, 5px);padding-left:clamp(1px, 2rem, 100px);font-size:clamp(1rem, 1.4rem, 2rem)}");
    expect([s["padding-top"], s["padding-right"], s["padding-bottom"], s["padding-left"], s["font-size"]]).toEqual(["12px", "30px", "10px", "20px", "14px"]);
  });

  test("a custom property holding rem resolves against the root wherever it is used", () => {
    const body = '<div style="font-size:30px"><p class="t">x</p></div>';
    const s = styleOf("html{font-size:10px;--gap:2rem} .t{padding-top:var(--gap);margin-top:calc(var(--gap) * 2)}", body);
    expect(s["padding-top"]).toBe("20px");
    expect(s["margin-top"]).toBe("40px");
  });

  test("line-height and letter-spacing in rem", () => {
    const s = styleOf("html{font-size:10px} .t{font-size:16px;line-height:2rem;letter-spacing:0.1rem}");
    expect(s["line-height"]).toBe("20px");
    expect(s["letter-spacing"]).toBe("1px");
  });

  test("the root's own padding in rem uses its own font-size", () => {
    const doc = styledDocFrom("<html><head><style>html{font-size:20px;padding-top:1rem}</style></head><body><p>x</p></body></html>");
    expect(doc.body.parentStyle?.["padding-top"]).toBe("20px");
  });

  test("keyword sizes don't follow the root", () => {
    expect(styleOf("html{font-size:10px} .t{font-size:medium}")["font-size"]).toBe("16px");
  });

  test("a fragment with no root font-size keeps 16px", () => {
    const doc = styledDocFrom('<p class="t" style="padding:1rem;font-size:0.875rem;line-height:1.5rem">x</p>');
    const s = find(doc.body, "t")!.style;
    expect([s["padding-top"], s["font-size"], s["line-height"]]).toEqual(["16px", "14px", "24px"]);
  });

  test("a style attribute on html sets the root size too", () => {
    const styled = styledDocFrom('<html style="font-size:12px"><body><p class="t" style="margin-top:1rem">x</p></body></html>');
    expect(find(styled.body, "t")!.style["margin-top"]).toBe("12px");
  });
});

describe("media queries ignore the root font-size", () => {
  test("em and rem in a width query are 16px", () => {
    expect(parseMedia("(max-width: 30em)")[0]).toMatchObject({ lo: 0, hi: 480 });
    expect(parseMedia("(min-width: 40rem)")[0]).toMatchObject({ lo: 640, hi: Infinity });
  });

  test("with html at 10px, (max-width: 30em) still splits at 480px", () => {
    const html = "<html><head><style>html{font-size:10px} @media (max-width:30em){.t{padding-top:1rem}}</style></head><body><p class=\"t\">x</p></body></html>";
    expect(styledDocFrom(html).conditions.ranges).toEqual([{ min: 0, max: 480 }]);
    const at = (viewport: number) => find(styledDocFrom(html, testCtx(), { viewport, dark: false, hover: false }).body, "t")!.style["padding-top"];
    expect(at(400)).toBe("10px");
    expect(at(480)).toBe("10px");
    expect(at(481)).toBeUndefined();
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { codesOf, styledDocFrom, testCtx } from "../helpers/index.ts";
import { DESKTOP, type Env, type StyledElement } from "../../src/style/types.ts";

const phone: Env = { ...DESKTOP, viewport: 375 };
const find = (n: StyledElement, tag: string): StyledElement | undefined =>
  n.tag === tag ? n : n.children.flatMap((c) => (c.type === "element" ? [find(c, tag)] : [])).find(Boolean);

const run = (html: string, env: Env = DESKTOP) => {
  const ctx = testCtx();
  const doc = styledDocFrom(html, ctx, env);
  return { ctx, doc, p: find(doc.body, "p")!.style };
};

const text = '<p style="font-size:5vw;line-height:clamp(20px,6vw,30px);letter-spacing:1vw;word-spacing:1vw;text-indent:2vw;width:10vw;padding-left:5vw">x</p>';

describe("vw on text properties stays live on phones", () => {
  test("narrow env keeps the authored value, layout props resolve at the design width", () => {
    const { p, ctx } = run(text, phone);
    expect(p["font-size"]).toBe("5vw");
    expect(p["line-height"]).toBe("clamp(20px,6vw,30px)");
    expect(p["letter-spacing"]).toBe("1vw");
    expect(p["word-spacing"]).toBe("1vw");
    expect(p["text-indent"]).toBe("2vw");
    expect(p["width"]).toBe("60px");
    expect(p["padding-left"]).toBe("30px");
    expect(codesOf(ctx)).toContain("I006");
  });

  test("desktop resolves everything to px", () => {
    const { p, ctx } = run(text);
    expect(p["font-size"]).toBe("30px");
    expect(p["line-height"]).toBe("30px");
    expect(p["letter-spacing"]).toBe("6px");
    expect(p["width"]).toBe("60px");
    expect(codesOf(ctx)).toContain("I006");
  });

  test("a font shorthand and a max() stay live too", () => {
    expect(run('<p style="font:5vw/1.2 Arial">x</p>', phone).p["font-size"]).toBe("5vw");
    expect(run('<p style="font-size:max(14px,4vw)">x</p>', phone).p["font-size"]).toBe("max(14px,4vw)");
  });

  test("an env at the design width resolves", () => {
    expect(run(text, { ...DESKTOP, viewport: 600 }).p["font-size"]).toBe("30px");
  });
});

describe("conditions.ranges for live text", () => {
  const ranges = (html: string) => run(html).doc.conditions.ranges;

  test("no vw text, no range", () => {
    expect(ranges('<p style="font-size:20px">x</p>')).toEqual([]);
    expect(ranges('<p style="width:5vw">x</p>')).toEqual([]);
  });

  test("a range ends at the design width minus one", () => {
    expect(ranges('<p style="font-size:5vw">x</p>')).toEqual([{ min: 0, max: 599 }]);
  });

  test("author width edges merge in, the design-width one still splits", () => {
    const html = (q: string) => `<style>@media (${q}){p{color:red}}</style><p style="font-size:5vw">x</p>`;
    expect(ranges(html("max-width:599px"))).toEqual([{ min: 0, max: 599 }]);
    expect(ranges(html("max-width:480px"))).toEqual([{ min: 481, max: 599 }, { min: 0, max: 480 }]);
    expect(ranges(html("max-width:700px"))).toEqual([{ min: 600, max: 700 }, { min: 0, max: 599 }]);
  });

  test("a vw font-size inside a media query counts in desktop too", () => {
    expect(ranges('<style>@media (max-width:599px){p{font-size:5vw!important}}</style><p style="font-size:30px">x</p>')).toEqual([{ min: 0, max: 599 }]);
  });
});

describe("layout math under a live font-size stays at the design width", () => {
  const h1 = '<h1 style="font-size:5vw;padding:1em;line-height:120%;letter-spacing:.05em"><span style="font-size:.6em">x</span></h1>';
  const both = (html: string, tag: string) => [phone, DESKTOP].map((env) => find(styledDocFrom(html, testCtx(), env).body, tag)!.style);

  test("UA margins, padding:1em, width:10em and line-height % match desktop", () => {
    const [n, d] = both('<p style="font-size:5vw">x</p>', "p");
    expect(n!["margin-top"]).toBe("30px");
    expect(n!["margin-bottom"]).toBe(d!["margin-bottom"]);
    const [n2, d2] = both('<p style="font-size:5vw;padding:1em;width:10em;line-height:120%">x</p>', "p");
    for (const k of ["padding-top", "width"]) expect(n2![k], k).toBe(d2![k]);
    expect(n2!["padding-top"]).toBe("30px");
    expect(n2!["width"]).toBe("300px");
    expect(n2!["line-height"]).toBe("calc(1.2 * 5vw)");
    expect(d2!["line-height"]).toBe("36px");
    expect(n2!["font-size"]).toBe("5vw");
  });

  test("an em child of a live font-size is a live expression, never 9.6px", () => {
    const [n, d] = both(h1, "span");
    expect(n!["font-size"]).toBe("calc(0.6 * 5vw)");
    expect(d!["font-size"]).toBe("18px");
    const [hn, hd] = both(h1, "h1");
    expect(hn!["letter-spacing"]).toBe("calc(0.05 * 5vw)");
    expect(hd!["letter-spacing"]).toBe("1.5px");
  });

  test("an inheriting child shows the live value", () => {
    expect(find(styledDocFrom('<div style="font-size:5vw"><b>x</b></div>', testCtx(), phone).body, "b")!.style["font-size"]).toBe("5vw");
  });
});

describe("var() holding a viewport unit", () => {
  const html = "<style>:root{--f:5vw} p{font-size:var(--f)}</style><p>x</p>";
  test("resolves at the design width, with I006 and no range (follow-up: tokens stay live)", () => {
    const r = run(html, phone);
    expect(r.p["font-size"]).toBe("30px");
    expect(codesOf(r.ctx)).toContain("I006");
    expect(r.doc.conditions.ranges).toEqual([]);
  });
});

describe("a non-default design width", () => {
  const html = '<p style="font-size:5vw">x</p>';
  test("the range ends one below it and a 620px env stays live", () => {
    const ctx = testCtx({ width: 640 });
    const live = styledDocFrom(html, ctx, { ...DESKTOP, viewport: 620 });
    expect(find(live.body, "p")!.style["font-size"]).toBe("5vw");
    const doc = styledDocFrom(html, testCtx({ width: 640 }), DESKTOP);
    expect(doc.conditions.ranges).toEqual([{ min: 0, max: 639 }]);
    expect(find(doc.body, "p")!.style["font-size"]).toBe("32px");
  });
});

describe("what gets the live flag and the range", () => {
  const ranges = (html: string) => run(html).doc.conditions.ranges;
  test("a media query that never holds below the design width adds no range", () => {
    expect(ranges("<style>@media (min-width:700px){p{font-size:5vw}}</style><p>x</p>").some((r) => r.max === 599)).toBe(false);
  });
  test("vw flags are per longhand", () => {
    const { doc } = run('<p style="padding:0 5vw">x</p>');
    expect([...find(doc.body, "p")!.vwProps!].sort()).toEqual(["padding-left", "padding-right"]);
  });
});

describe("line-height and letter-spacing follow a live font-size", () => {
  const lh = (html: string, prop = "line-height") => run(html, phone).p[prop];
  test("a unitless line-height is a live calc, never NaNpx or a design px", () => {
    expect(lh('<p style="font-size:5vw;line-height:1.2">x</p>')).toBe("calc(1.2 * 5vw)");
    expect(lh('<p style="font:5vw/1.2 Arial">x</p>')).toBe("calc(1.2 * 5vw)");
    expect(lh('<p style="font-size:clamp(20px,6vw,32px);line-height:1.2">x</p>')).toBe("calc(1.2 * clamp(20px,6vw,32px))");
    expect(lh('<div style="font-size:5vw;line-height:1.5"><p>x</p></div>')).toBe("calc(1.5 * 5vw)");
  });
  test("em and % scale live too; desktop keeps px", () => {
    expect(lh('<p style="font-size:5vw;line-height:1.2em">x</p>')).toBe("calc(1.2 * 5vw)");
    expect(lh('<p style="font-size:5vw;line-height:120%">x</p>')).toBe("calc(1.2 * 5vw)");
    expect(lh('<p style="font-size:5vw;letter-spacing:.05em">x</p>', "letter-spacing")).toBe("calc(0.05 * 5vw)");
    expect(run('<p style="font-size:5vw;line-height:1.2em">x</p>').p["line-height"]).toBe("36px");
  });
  test("a px font-size is untouched", () => {
    expect(lh('<p style="font-size:20px;line-height:1.2">x</p>')).toBe("1.2");
  });
  test("larger / smaller under a live parent are live steps", () => {
    const html = (k: string) => `<div style="font-size:5vw"><span style="font-size:${k}">x</span></div>`;
    const span = (k: string) => find(styledDocFrom(html(k), testCtx(), phone).body, "span")!.style["font-size"];
    expect(span("larger")).toBe("calc(1.2 * 5vw)");
    expect(span("smaller")).toBe("calc(0.8333 * 5vw)");
  });
});

describe("fixture vw-clamp-heading in the narrow env", () => {
  test("font-size and line-height both stay live", () => {
    const input = readFileSync(new URL("../fixtures/responsive/vw-clamp-heading/input.html", import.meta.url), "utf8");
    const h = find(styledDocFrom(input, testCtx(), phone).body, "h1")!.style;
    expect(h["font-size"]).toBe("clamp(20px, 6vw, 32px)");
    expect(h["line-height"]).toBe("calc(1.2 * clamp(20px, 6vw, 32px))");
  });
});

describe("the media check for live text", () => {
  const has = (q: string, decl: string) => run(`<style>@media ${q}{p{${decl}}}</style><p>x</p>`).doc.conditions.ranges.some((r) => r.max === 599);
  test("a query that never holds below the design width adds no range, its negation does", () => {
    expect(has("(min-width:700px)", "font-size:5vw")).toBe(false);
    expect(has("not all and (min-width:700px)", "font-size:5vw")).toBe(true);
    expect(has("not all and (min-width:700px)", "color:red")).toBe(false);
  });
});

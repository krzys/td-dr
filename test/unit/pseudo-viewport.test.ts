import { describe, expect, test } from "vitest";
import { compile } from "../../src/index.ts";
import { literalContent } from "../../src/style/pseudo.ts";
import { pseudoTarget } from "../../src/style/selectors.ts";
import { resolveViewport } from "../../src/style/units.ts";
import { codesOf, styledFrom, testCtx } from "../helpers/index.ts";
import type { StyledElement } from "../../src/style/types.ts";

describe("literalContent", () => {
  test("strings, joined strings and escapes", () => {
    expect(literalContent('"a"')).toBe("a");
    expect(literalContent("'a' \"b\"")).toBe("ab");
    expect(literalContent('"a\\A b"')).toBe("a\nb");
    expect(literalContent('"\\2192 "')).toBe("→");
    expect(literalContent('"say \\"hi\\""')).toBe('say "hi"');
  });

  test("anything else is not literal", () => {
    for (const v of ["none", "normal", "open-quote", "attr(href)", '"a" attr(href)', "counter(x)", "url(a.png)", '"a""b"', ""]) {
      expect(literalContent(v)).toBeUndefined();
    }
  });
});

describe("pseudoTarget", () => {
  test("splits subject and side", () => {
    expect(pseudoTarget("a.x::before")).toEqual({ base: "a.x", which: "before" });
    expect(pseudoTarget("p:after")).toEqual({ base: "p", which: "after" });
    expect(pseudoTarget("::before")).toEqual({ base: "*", which: "before" });
  });

  test("a trailing combinator means the children: * is the subject", () => {
    expect(pseudoTarget(".a :before")).toEqual({ base: ".a *", which: "before" });
    expect(pseudoTarget(".a > ::before")).toEqual({ base: ".a > *", which: "before" });
    expect(pseudoTarget(".a + ::after")).toEqual({ base: ".a + *", which: "after" });
    expect(pseudoTarget(".a ~ ::after")).toEqual({ base: ".a ~ *", which: "after" });
  });

  test("state or a second pseudo-element keeps it out", () => {
    expect(pseudoTarget("a:hover::before")).toBeUndefined();
    expect(pseudoTarget("p::first-line")).toBeUndefined();
    expect(pseudoTarget("p::before::after")).toBeUndefined();
  });
});

describe("resolveViewport", () => {
  const seen: Array<[string, string]> = [];
  const r = (v: string, w = 600) => resolveViewport(v, w, (t, px) => seen.push([t, px]));

  test("vw, vmin, vmax at the design width, also inside math", () => {
    expect(r("5vw")).toBe("30px");
    expect(r("0 5VW")).toBe("0 30px");
    expect(r("clamp(16px, 4vw, 24px)")).toBe("clamp(16px, 24px, 24px)");
    expect(r("calc(100% - 2vmax)")).toBe("calc(100% - 12px)");
    expect(r("10vw", 480)).toBe("48px");
  });

  test("heights, strings and urls are left alone", () => {
    expect(r("50vh")).toBe("50vh");
    expect(r('"5vw"')).toBe('"5vw"');
    expect(r("url(a5vw.png)")).toBe("url(a5vw.png)");
    expect(r("--x5vw")).toBe("--x5vw");
    expect(r("var(--x-5vw)")).toBe("var(--x-5vw)");
    expect(r("a-5vw")).toBe("a-5vw");
    expect(r("0 -5vw")).toBe("0 -30px");
  });
});

const find = (n: StyledElement, tag: string): StyledElement | undefined =>
  n.tag === tag ? n : n.children.flatMap((c) => (c.type === "element" ? [find(c, tag)] : [])).find(Boolean);

describe("viewport units in the style stage", () => {
  test("padding, font-size and clamp resolve; one I006 per distinct value", () => {
    const ctx = testCtx();
    const root = styledFrom('<p style="padding:0 5vw;font-size:clamp(16px,4vw,24px)">a</p><p style="margin-left:5vw">b</p>', ctx);
    const p = find(root, "p")!;
    expect(p.style["padding-left"]).toBe("30px");
    expect(p.style["font-size"]).toBe("24px");
    expect(codesOf(ctx)).toEqual(["I006", "I006"]);
    expect(ctx.diagnostics.list()[0]!.message).toContain("5vw resolved to 30px");
  });

  test("follows the width option", () => {
    const ctx = testCtx({ width: 480 });
    expect(find(styledFrom('<p style="padding-left:10vw">a</p>', ctx), "p")!.style["padding-left"]).toBe("48px");
  });

  test("small, large and dynamic variants resolve", () => {
    for (const unit of ["svw", "lvw", "dvw"]) expect(resolveViewport(`10${unit}`, 600, () => {})).toBe("60px");
    expect(resolveViewport("10svmin", 600, () => {})).toBe("60px");
    expect(resolveViewport("10dvmax", 600, () => {})).toBe("60px");
  });

  test("vb, svh and dvh stay E006", () => {
    for (const unit of ["vb", "svh", "dvh"]) {
      const ctx = testCtx({ strict: false });
      styledFrom(`<p style="padding-left:10${unit}">a</p>`, ctx);
      expect(codesOf(ctx)).toContain("E006");
    }
  });

  test("vh stays an error", () => {
    const ctx = testCtx({ strict: false });
    styledFrom('<p style="padding-left:10vh">a</p>', ctx);
    expect(codesOf(ctx)).toContain("E006");
  });
});

describe("pseudo text on replaced and foreign hosts", () => {
  test("svg, textarea and img get nothing inserted", () => {
    const ctx = testCtx({ strict: false });
    const root = styledFrom(
      '<style>svg::before{content:"X"} textarea::before{content:"X"} img::after{content:"X"}</style><svg><rect/></svg><textarea>t</textarea><img src="a.png">',
      ctx,
    );
    const kids = (tag: string) => find(root, tag)?.children ?? [];
    expect(kids("svg").some((c) => c.type === "element" && c.tag === "span")).toBe(false);
    expect(kids("textarea").some((c) => c.type === "element" && c.tag === "span")).toBe(false);
    expect(find(root, "img")?.children ?? []).toEqual([]);
  });
});

describe("static ::before / ::after", () => {
  const styled = (css: string, body = '<p class="b" style="color:#336699">x</p>') => {
    const ctx = testCtx({ strict: false });
    return { p: find(styledFrom(`<style>${css}</style>${body}`, ctx), "p")!, ctx };
  };

  test("text goes first and last, styled by the rule and inheriting the rest", () => {
    const { p, ctx } = styled('.b::before{content:"<"; font-weight:bold} .b::after{content:">"}');
    expect(p.children).toHaveLength(3);
    const [before, , after] = p.children as StyledElement[];
    expect(before!.tag).toBe("span");
    expect(before!.style["font-weight"]).toBe("bold");
    expect(before!.style["color"]).toBe("#336699");
    expect(before!.declared).toEqual({ "font-weight": "bold" });
    expect(after!.declared).toEqual({});
    expect(codesOf(ctx)).toEqual([]);
  });

  test("display:block in a paragraph stays a span and reports I003; the single-colon form works", () => {
    const { p, ctx } = styled('.b:before{content:"a"; display:block}');
    expect((p.children[0] as StyledElement).tag).toBe("span");
    expect((p.children[0] as StyledElement).style["display"]).toBe("block");
    expect(codesOf(ctx)).toEqual(["I003"]);
  });

  test("display:block in a div becomes a div, no diagnostic", () => {
    const ctx = testCtx({ strict: false });
    const d = find(styledFrom('<style>.b::before{content:"a"; display:block}</style><div class="b">x</div>', ctx), "div")!;
    expect((d.children[0] as StyledElement).tag).toBe("div");
    expect(codesOf(ctx)).toEqual([]);
  });

  test("empty string inserts nothing, quietly", () => {
    const { p, ctx } = styled('.b::before{content:""}');
    expect(p.children).toHaveLength(1);
    expect(codesOf(ctx)).toEqual([]);
  });

  test("a later content: none beats an earlier string, like the cascade, without a warning", () => {
    const { p, ctx } = styled('.b::before{content:"X"} .b.h::before{content:none}', '<p class="b h">x</p>');
    expect(p.children).toHaveLength(1);
    expect(codesOf(ctx)).toEqual([]);
    const other = styled('.b::before{content:"X"} .b.h::before{content:none}', '<p class="b">x</p>');
    expect(other.p.children).toHaveLength(2);
  });

  test("a later attr() beats an earlier string and warns", () => {
    const { p, ctx } = styled('.b::before{content:"X"} .b::before{content:attr(title)}');
    expect(p.children).toHaveLength(1);
    expect(codesOf(ctx)).toEqual(["W001"]);
  });

  test("hosts that can't hold text are skipped with W001", () => {
    const ctx = testCtx({ strict: false });
    const root = styledFrom('<style>tr::after{content:"X"} table::before{content:"T"}</style><table><tr><td>a</td></tr></table>', ctx);
    expect(find(root, "tr")!.children).toHaveLength(1);
    expect(find(root, "table")!.children.every((c) => c.type === "element" && c.tag !== "span")).toBe(true);
    expect(codesOf(ctx)).toEqual(["W001", "W001"]);
  });

  test("nested &::before and a flex container host", () => {
    const ctx = testCtx({ strict: false });
    const root = styledFrom('<style>.n{ &::before{content:"x"} } .row{display:flex} .row::before{content:"y"}</style><p class="n">a</p><div class="row"><i>b</i></div>', ctx);
    expect((find(root, "p")!.children[0] as StyledElement).tag).toBe("span");
    const row = find(root, "div")!;
    expect((row.children[0] as StyledElement).style["display"]).toBe("block");
    expect(codesOf(ctx)).toEqual([]);
  });

  test("content and other declarations cascade across rules", () => {
    const { p } = styled('.b::before{content:"a"} p::before{color:red}');
    expect((p.children[0] as StyledElement).style["color"]).toBe("red");
  });

  test("anything but a plain string is skipped with W001", () => {
    for (const content of ["attr(title)", "open-quote", "none"]) {
      const { p, ctx } = styled(`.b::before{content:${content}}`);
      expect(p.children).toHaveLength(1);
      expect(codesOf(ctx)).toEqual(["W001"]);
    }
  });

  test(":hover::before stays skipped", () => {
    const { p, ctx } = styled('.b:hover::before{content:"x"}');
    expect(p.children).toHaveLength(1);
    expect(codesOf(ctx)).toEqual(["W001"]);
  });

  test("inserted text is escaped in the output", () => {
    const { html } = compile('<style>p::before{content:"<b>&"}</style><p>x</p>');
    expect(html).toContain("&lt;b&gt;&amp;");
    expect(html).not.toContain("<b>&");
  });
});

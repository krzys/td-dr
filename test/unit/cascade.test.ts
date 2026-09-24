import { describe, expect, test } from "vitest";
import type { CompileOptions } from "../../src/ctx.ts";
import { findElement } from "../../src/parse/dom.ts";
import { parse } from "../../src/parse/html.ts";
import { cascade } from "../../src/style/cascade.ts";
import { codesOf, styledFrom, testCtx } from "../helpers/index.ts";
import { DESKTOP, type StyledElement } from "../../src/style/types.ts";

const run = (html: string, tag = "p", o: CompileOptions = {}) => {
  const ctx = testCtx(o);
  const doc = parse(html, ctx);
  const el = findElement(doc.body, (e) => e.name === tag)!;
  return { ...cascade(doc, ctx, DESKTOP).styleOf(el), ctx };
};
const styled = (css: string, body = '<p id="a" class="b">x</p>') => run(`<style>${css}</style>${body}`);

describe("cascade", () => {
  test("more specific selector wins regardless of order", () => {
    expect(styled("#a{color:red} .b{color:blue} p{color:green}").values["color"]).toBe("red");
  });

  test("later rule wins on a tie", () => {
    expect(styled(".b{color:red} .b{color:blue}").values["color"]).toBe("blue");
  });

  test("!important beats specificity, and is stripped from the value", () => {
    expect(styled("p{color:red !important} #a{color:blue}").values["color"]).toBe("red");
  });

  test("style attribute beats selectors, but not their !important", () => {
    expect(run('<style>#a{color:red}</style><p id="a" style="color:blue">x</p>').values["color"]).toBe("blue");
    expect(run('<style>#a{color:red!important}</style><p id="a" style="color:blue">x</p>').values["color"]).toBe("red");
    expect(run('<style>#a{color:red!important}</style><p id="a" style="color:blue !important">x</p>').values["color"]).toBe("blue");
  });

  test("extra css comes after <style> blocks", () => {
    const r = run("<style>p{color:red}</style><p>x</p>", "p", { css: ["p{color:blue}"] });
    expect(r.values["color"]).toBe("blue");
  });

  test("author beats UA, UA fills the rest", () => {
    const r = styled("p{margin-top:3px}");
    expect(r.values["margin-top"]).toBe("3px");
    expect(r.values["margin-bottom"]).toBe("1em");
    expect(r.values["display"]).toBe("block");
  });

  test("authored holds only author longhands", () => {
    const r = styled("p{margin-top:3px}", '<p style="Color: red">x</p>');
    expect([...r.authored].sort()).toEqual(["color", "margin-top"]);
  });

  test("property names are lowercased, custom properties are not", () => {
    const r = styled("p{COLOR: red; --Brand:  #fff }");
    expect(r.values["color"]).toBe("red");
    expect(r.values["--Brand"]).toBe("#fff");
  });

  test("empty values are ignored", () => {
    expect(styled("p{color:}").values["color"]).toBeUndefined();
  });

  test(":hover on the subject is quiet and does not apply on desktop", () => {
    const r = run('<style>a:hover{color:red}</style><a href="#">x</a>', "a");
    expect(codesOf(r.ctx)).toEqual([]);
    expect(r.values["color"]).not.toBe("red");
  });

  test(":hover elsewhere is skipped with W001", () => {
    const r = styled(".c:hover p{color:red}", '<div class="c"><p>x</p></div>');
    expect(codesOf(r.ctx)).toEqual(["W001"]);
  });

  test("::before with content other than a string is skipped with W001", () => {
    expect(codesOf(styled("p::before{content:attr(title)}").ctx)).toEqual(["W001"]);
  });

  test("an @media with an unsupported feature is not applied and reports W001 with a loc", () => {
    const r = styled("@media (orientation:landscape){p{color:red}}");
    expect(r.values["color"]).toBeUndefined();
    const d = r.ctx.diagnostics.list();
    expect(d.map((x) => x.code)).toEqual(["W001"]);
    expect(d[0]?.loc).toEqual({ line: 1, col: 8 });
  });

  test("silent at-rules", () => {
    const r = styled("@charset 'utf-8'; @keyframes k{from{color:red}} p{color:red}");
    expect(codesOf(r.ctx)).toEqual([]);
    expect(r.values["color"]).toBe("red");
  });

  test("broken CSS gives W002 on the right line", () => {
    const r = run("<p>x</p>\n<style>\np{color:red}\n}\n</style>");
    const d = r.ctx.diagnostics.list();
    expect(d.map((x) => x.code)).toEqual(["W002"]);
    expect(d[0]?.loc?.line).toBe(4);
  });

  test("broken CSS on the style tag's first line offsets the column", () => {
    const r = run("<style>}</style><p>x</p>");
    expect(r.ctx.diagnostics.list()[0]?.loc).toEqual({ line: 1, col: 8 });
  });

  test("bad selector gives W002", () => {
    expect(codesOf(styled("p:nope-not-real{color:red}").ctx)).toEqual(["W002"]);
  });

  test("broken style attribute gives W002 at the element", () => {
    const r = run('\n<p style="color:red}">x</p>');
    const d = r.ctx.diagnostics.list();
    expect(d.map((x) => x.code)).toEqual(["W002"]);
    expect(d[0]?.loc?.line).toBe(2);
  });

  test("unlayered beats layered; layers fixed by the statement", () => {
    const css = "@layer a, b; @layer b{p{color:blue}} @layer a{p{color:green}} ";
    expect(styled(css).values["color"]).toBe("blue");
    expect(styled(css + "p{color:red}").values["color"]).toBe("red");
  });

  test("layer order follows first appearance without a statement", () => {
    expect(styled("@layer x{p{color:red}} @layer y{p{color:blue}}").values["color"]).toBe("blue");
  });

  test("layered !important flips the order", () => {
    const r = styled("@layer a, b; @layer a{p{color:green!important}} @layer b{p{color:blue!important}} p{color:red!important}");
    expect(r.values["color"]).toBe("green");
  });

  test("nested layers are their own layers, in first-appearance order", () => {
    expect(styled("@layer a{@layer inner{p{color:red}} p{color:blue}}").values["color"]).toBe("red");
  });

  test("IE star and underscore hacks are ignored", () => {
    const r = styled("p{display:inline-block;*display:inline;_height:1px}");
    expect(r.values["display"]).toBe("inline-block");
    expect(r.values["height"]).toBeUndefined();
  });

  test("a rule counts with its best matching selector", () => {
    expect(styled("p, #a{color:red} .b{color:blue}").values["color"]).toBe("red");
  });

  test("a broken second style block keeps the first and points at the second", () => {
    const r = run("<style>p{color:red}</style>\n<style>\n}</style><p>x</p>");
    expect(r.values["color"]).toBe("red");
    const d = r.ctx.diagnostics.list();
    expect(d.map((x) => x.code)).toEqual(["W002"]);
    expect(d[0]?.loc?.line).toBe(3);
  });

  test("rules before a syntax error still apply", () => {
    const r = styled("p{color:red;}\n\n p{margin-top:2px;");
    expect(r.values["color"]).toBe("red");
    expect(codesOf(r.ctx)).toEqual(["W002"]);
  });

  test("inline !important beats layered !important", () => {
    const r = run('<style>@layer a{p{color:red!important}}</style><p style="color:blue!important">x</p>');
    expect(r.values["color"]).toBe("blue");
  });

  test("@layer statement inside a layer orders its sublayers", () => {
    const css = "@layer a{@layer y, x;} @layer a.x{p{color:red}} @layer a.y{p{color:blue}}";
    expect(styled(css).values["color"]).toBe("red");
  });

  test("@scope and other unknown block at-rules report W001", () => {
    const r = styled("@scope (.a){p{color:red}}");
    expect(r.values["color"]).toBeUndefined();
    expect(codesOf(r.ctx)).toEqual(["W001"]);
  });


  test("a style attribute that splits into several rules gives W002", () => {
    const r = run('<p style="color:red} p{color:blue">x</p>');
    expect(codesOf(r.ctx)).toEqual(["W002"]);
  });

  test("an unclosed string in a later rule keeps the earlier rule", () => {
    const r = styled('p{color:red} b{content:"x}');
    expect(r.values["color"]).toBe("red");
    const d = r.ctx.diagnostics.list();
    expect(d.map((x) => x.code)).toEqual(["W002"]);
    expect(d[0]?.loc).toEqual({ line: 1, col: 31 });
  });

  test("an unclosed bracket in a later rule keeps the earlier rule", () => {
    const r = styled("p{color:red} b{background:url(x}");
    expect(r.values["color"]).toBe("red");
    expect(codesOf(r.ctx)).toEqual(["W002"]);
  });

  test("recovery works across lines and reports the right column", () => {
    const r = run('<style>\n\n  p{color:red}\n  q{color:"x}</style><p>x</p>');
    expect(r.values["color"]).toBe("red");
    expect(r.ctx.diagnostics.list()[0]?.loc).toEqual({ line: 4, col: 11 });
  });

  test("a stray } does not take the rest of the sheet with it", () => {
    const r = styled("p{color:red} } p{margin-top:2px}");
    expect(r.values["margin-top"]).toBe("2px");
    expect(codesOf(r.ctx)).toEqual(["W002"]);
  });

  test("one junk declaration only loses itself", () => {
    const r = styled("p{color} p{margin-top:2px}");
    expect(r.values["margin-top"]).toBe("2px");
    expect(codesOf(r.ctx)).toEqual(["W002"]);
  });

  test("IE # hack is ignored", () => {
    const r = styled("p{#color:red; margin-top:1px}");
    expect(r.values).not.toHaveProperty("#color");
    expect(r.authored.has("#color")).toBe(false);
    expect(r.values["margin-top"]).toBe("1px");
  });

  test("repeated property in a style attribute: last wins", () => {
    expect(run('<p style="color:red;color:blue">x</p>').values["color"]).toBe("blue");
  });

  test("later !important wins inside the same tier", () => {
    expect(styled("p{color:red!important} p{color:blue!important}").values["color"]).toBe("blue");
  });
});

describe("cascade recovery keeps what parsed", () => {
  test("many stray braces don't lose the first rule", () => {
    const r = styled(`p{color:red} ${"} ".repeat(120)}`);
    expect(r.values["color"]).toBe("red");
    expect(codesOf(r.ctx)).toContain("W002");
  });

  test("many junk rules don't lose the first rule", () => {
    expect(styled(`p{color:red} ${"q{a} ".repeat(120)}`).values["color"]).toBe("red");
  });

  test("an error without a position keeps the valid prefix", () => {
    const r = styled("p{color:red} : ;");
    expect(r.values["color"]).toBe("red");
    expect(codesOf(r.ctx)).toContain("W002");
  });
});

const pick = (tag: string, html: string) => {
  const ctx = testCtx();
  const find = (e: StyledElement): StyledElement | undefined => {
    if (e.tag === tag) return e;
    for (const k of e.children) if (k.type === "element") { const hit = find(k); if (hit) return hit; }
    return undefined;
  };
  return { style: find(styledFrom(html, ctx))!.style, ctx };
};

describe("nesting", () => {
  test("nested rules apply with & and as descendants", () => {
    const body = '<div class="a"><p class="b">x</p></div>';
    expect(styled(".a{ &>.b{color:red} }", body).values["color"]).toBe("red");
    expect(styled(".a{ .b{color:red} }", body).values["color"]).toBe("red");
    expect(styled(".b{ .a &{color:red} }", body).values["color"]).toBe("red");
    expect(codesOf(styled(".a{ .b{color:red} }", body).ctx)).toEqual([]);
  });

  test("declarations keep source order around nested rules", () => {
    const r = styled(".b{ color:red; &{color:blue} color:green }");
    expect(r.values["color"]).toBe("green");
  });

  test("parent and child lists combine", () => {
    const body = '<div class="y"><p class="b">x</p></div>';
    expect(styled(".x, .y{ .z, .b{color:red} }", body).values["color"]).toBe("red");
  });

  test("& takes the specificity of the whole parent list, like :is()", () => {
    // only .b matches, but & counts as :is(.b, #a): (1,1,0) beats (0,3,0)
    expect(styled(".b, #a{ &.b{color:red} } .b.b.b{color:blue}", '<p class="b">x</p>').values["color"]).toBe("red");
  });

  test("Vue scoped shape: &[data-v] next to nested children, inside @layer", () => {
    const css = "@layer base{ .card{ &[data-v-1]{color:red} & .t[data-v-1]{margin-top:2px} &.f{ &[data-v-1]{color:blue} } } }";
    const r = styled(css, '<div class="card f" data-v-1><p class="t" data-v-1>x</p></div>');
    expect(r.values["margin-top"]).toBe("2px");
    expect(codesOf(r.ctx)).toEqual([]);
    expect(run(`<style>${css}</style><div class="card f" data-v-1>x</div>`, "div").values["color"]).toBe("blue");
  });

  test("nested @media is reported like a top-level one", () => {
    const r = styled("p{ color:red; @media (orientation:landscape){ color:blue } }");
    expect(r.values["color"]).toBe("red");
    expect(codesOf(r.ctx)).toEqual(["W001"]);
  });

  test("nested @supports and @layer hold declarations for the parent", () => {
    expect(styled("p{ color:red; @supports (color: oklch(0 0 0)){ color:blue } }").values["color"]).toBe("blue");
    expect(styled("p{ color:red; @supports (-moz-orient: inline){ color:blue } }").values["color"]).toBe("red");
    expect(styled("@layer a, b; p{ @layer b{ color:blue } @layer a{ color:red } }").values["color"]).toBe("blue");
  });

  test("a dynamic parent still warns, and its children too", () => {
    const r = styled("a:focus{ color:red; & span{color:blue} }", '<a href="#"><span>x</span></a>');
    expect(codesOf(r.ctx)).toEqual(["W001", "W001"]);
    expect(codesOf(styled("a:hover{ color:red; & span{color:blue} }", '<a href="#"><span>x</span></a>').ctx)).toEqual(["W001"]);
  });

  test("nested declarations keep their own location", () => {
    const r = run("<style>\np{\n  .x{\n    margin: 1px 2px 3px 4px 5px;\n  }\n}</style><p>x</p>");
    expect(r.ctx.diagnostics.list().map((d) => [d.code, d.loc])).toEqual([["W002", { line: 4, col: 5 }]]);
  });

  test("a rule in a style attribute is still reported", () => {
    expect(codesOf(run('<p style="color:red; .x{color:blue}">x</p>').ctx)).toEqual(["W001"]);
  });
});

describe("selector noise", () => {
  test("preflight-only selectors are skipped silently", () => {
    const css = ":host{color:red} :-moz-focusring{outline:auto} :-moz-ui-invalid{box-shadow:none} " +
      "::-webkit-search-decoration{appearance:none} ::file-selector-button{margin:0} ::placeholder{opacity:1} " +
      "::backdrop{color:red} ::selection{color:red} p::before{margin:0}";
    expect(codesOf(styled(css).ctx)).toEqual([]);
  });

  test("list markers and first-letter/line are visible, so they warn with a hint", () => {
    for (const sel of ["li::marker", "p::first-letter", "p::first-line"]) {
      const r = styled(`${sel}{color:red}`, "<ul><li>x</li></ul><p>y</p>");
      expect(codesOf(r.ctx), sel).toEqual(["W001"]);
      expect(r.ctx.diagnostics.list()[0]?.hint, sel).toBeTruthy();
    }
    expect(styled("li::marker{color:red}", "<ul><li>x</li></ul>").ctx.diagnostics.list()[0]?.hint).toContain("marker");
  });

  test("the usable part of a list still applies", () => {
    const r = styled("*, ::after, ::before, ::backdrop, ::file-selector-button{margin-top:0} html, :host{color:red}");
    expect(r.values["margin-top"]).toBe("0");
    expect(codesOf(r.ctx)).toEqual([]);
  });

  test("::before with content still warns when its element exists", () => {
    expect(codesOf(styled("p::before{content:attr(title)}").ctx)).toEqual(["W001"]);
    expect(codesOf(styled("q::before{content:attr(title)}").ctx)).toEqual([]);
  });

  test(":hover on something that isn't there is silent", () => {
    expect(codesOf(styled(".nope:hover{color:red}").ctx)).toEqual([]);
    expect(codesOf(styled("p:focus{color:red}").ctx)).toEqual(["W001"]);
  });
});

describe("@supports", () => {
  test("true applies, false skips, both silently", () => {
    const r = styled("@supports (color: color-mix(in lab, red, red)){ p{color:red} } @supports (-webkit-hyphens: none){ p{margin-top:1px} }");
    expect(r.values["color"]).toBe("red");
    expect(r.values["margin-top"]).toBe("1em");
    expect(codesOf(r.ctx)).toEqual([]);
  });

  test("an undecidable condition is skipped with W001 at the rule", () => {
    const r = styled("@supports (margin-trim: inline){ p{color:red} }");
    expect(r.values["color"]).toBeUndefined();
    const d = r.ctx.diagnostics.list();
    expect(d.map((x) => x.code)).toEqual(["W001"]);
    expect(d[0]?.loc).toEqual({ line: 1, col: 8 });
  });

  test("a condition that doesn't parse is W002", () => {
    expect(codesOf(styled("@supports display: flex { p{color:red} }").ctx)).toEqual(["W002"]);
  });

  test("Tailwind's nested shape keeps the lowered colour", () => {
    const css = ".x{ border-color: red; @supports (color: color-mix(in lab, red, red)){ border-color: blue } }";
    const r = styled(css, '<p class="x">x</p>');
    expect(r.values["border-top-color"]).toBe("blue");
  });
});

describe("@property", () => {
  test("initial-value fills var() where nothing sets it", () => {
    const css = "@property --s{syntax:'*';inherits:false;initial-value:solid} p{border-top-style:var(--s);border-top-width:1px}";
    const { style, ctx } = pick("p", `<style>${css}</style><p>x</p>`);
    expect(style["border-top-style"]).toBe("solid");
    expect(codesOf(ctx)).toEqual([]);
  });

  test("a set value still wins", () => {
    const css = "@property --c{syntax:'*';inherits:false;initial-value:red} p{--c:blue;color:var(--c)}";
    expect(pick("p", `<style>${css}</style><p>x</p>`).style["color"]).toBe("blue");
  });

  test("inherits: false stops at the element that sets it", () => {
    const css = "@property --c{syntax:'*';inherits:false;initial-value:red} div{--c:blue} p{color:var(--c)}";
    expect(pick("p", `<style>${css}</style><div><p>x</p></div>`).style["color"]).toBe("red");
  });

  test("without an initial value a non-inherited one falls back", () => {
    const css = "@property --w{syntax:'*';inherits:false} div{--w:700} p{font-weight:var(--w, 300)}";
    expect(pick("p", `<style>${css}</style><div><p>x</p></div>`).style["font-weight"]).toBe("300");
  });

  test("inherits: true flows down from the root", () => {
    const css = "@property --c{syntax:'<color>';inherits:true;initial-value:red} div{--c:blue} p{color:var(--c)} span{color:var(--c)}";
    const html = `<style>${css}</style><div><p>x</p></div><span>y</span>`;
    expect(pick("p", html).style["color"]).toBe("blue");
    expect(pick("span", html).style["color"]).toBe("red");
  });

  test("initial means the registered initial value", () => {
    const css = "@property --c{syntax:'*';inherits:false;initial-value:red} p{--c:initial;color:var(--c)}";
    expect(pick("p", `<style>${css}</style><p>x</p>`).style["color"]).toBe("red");
  });

  test("it works wherever the rule sits in the sheet", () => {
    const css = "p{color:var(--c)} @layer x{ @property --c{syntax:'*';inherits:false;initial-value:red} }";
    expect(pick("p", `<style>${css}</style><p>x</p>`).style["color"]).toBe("red");
  });

  test("an invalid registration is W002 and ignored", () => {
    const css = "@property --c{syntax:'<color>';inherits:false} p{color:var(--c, blue)}";
    const { style, ctx } = pick("p", `<style>${css}</style><p>x</p>`);
    expect(style["color"]).toBe("blue");
    expect(codesOf(ctx)).toEqual(["W002"]);
  });
});

describe("logical properties", () => {
  test("inline sides map to left/right, block sides to top/bottom", () => {
    const v = styled("p{padding-inline:24px;padding-block:16px;margin-inline:auto}").values;
    expect(v).toMatchObject({ "padding-left": "24px", "padding-right": "24px", "padding-top": "16px", "padding-bottom": "16px", "margin-left": "auto", "margin-right": "auto" });
    expect(v["padding-inline-start"]).toBeUndefined();
  });

  test("logical and physical share longhands, so order and specificity decide", () => {
    expect(styled("p{padding-left:1px;padding-inline:2px}").values["padding-left"]).toBe("2px");
    expect(styled("p{padding-inline:2px;padding-left:1px}").values["padding-left"]).toBe("1px");
    expect(styled("p{padding-inline-start:2px;padding-left:1px}").values["padding-left"]).toBe("1px");
    expect(styled("p{padding-left:1px;padding-inline-start:2px}").values["padding-left"]).toBe("2px");
    expect(styled("#a{padding-left:1px} p{padding-inline-start:2px}").values["padding-left"]).toBe("1px");
    expect(styled("p{padding-top:1px;padding-block:2px}").values["padding-top"]).toBe("2px");
  });

  test("authored holds the physical names", () => {
    expect([...styled("p{margin-inline-end:1px}").authored]).toEqual(["margin-right"]);
  });

  test("rtl flips inline start and end, from direction or the dir attribute", () => {
    const css = "<style>p{padding-inline:1px 2px;margin-inline-start:3px}</style>";
    const rtl = run(`${css}<div style="direction:rtl"><p>x</p></div>`).values;
    expect(rtl).toMatchObject({ "padding-right": "1px", "padding-left": "2px", "margin-right": "3px" });
    expect(rtl["margin-left"]).toBeUndefined();
    expect(run(`${css}<div dir="rtl"><p>x</p></div>`).values).toMatchObject({ "padding-right": "1px", "padding-left": "2px" });
    expect(run(`${css}<div dir="rtl"><p style="direction:ltr">x</p></div>`).values).toMatchObject({ "padding-left": "1px" });
    expect(run(`${css}<div dir="rtl" style="direction:ltr"><p>x</p></div>`).values).toMatchObject({ "padding-left": "1px" });
  });

  test("the dir attribute is a direction hint: inherited, and any author direction beats it", () => {
    expect(run('<div dir="rtl"><p>x</p></div>', "div").values["direction"]).toBe("rtl");
    expect(run('<div dir="RTL" style="direction:ltr"><p>x</p></div>', "div").values["direction"]).toBe("ltr");
    expect(run('<div dir="auto"><p>x</p></div>', "div").values["direction"]).toBeUndefined();
    expect(run('<div dir="rtl"><p>x</p></div>', "div").authored.has("direction")).toBe(false);
  });

  test("in rtl, inline-start competes with padding-right", () => {
    const html = (css: string) => run(`<style>${css}</style><div dir="rtl"><p>x</p></div>`).values;
    expect(html("p{padding-right:1px;padding-inline-start:2px}")["padding-right"]).toBe("2px");
    expect(html("p{padding-inline-start:2px;padding-right:1px}")["padding-right"]).toBe("1px");
    expect(html("p{padding-inline-start:2px;padding-left:1px}")["padding-left"]).toBe("1px");
  });

  describe("empty-content pseudo-elements", () => {
    const bar = ".d::after{content:'';display:block;width:40px;height:3px;background:red}";
    test("a bar is reported once per selector, however many hosts it matches", () => {
      expect(codesOf(styled(bar, '<p class="d">a</p><p class="d">b</p>').ctx)).toEqual(["W001"]);
    });
    test("a display:none host is not reported", () => {
      expect(codesOf(styled(`${bar} .d{display:none}`, '<p class="d">a</p>').ctx)).toEqual([]);
    });
    test("a pseudo with its own display:none is not reported", () => {
      expect(codesOf(styled(".d::after{content:'';display:none;width:4px;height:4px;background:red}", '<p class="d">a</p>').ctx)).toEqual([]);
    });
    test("border-radius alone draws nothing", () => {
      expect(codesOf(styled(".d::after{content:'';display:table;clear:both;border-radius:50%}", '<p class="d">a</p>').ctx)).toEqual([]);
    });
    test("clearfixes with zero or hidden boxes stay quiet", () => {
      expect(codesOf(styled(".d::after{content:'';display:block;height:0;clear:both;visibility:hidden}", '<p class="d">a</p>').ctx)).toEqual([]);
      expect(codesOf(styled(".d::after{content:'';display:table;clear:both;border:0}", '<p class="d">a</p>').ctx)).toEqual([]);
    });
  });
});

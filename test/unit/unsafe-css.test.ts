import { describe, expect, test } from "vitest";
import { compile } from "../../src/index.ts";
import { cssUrls, unsafeDecl } from "../../src/style/unsafe.ts";

const build = (html: string) => compile(`<div style="max-width:600px">${html}</div>`, { strict: false });
const infos = (r: ReturnType<typeof build>) => r.diagnostics.filter((d) => d.code === "I001").map((d) => d.message);

describe("unsafeDecl", () => {
  test.each([
    ["background", "url(javascript:alert(1))", "Removed background: javascript: URL"],
    ["background-image", 'url("JAVA\tSCRIPT:alert(1)")', "Removed background-image: javascript: URL"],
    ["background-image", "u\\72l(java\\73 cript:alert(1))", "Removed background-image: javascript: URL"],
    ["background-image", "url(java\\/**/script:x)", "Removed background-image: javascript: URL"],
    ["background-image", "url(vbscript:x)", "Removed background-image: vbscript: URL"],
    ["background-image", "url(data:text/html,x)", "Removed background-image: data: URL"],
    ["background-image", 'image-set("javascript:x" 1x, url(a.png) 2x)', "Removed background-image: javascript: URL"],
    ["background-image", "-webkit-image-set(url(javascript:x) 1x)", "Removed background-image: javascript: URL"],
    ["list-style-image", "url('javascript:x')", "Removed list-style-image: javascript: URL"],
    ["--hero", "url(vbscript:x)", "Removed --hero: vbscript: URL"],
    ["behavior", "url(x.htc)", "Removed behavior: it loads script"],
    ["-ms-behavior", "url(x.htc)", "Removed -ms-behavior: it loads script"],
    ["-moz-binding", "url(x.xml#b)", "Removed -moz-binding: it loads script"],
    ["width", "expression(alert(1))", "Removed width: expression() runs script"],
    ["width", "EXPRESSION (alert(1))", "Removed width: expression() runs script"],
    ["width", "expr\\65 ssion(alert(1))", "Removed width: expression() runs script"],
    ["color", "expr/**/ession(alert(1))", "Removed color: expression() runs script"],
    ["width", "'/*' expression(alert(1)) '*/'", "Removed width: expression() runs script"],
    ["width", "a\\' expression(alert(1))", "Removed width: expression() runs script"],
    ["width", "'x\n expression(alert(1))", "Removed width: expression() runs script"],
  ])("%s: %s", (prop, value, message) => {
    expect(unsafeDecl(prop, value)?.message).toBe(message);
  });

  test.each([
    ["background-image", "url(https://x.test/a.png)"],
    ["background-image", "url('/img/a.png'), linear-gradient(#fff, #000)"],
    ["background-image", "url(data:image/png;base64,AAAA)"],
    ["background-image", 'url("data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22/>")'],
    ["background-image", "url(cid:hero@x.test)"],
    ["background-image", "url(hero.url)"],
    ["background-image", "url({{hero}})"],
    ["background", "#fff"],
    ["font-family", '"Expression Sans", Arial'],
    ["font-family", "'Expression (Display)', Arial"],
    ["content", '"expr/**/ession(1)"'],
    ["content", '"url(javascript:x)"'],
  ])("keeps %s: %s", (prop, value) => {
    expect(unsafeDecl(prop, value)).toBeUndefined();
  });

  test("fonts may be data: fonts, images may not", () => {
    expect(unsafeDecl("src", "url(data:font/woff2;base64,AAAA)", "font")).toBeUndefined();
    expect(unsafeDecl("src", "url(data:application/font-woff;base64,AAAA)", "font")).toBeUndefined();
    expect(unsafeDecl("src", "url(data:font/woff2;base64,AAAA)")?.message).toBe("Removed src: data: URL");
    expect(unsafeDecl("src", "url(data:text/html,x)", "font")?.message).toBe("Removed src: data: URL");
  });

  test("a bad URL becomes none and the rest of the value stays", () => {
    expect(unsafeDecl("background", '#eee url("javascript:x") no-repeat')?.value).toBe("#eee none no-repeat");
    expect(unsafeDecl("background-image", "url(a.png), url(vbscript:x)")?.value).toBe("url(a.png), none");
    expect(unsafeDecl("background-image", 'image-set("javascript:x" 1x, url(a.png) 2x), url(b.png)')?.value).toBe("none, url(b.png)");
    // a bad-url token voids the declaration in browsers, so it goes whole
    expect(unsafeDecl("background", "#eee url(javascript:alert(1))")?.value).toBeUndefined();
    expect(unsafeDecl("behavior", "url(x.htc)")?.value).toBeUndefined();
  });

  test("cssUrls reads url(), src() and image-set strings", () => {
    expect(cssUrls('url(a.png), url( "b.png" ), src(\'c.woff\')')).toEqual(["a.png", "b.png", "c.woff"]);
    expect(cssUrls('image-set("a.png" 1x, "b.png" 2x)')).toEqual(["a.png", "b.png"]);
    expect(cssUrls('"url(a.png)" /* url(b.png) */ attr(x)')).toEqual([]);
  });
});

describe("unsafe CSS in a compile", () => {
  test("a javascript: background is not lowered to a background attribute; its colour is", () => {
    const r = build('<div style="background:#eeeeee url(\'javascript:alert(1)\');padding:10px"><p>x</p></div>');
    expect(r.html).not.toMatch(/javascript/i);
    expect(r.html).toContain("#eeeeee");
    expect(infos(r)).toEqual(["Removed background: javascript: URL"]);
  });

  test("stylesheet, media and dark rules lose the declaration, not the rule", () => {
    const r = build(
      "<style>.a{color:#111111;behavior:url(x.htc);-moz-binding:url(x.xml#b);width:expression(1)}" +
        "@media (max-width:480px){.a{background:url(vbscript:x) !important;color:#222222 !important}}" +
        "@media (prefers-color-scheme:dark){.a{background-image:url(javascript:x) !important}}</style><p class=\"a\">a</p>",
    );
    expect(r.html).not.toMatch(/javascript|vbscript|behavior|binding|expression/i);
    expect(r.html).toContain("#111111");
    expect(r.html).toContain("#222222");
    expect(infos(r).sort()).toEqual([
      "Removed -moz-binding: it loads script",
      "Removed background-image: javascript: URL",
      "Removed background: vbscript: URL",
      "Removed behavior: it loads script",
      "Removed width: expression() runs script",
    ]);
  });

  test("a style attribute in a raw block is cleaned too", () => {
    const r = build('<div data-email="raw"><p style="background:url(javascript:x);color:#333333">r</p></div>');
    expect(r.html).not.toMatch(/javascript/);
    expect(r.html).toContain("#333333");
  });

  test("an @font-face loading a non-font is dropped; a data: font stays", () => {
    const r = build(
      '<style>@font-face{font-family:Bad;src:url("javascript:x")}@font-face{font-family:Good;src:url(data:font/woff2;base64,AAAA) format("woff2")}</style><p style="font-family:Good, Arial">x</p>',
    );
    expect(r.html).not.toMatch(/javascript|font-family:Bad/);
    expect(r.html).toContain("data:font/woff2;base64,AAAA");
    expect(infos(r)).toEqual(["Removed src: javascript: URL in @font-face; the face was dropped"]);
  });

  test("an @property whose initial value loads a script URL is ignored", () => {
    const r = build('<style>@property --bg{syntax:"*";inherits:true;initial-value:url(javascript:x)}.a{background-image:var(--bg)}</style><p class="a">x</p>');
    expect(r.html).not.toMatch(/javascript/);
    expect(infos(r)).toEqual(["Removed --bg: javascript: URL in @property; the rule was ignored"]);
  });
});

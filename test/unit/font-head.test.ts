import { describe, expect, test } from "vitest";
import { compile } from "../../src/index.ts";
import { fontHead } from "../../src/shell/fonts.ts";
import { codesOf, el, testCtx, text } from "../helpers/index.ts";

const body = (stacks: string[]) => el("body", {}, stacks.map((s, i) => el("p", { "font-family": s }, [text("x")], { line: i + 1 })));
const faces = { imports: [], faces: ["@font-face{font-family:'Brand';src:url(b.woff2)}"] };

describe("fontHead", () => {
  test("nothing without web fonts", () => {
    expect(fontHead({ imports: [], faces: [] }, [], body(["Arial"]), testCtx())).toBe("");
  });

  test("override uses the first non-web family", () => {
    const ctx = testCtx();
    const out = fontHead(faces, [], body(["Brand, 'Trebuchet MS', sans-serif"]), ctx);
    expect(out).toContain("<!--[if !mso]><!-->");
    expect(out).toContain("font-family:'Trebuchet MS' !important");
    expect(codesOf(ctx)).toEqual(["I008"]);
  });

  test("a generic-only fallback warns and overrides with the generic", () => {
    const ctx = testCtx();
    expect(fontHead(faces, [], body(["Brand, serif"]), ctx)).toContain("font-family:serif !important");
    expect(codesOf(ctx)).toEqual(["W013", "I008"]);
  });

  test("disagreeing stacks: the most used wins and W001 names the rest", () => {
    const ctx = testCtx();
    const out = fontHead(faces, [], body(["Brand, Arial", "Brand, Arial", "Georgia, serif"]), ctx);
    expect(out).toContain("font-family:Arial !important");
    expect(ctx.diagnostics.list().find((d) => d.code === "W001")?.message).toMatch(/Georgia/);
  });
});

describe("W013 needs a named family after the web font", () => {
  test("Arial, Inter still warns", () => {
    const ctx = testCtx();
    fontHead({ imports: [], faces: ["@font-face{font-family:Inter;src:url(i.woff2)}"] }, [], body(["Arial, Inter"]), ctx);
    expect(codesOf(ctx)).toEqual(["W013", "I008"]);
  });
});

describe("a link without family=", () => {
  test("the first family is assumed web, with a W001", () => {
    const ctx = testCtx();
    const out = fontHead({ imports: [], faces: [] }, ["https://use.typekit.net/abc.css"], body(["proxima-nova, Arial, sans-serif"]), ctx);
    expect(out).toContain("font-family:Arial !important");
    expect(out).not.toContain("proxima-nova");
    expect(codesOf(ctx)).toEqual(["W001", "I008"]);
  });
});

describe("stacks without a web font", () => {
  const inter = { imports: [], faces: ["@font-face{font-family:Inter;src:url(i.woff2)}"] };

  test("UA monospace and Georgia do not vote on the override", () => {
    const ctx = testCtx();
    const out = fontHead(inter, [], body(["Inter, Arial, sans-serif", "monospace", "Georgia, serif"]), ctx);
    expect(out).toContain("font-family:Arial !important");
    const w = ctx.diagnostics.list().filter((d) => d.code === "W001").map((d) => d.message);
    expect(w.join()).toMatch(/Georgia, serif are also shown as Arial/);
    expect(w.join()).not.toMatch(/different fonts/);
  });

  test("no stack uses the web font: no mso block", () => {
    const out = fontHead(inter, [], body(["Georgia, serif"]), testCtx());
    expect(out).not.toContain("[if mso]>");
  });

  test("web-safe families are never guessed from a blind link", () => {
    const ctx = testCtx();
    const out = fontHead({ imports: [], faces: [] }, ["https://use.typekit.net/a.css"], body(["Arial, sans-serif"]), ctx);
    expect(out).not.toContain("[if mso]>");
    expect(codesOf(ctx)).toEqual(["I008"]);
  });
});

describe("font link attributes", () => {
  test("media on a font link warns", () => {
    const r = compile('<link rel="stylesheet" media="(min-width:600px)" href="https://fonts.googleapis.com/css2?family=Inter"><p>x</p>', { strict: false });
    expect(r.diagnostics.some((d) => d.code === "W001" && /media/.test(d.message))).toBe(true);
  });
});

describe("through the pipeline", () => {
  test("a kept font link and the inline stack", () => {
    const out = compile('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter"><p style="font-family:Inter,Arial,sans-serif">x</p>', { strict: false }).html;
    expect(out).toContain('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">');
    expect(out).toContain("font-family:Inter,Arial,sans-serif");
  });
});

describe("fontHead edge cases", () => {
  test("a stray % in a font URL compiles and keeps the link", () => {
    const { html } = compile('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter%"><p style="font-family:Inter,Arial,sans-serif">x</p>');
    expect(html).toContain("family=Inter%");
  });

  test("an element the override doesn't reach keeps its own font, with no warning", () => {
    const ctx = testCtx();
    const tree = el("body", {}, [el("p", { "font-family": "Brand, Arial, sans-serif" }, [text("a "), el("strong", { "font-family": "Georgia" }, [text("b")]), el("pre", { "font-family": "monospace" }, [text("c")])])]);
    fontHead(faces, [], tree, ctx);
    expect(codesOf(ctx)).toEqual(["I008"]);
  });

  test("an element that inherits its parent's stack is overridden with it", () => {
    const ctx = testCtx();
    const tree = el("body", {}, [el("p", { "font-family": "Brand, Arial, sans-serif" }, [text("a")]), el("div", { "font-family": "Georgia, serif" }, [el("strong", { "font-family": "Georgia, serif" }, [text("b")])])]);
    fontHead(faces, [], tree, ctx);
    expect(ctx.diagnostics.list().map((d) => d.message).join()).toMatch(/Georgia, serif is also shown as Arial/);
  });
});

describe("locations", () => {
  const first = (ctx: ReturnType<typeof testCtx>, code: string) => ctx.diagnostics.list().filter((d) => d.code === code)[0];

  test("W013 points at the first element with a web-font stack", () => {
    const ctx = testCtx();
    fontHead(faces, [], body(["Arial", "Brand, serif", "Brand, serif"]), ctx);
    expect(first(ctx, "W013")?.loc?.line).toBe(2);
  });

  test("the stacks-disagree W001 points at the first stack that loses, and says most used", () => {
    const ctx = testCtx();
    fontHead(faces, [], body(["Brand, Arial", "Brand, Georgia", "Brand, Arial", "Brand, Arial"]), ctx);
    const w = first(ctx, "W001");
    expect(w?.message).toMatch(/most used fallback/);
    expect(w?.loc?.line).toBe(2);
  });

  test("the assumed-first-family W001 points at the first stack it assumed for", () => {
    const ctx = testCtx();
    fontHead({ imports: [], faces: [] }, ["https://use.typekit.net/abc.css"], body(["Arial", "proxima-nova, Arial"]), ctx);
    expect(first(ctx, "W001")?.loc?.line).toBe(2);
  });

  test("the also-shown-as W001 points at the first stack it names", () => {
    const ctx = testCtx();
    fontHead(faces, [], body(["Brand, Arial", "Georgia, serif", "Georgia, serif"]), ctx);
    expect(first(ctx, "W001")?.loc?.line).toBe(2);
  });
});

describe("blind sources", () => {
  test("I008 names the URL that didn't say", () => {
    const ctx = testCtx();
    fontHead({ imports: [], faces: [] }, ["https://use.typekit.net/abc.css"], body(["proxima-nova, Arial"]), ctx);
    expect(ctx.diagnostics.list().find((d) => d.code === "I008")?.message).toBe("Web font kept: families from https://use.typekit.net/abc.css (not named in the URL)");
  });

  test("a named family and a blind link are both in the message", () => {
    const ctx = testCtx();
    fontHead({ imports: [], faces: [] }, ["https://fonts.googleapis.com/css2?family=Inter", "https://use.typekit.net/abc.css"], body(["Inter, Arial"]), ctx);
    expect(ctx.diagnostics.list().find((d) => d.code === "I008")?.message).toBe("Web font kept: Inter, families from https://use.typekit.net/abc.css (not named in the URL)");
  });

  test("roboto is not web-safe, so a blind link may be taken to load it", () => {
    const ctx = testCtx();
    const out = fontHead({ imports: [], faces: [] }, ["https://use.typekit.net/abc.css"], body(["Roboto, Arial"]), ctx);
    expect(out).toContain("font-family:Arial !important");
    expect(codesOf(ctx)).toEqual(["W001", "I008"]);
  });
});

describe("fonts from the css option", () => {
  test("an @import in options.css is kept like one in a style block", () => {
    const r = compile('<p style="font-family:Inter,Arial,sans-serif">x</p>', { css: ['@import url("https://fonts.googleapis.com/css2?family=Inter");'], lang: "en" });
    expect(r.html).toContain("@import url(");
    expect(r.diagnostics.map((d) => d.code)).toEqual(["I008"]);
  });
});

import { describe, expect, test } from "vitest";
import { compile } from "../../src/index.ts";
import { widthDecision } from "../../src/analyze/design-width.ts";
import { styledFrom, testCtx } from "../helpers/index.ts";

const dw = (html: string, width?: number): number => {
  const ctx = testCtx(width === undefined ? {} : { width });
  return widthDecision(styledFrom(html, ctx), ctx).width;
};
const raw = (style: string, inner = "<div>x</div>"): string => `<div style="${style}">${inner}</div>`;
// centred unless the style says otherwise, since only centred roots set the width
const box = (style: string, inner = "<div>x</div>"): string => raw(/margin/.test(style) ? style : `${style};margin:0 auto`, inner);
const text = "<p>hi</p>";

describe("designWidth", () => {
  test("a px max-width on the root container", () => {
    expect(dw(box("max-width:640px;margin:0 auto", text))).toBe(640);
  });

  test("a px width when there is no max-width, max-width first when both", () => {
    expect(dw(box("width:520px", text))).toBe(520);
    expect(dw(box("width:700px;max-width:560px", text))).toBe(560);
  });

  test("content-box adds padding and border like the box rule does", () => {
    expect(dw(box("max-width:600px;padding:0 24px;border:1px solid #000", text))).toBe(650);
    expect(dw(box("box-sizing:border-box;max-width:600px;padding:0 24px", text))).toBe(600);
  });

  test("the widest of several roots wins", () => {
    expect(dw(box("max-width:500px", text) + box("max-width:640px", text))).toBe(640);
  });

  test("none, auto and % values do not count", () => {
    for (const s of ["max-width:none", "width:auto", "width:100%", "max-width:100%"]) expect(dw(box(s, text)), s).toBe(600);
  });

  test("a vw width is the viewport's, not the email's", () => {
    expect(dw(box("width:80vw", text))).toBe(600);
    expect(dw(box("max-width:50vw", text))).toBe(600);
    expect(dw(box("width:80vw;max-width:640px", text))).toBe(640);
    expect(dw(box("box-sizing:border-box;padding:0 5vw;max-width:640px", text))).toBe(640);
    expect(dw(`<style>:root{--w:80vw}</style>${box("width:var(--w)", text)}`)).toBe(600);
    expect(dw(`<style>:root{--w:80vw;--wide:640px}</style>${box("max-width:var(--wide);margin:0 auto", text)}`)).toBe(640);
  });

  test("no container at all is 600", () => {
    expect(dw(text)).toBe(600);
  });

  test("a wrapper of layout blocks is walked through; the walk stops at the first sized block", () => {
    const card = box("max-width:560px", box("max-width:300px", text));
    expect(dw(box("margin:0", card))).toBe(560);
  });

  test("a block with text in it is content: its sized children are not roots", () => {
    expect(dw(box("padding:8px", `<p>Hi</p>${box("width:80px", text)}`))).toBe(600);
  });

  test("flex and grid children are items, not roots", () => {
    expect(dw(box("display:flex", box("width:180px", text)))).toBe(600);
    expect(dw(box("display:grid", box("width:180px", text)))).toBe(600);
  });

  test("a sized flex container is a root", () => {
    expect(dw(box("display:flex;max-width:640px", box("flex:1", text)))).toBe(640);
  });

  test("images, hidden, preheader and outlook-only blocks are not candidates", () => {
    const hidden = box("display:none;width:900px");
    const pre = `<div data-email="preheader" style="max-width:900px">p</div>`;
    const mso = `<div data-email="outlook-only" style="width:900px">o</div>`;
    expect(dw(`<img src="a.png" width="900" alt="">${hidden}${pre}${mso}`)).toBe(600);
  });

  test("non-integer px is rounded; under 1px is ignored", () => {
    expect(dw(box("max-width:640.6px", text))).toBe(641);
    expect(dw(box("max-width:0.4px", text))).toBe(600);
  });

  test("a table with a px width is a root", () => {
    expect(dw(`<table style="width:640px;margin:0 auto"><tr><td>x</td></tr></table>`)).toBe(640);
  });

  test("a given width wins and wider containers warn with both numbers", () => {
    const ctx = testCtx({ width: 600 });
    const body = styledFrom(box("max-width:700px", text) + box("max-width:500px", text), ctx);
    expect(widthDecision(body, ctx).width).toBe(600);
    const w = ctx.diagnostics.list().filter((d) => d.code === "W011");
    expect(w).toHaveLength(1);
    expect(w[0]!.message).toBe("Container is 700px wide but the width option is 600px; it is laid out at 600px");
    expect(w[0]!.loc?.line).toBe(1);
  });

  test("a given width at or above the containers is silent", () => {
    const ctx = testCtx({ width: 640 });
    expect(widthDecision(styledFrom(box("max-width:640px", text), ctx), ctx).width).toBe(640);
    expect(ctx.diagnostics.list()).toEqual([]);
  });
});

describe("compile with the design width", () => {
  const html = `<div style="box-sizing:border-box;max-width:700px;margin:0 auto"><p>hi</p></div>`;

  test("without a width option the output follows the container", () => {
    const out = compile(html).html;
    expect(out).toContain("max-width:700px");
    expect(out).toContain('width="700"');
  });

  test("with width: 600 a 700px container warns W011 once and is laid out at 600", () => {
    const r = compile(html, { width: 600 });
    expect(r.diagnostics.filter((d) => d.code === "W011")).toHaveLength(1);
    expect(r.html).toContain("max-width:600px");
    expect(r.html).not.toContain("width=\"700\"");
  });
});

describe("designWidth: alignment, sizes, link wrappers", () => {
  test("a left-aligned sized root narrower than 600 sets no width, wider counts", () => {
    expect(dw(raw("width:300px", text))).toBe(600);
    expect(dw(raw("width:700px", text))).toBe(700);
    expect(dw(raw("max-width:640px;margin-left:auto", text))).toBe(640);
    expect(dw(raw("width:300px", text) + box("max-width:640px;margin:0 auto", text))).toBe(640);
  });

  test("unsized content beside a narrow centred card fills the column: floor of 600", () => {
    expect(dw(box("max-width:400px", text))).toBe(400);
    expect(dw(box("max-width:400px", text) + "<p>Footer</p>")).toBe(600);
    expect(dw(box("max-width:400px", text) + raw("background:#000", text))).toBe(600);
    expect(dw(box("max-width:400px", text) + box("max-width:640px", text) + "<p>Footer</p>")).toBe(640);
  });

  test("a painted wrapper adds the floor, an unpainted one does not", () => {
    expect(dw(box("background:#eee", box("max-width:560px", text)))).toBe(600);
    expect(dw(box("margin:0", box("max-width:560px", text)))).toBe(560);
  });

  test("align=center tables and <center> parents count as centred", () => {
    expect(dw(`<table align="center" style="width:640px"><tr><td>x</td></tr></table>`)).toBe(640);
    expect(dw(`<center><div style="max-width:640px"><p>x</p></div></center>`)).toBe(640);
  });

  test("a table's width attribute counts when its style has none, border included", () => {
    expect(dw(`<table align="center" width="640" border="1" style="border-collapse:collapse"><tr><td>x</td></tr></table>`)).toBe(640);
    expect(dw(`<table align="center" width="640px"><tr><td>x</td></tr></table>`)).toBe(640);
    expect(dw(`<table align="center" width="100%"><tr><td>x</td></tr></table>`)).toBe(600);
    expect(dw(`<table align="center" width="640" style="width:560px"><tr><td>x</td></tr></table>`)).toBe(560);
  });

  test("the smaller of width and max-width wins when both are px", () => {
    expect(dw(box("width:500px;max-width:640px;margin:0 auto", text))).toBe(500);
  });

  test("a display:block link wrapper is walked through", () => {
    expect(dw(`<a href="https://x.test" style="display:block">${box("max-width:640px;margin:0 auto", text)}</a>`)).toBe(640);
  });

  test("a given width with a wider width: root reports W011 (the option is named there)", () => {
    const r = compile(`<div style="width:700px;margin:0 auto"><p>hi</p></div>`, { width: 600, strict: false, lang: "en" });
    expect(r.diagnostics.map((d) => d.code)).toEqual(["W011"]);
    const nested = compile(`<div style="max-width:600px;margin:0 auto"><div style="width:700px"><p>hi</p></div></div>`, { width: 600, strict: false, lang: "en" });
    expect(nested.diagnostics.map((d) => d.code)).toEqual(["W004"]);
  });

  test("a sized centred text block is a root like a div; a left-aligned narrow one is not", () => {
    expect(dw(`<h1 style="max-width:640px;margin:0 auto">Hi</h1>`)).toBe(640);
    expect(dw(`<h1 style="max-width:400px;margin:0 auto">Hi</h1>`)).toBe(400);
    expect(dw(`<h1 style="max-width:400px">Hi</h1>`)).toBe(600);
    expect(dw(`<p style="width:900px">t</p>`)).toBe(900);
    expect(dw(`<h1 style="max-width:400px;margin:0 auto">Hi</h1><p>more</p>`)).toBe(600);
  });

  test("a sized text block inside a wrapper is still a root", () => {
    expect(dw(`<div><h1 style="width:640px;margin:0 auto">Hi</h1></div>`)).toBe(640);
    expect(dw(`<center><h1 style="width:640px">Hi</h1></center>`)).toBe(640);
    expect(dw(`<table width="100%"><tr><td align="center"><h1 style="width:640px">Hi</h1></td></tr></table>`)).toBe(640);
    expect(dw(`<div><h1>Hi</h1></div>`)).toBe(600);
  });

  test("a link box never sets the width itself", () => {
    expect(dw(`<a href="https://x.test" style="display:block;max-width:640px;margin:0 auto"><p>card</p></a>`)).toBe(600);
  });
});

describe("designWidth: the table skeleton", () => {
  const inner = `<table width="640" style="width:640px" cellpadding="0" cellspacing="0"><tr><td><p>x</p></td></tr></table>`;
  const skeleton = (outerTd = "", outerTable = "") =>
    `<table width="100%" ${outerTable} cellpadding="0" cellspacing="0"><tr><td align="center" ${outerTd}>${inner}</td></tr></table>`;

  test("width=100% table > td align=center > sized table gives its width", () => {
    expect(dw(skeleton())).toBe(640);
  });

  test("a painted or padded outer table or td adds the floor", () => {
    expect(dw(skeleton('style="background:#eee"'))).toBe(640);
    expect(dw(skeleton('style="padding:0 20px"'))).toBe(640);
    expect(dw(skeleton("", 'style="background:#eee"'))).toBe(640);
  });

  test("the floor wins for a narrow inner table", () => {
    const narrow = inner.replace(/640/g, "400");
    const outer = (attrs: string, td = "") => `<table width="100%" ${attrs}><tr><td align="center" ${td}>${narrow}</td></tr></table>`;
    expect(dw(outer('bgcolor="#eee"'))).toBe(600);
    expect(dw(outer('cellpadding="10"'))).toBe(600);
    expect(dw(outer('border="1"'))).toBe(600);
    expect(dw(outer('style="background:#eee"'))).toBe(600);
    expect(dw(outer("", 'bgcolor="#eee"'))).toBe(600);
    expect(dw(`<table width="100%"><tr><td align="center" style="padding:0 20px">${narrow}</td></tr></table>`)).toBe(600);
    expect(dw(`<table width="100%"><tr><td align="center">${narrow}</td></tr></table>`)).toBe(400);
  });

  test("a cell with text or several cells is content, not walked", () => {
    expect(dw(`<table width="100%"><tr><td align="center">Hi ${inner}</td></tr></table>`)).toBe(600);
    expect(dw(`<table width="100%"><tr><td align="center">${inner}</td><td>b</td></tr></table>`)).toBe(600);
  });
});

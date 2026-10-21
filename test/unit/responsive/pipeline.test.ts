import { describe, expect, it } from "vitest";
import { compile } from "../../../src/index.ts";
import { startTags } from "../../../src/template/tags.ts";
import { shownElsewhere } from "../../../src/responsive/keep.ts";
import { styledDocFrom } from "../../helpers/index.ts";
import { DESKTOP } from "../../../src/style/types.ts";

const page = (css: string, body = '<p class="x">Hello</p>'): string => `<style>.x{padding:10px;color:#111111}${css}</style><div style="max-width:600px">${body}</div>`;
const headStyles = (html: string): string => html.match(/<\/title>[\s\S]*?<\/head>/)![0];

describe("head styles", () => {
  it("reports no pending-rules warning any more", () => {
    const out = compile(page("@media (max-width:480px){.x{padding:4px}} .x:hover{color:red}"));
    expect(out.diagnostics.map((d) => d.message).join()).not.toMatch(/not applied yet/);
  });

  it("emits nothing extra for plain css", () => {
    const out = compile(page(""));
    expect(out.html).not.toMatch(/class="t-/);
    expect(headStyles(out.html).match(/<style>/g)).toHaveLength(1);
  });

  it("puts the rules in one flat style after the reset, with the class on the element", () => {
    const out = compile(page("@media (max-width:480px){.x{padding:4px}}"));
    expect(out.html).toMatch(/<td class="t-0" style="[^"]*padding:10px/);
    expect(out.html).toContain("@media screen and (max-width:480px) {\n  .t-0 { padding:4px !important; }\n}");
    expect(out.html.indexOf("u + #body a")).toBeLessThan(out.html.indexOf(".t-0 {"));
  });

  it("adds the dark meta only with dark rules", () => {
    expect(compile(page("@media (max-width:480px){.x{padding:4px}}")).html).not.toContain("color-scheme");
    const dark = compile(page("@media (prefers-color-scheme:dark){.x{color:#eeeeee}}")).html;
    expect(dark).toContain('<meta name="color-scheme" content="light dark">');
    expect(dark).toContain('<meta name="supported-color-schemes" content="light dark">');
    expect(dark).toContain("[data-ogsc] .t-0 { color:#eeeeee !important; }");
  });

  it("drops a variant that changes the structure and reports E017 once", () => {
    const out = compile(
      page(".row{display:flex;flex-direction:column} .col{flex:1} @media (max-width:480px){.row{flex-direction:row}}", '<div class="row"><div class="col">a</div><div class="col">b</div></div>'),
      { strict: false },
    );
    const e = out.diagnostics.filter((d) => d.code === "E017");
    expect(e).toHaveLength(1);
    expect(e[0]!.message).toContain("max-width 480px");
    expect(out.html).not.toContain("@media");
  });

  it("is an error in strict mode", () => {
    const out = compile(page(".row{display:flex;flex-direction:column} @media (max-width:480px){.row{flex-direction:row}}", '<div class="row"><div>a</div><div>b</div></div>'));
    expect(out.diagnostics.find((d) => d.code === "E017")?.severity).toBe("error");
  });

  it("keeps the other variants when one is dropped", () => {
    const out = compile(
      page(".row{display:flex;flex-direction:column} @media (max-width:480px){.row{flex-direction:row}} @media (prefers-color-scheme:dark){.x{color:#eeeeee}}", '<div class="row"><div class="x">a</div><div>b</div></div>'),
      { strict: false },
    );
    expect(out.html).toContain("prefers-color-scheme");
    expect(out.html).not.toContain("max-width:480px");
  });

  it("reports what only a variant says, once", () => {
    const out = compile(page("@media (max-width:600px){.x{margin-left:-8px}} @media (max-width:480px){.x{margin-left:-8px}}"), { strict: false });
    expect(out.diagnostics.filter((d) => d.code === "E005")).toHaveLength(1);
  });

  it("says which screens a forwarded diagnostic comes from", () => {
    const narrow = compile(page("@media (max-width:480px){.x{margin-left:-8px}}"), { strict: false }).diagnostics.find((d) => d.code === "E005");
    expect(narrow?.message).toMatch(/^At 480px and below: /);
    const dark = compile(page("@media (prefers-color-scheme:dark){.x{margin-left:-8px}}"), { strict: false }).diagnostics.find((d) => d.code === "E005");
    expect(dark?.message).toMatch(/^In dark mode: /);
  });

  it("names the screens a forwarded diagnostic comes from as the breakpoints they make up", () => {
    const out = compile(page("@media (max-width:600px){.x{margin-left:-8px}} @media (max-width:480px){.x{padding:2px}}"), { strict: false });
    const e = out.diagnostics.filter((d) => d.code === "E005");
    expect(e).toHaveLength(1);
    expect(e[0]!.message).toMatch(/^At 600px and below: /);
    const mid = compile(page("@media (max-width:600px){.x{padding:6px}} @media (min-width:481px) and (max-width:600px){.x{margin-left:-8px}} @media (max-width:480px){.x{padding:2px}}"), { strict: false });
    expect(mid.diagnostics.find((d) => d.code === "E005")?.message).toMatch(/^At 481–600px: /);
  });

  it("reports one E017 for an element every narrow screen restructures the same way, naming the declarations", () => {
    const out = compile(
      page(".row{display:flex;flex-direction:column} @media (max-width:600px){.row{flex-direction:row}} @media (max-width:480px){.x{padding:2px}}", '<div class="row"><div>a</div><div>b</div></div>'),
      { strict: false },
    );
    const e = out.diagnostics.filter((d) => d.code === "E017");
    expect(e).toHaveLength(1);
    expect(e[0]!.message).toMatch(/^The max-width 600px rules change the layout structure/);
    expect(e[0]!.message).toContain("{ flex-direction: row }");
    expect(e[0]!.message).not.toMatch(/the base has "</);
  });

  it("quotes a border shorthand the screen writes as the shorthand, not its longhands", () => {
    const e017 = (screen: string): string | undefined =>
      compile(page(`.row{display:flex;flex-direction:column;color:#333333;border-right:1px solid #cccccc} @media (max-width:600px){.row{${screen}}}`, '<div class="row"><div>a</div><div>b</div></div>'), { strict: false })
        .diagnostics.find((d) => d.code === "E017")?.message;
    expect(e017("flex-direction:row;border:0")).toContain("{ flex-direction: row; border: 0 }");
    expect(e017("flex-direction:row;border:2px dashed #ff0000")).toContain("{ flex-direction: row; border: 2px dashed #ff0000 }");
    expect(e017("flex-direction:row;border-top:0")).toContain("{ flex-direction: row; border-top: 0 }");
  });

  it("does not repeat what the base already says", () => {
    const out = compile(page(".x{margin-left:-8px} @media (max-width:480px){.x{padding:2px}}"), { strict: false });
    expect(out.diagnostics.filter((d) => d.code === "E005")).toHaveLength(1);
  });

  it("warns when the head styles pass 16 KB", () => {
    const rules = Array.from({ length: 700 }, (_, i) => `.n${i}{padding:${i + 1}px}`).join("");
    const narrow = Array.from({ length: 700 }, (_, i) => `.n${i}{padding:${i + 701}px}`).join("");
    const body = Array.from({ length: 700 }, (_, i) => `<p class="n${i}">x</p>`).join("");
    const out = compile(page(`${rules}@media (max-width:480px){${narrow}}`, body), { strict: false });
    expect(out.diagnostics.map((d) => d.code)).toContain("W012");
    expect(compile(page("@media (max-width:480px){.x{padding:4px}}")).diagnostics.map((d) => d.code)).not.toContain("W012");
  }, 30_000); // 1400 elements compiled twice: about 2 s alone, more on a loaded machine
});

describe("elements shown on some screens only", () => {
  const css = ".x{padding:10px} .m{display:none} @media (max-width:480px){.m{display:block}}";

  it("shownElsewhere finds them with the display they have where they show", () => {
    const body = '<div class="x">a</div><div class="m">b</div>';
    const html = `<style>${css}</style>${body}`;
    const bodies = [DESKTOP, { ...DESKTOP, viewport: 480 }].map((env) => styledDocFrom(html, undefined, env).body);
    expect([...shownElsewhere(bodies).values()]).toEqual(["block"]);
    expect(shownElsewhere([bodies[0]!])).toEqual(new Map());
  });

  it("stay in the base, hidden, and are not dropped", () => {
    const out = compile(page(css, '<div class="x">a</div><div class="m">b</div><div class="x">c</div>'));
    expect(out.diagnostics.map((d) => d.code)).not.toContain("I002");
    expect(out.html).toContain('style="display:none;max-height:0;overflow:hidden;mso-hide:all;"');
    expect(out.html).toContain("display:table-cell !important");
  });

  it("hide inline, inside a text run", () => {
    const out = compile(page(".m{display:inline} @media (max-width:480px){.m{display:none}}", '<p class="x">a <span class="m">b</span> c</p>'));
    expect(out.html).toMatch(/<span class="t-0"/);
    expect(out.html).toContain(".t-0 { display:none !important; }");
  });

  it("show inline, inside a text run", () => {
    const out = compile(page(".m{display:none} @media (max-width:480px){.m{display:inline}}", '<p class="x">a <span class="m">b</span> c</p>'));
    expect(out.html).toMatch(/<span class="t-0" style="display:none/);
    expect(out.html).toContain(".t-0 { display:inline !important; }");
  });

  it("hide an image", () => {
    const out = compile(page("img{display:block} .m{display:block} @media (max-width:480px){.m{display:none}}", '<img class="m" src="https://example.com/a.png" width="100" height="50" alt="a">'));
    expect(out.html).toContain("display:none !important");
    expect(out.html).toContain("<img");
  });

  it("a screen dropped for E017 adds no other diagnostics", () => {
    const out = compile(
      page(".row{display:flex} .col{flex-grow:1} @media (max-width:480px){.row{flex-direction:column-reverse}}", '<div class="row"><div class="col">a</div><div class="col">b</div></div>'),
      { strict: false, lang: "en" },
    );
    expect(out.diagnostics.map((d) => d.code)).toEqual(["E017"]);
  });

  it("hides what the base hides from Outlook too: inline hides carry mso-hide and an [if !mso] guard", () => {
    const out = compile(page(".m{display:none} @media (max-width:480px){.m{display:inline}}", '<p class="x">a <span class="m">b</span> <img class="m" src="https://example.com/a.png" width="10" height="10" alt=""> c</p>'));
    expect(out.html).toContain('<!--[if !mso]><!--><span class="t-0" style="display:none;mso-hide:all">b</span><!--<![endif]-->');
    expect(out.html).toMatch(/<!--\[if !mso\]><!--><img class="t-0"[^>]*style="display:none;mso-hide:all"><!--<!\[endif\]-->/);
  });

  it("a block hidden in the base keeps its tables out of Outlook", () => {
    const out = compile(page(".m{display:none} @media (max-width:480px){.m{display:block}}", '<div class="m" style="padding:4px">b</div>'));
    expect(out.html).toMatch(/mso-hide:all;"><!--\[if !mso\]><!-->[\s\S]*<!--<!\[endif\]--><\/td>/);
  });
  it("a div and a td inside an author table keep their hide and the Outlook guard", () => {
    const out = compile(page(".m,.mc{display:none} @media (max-width:480px){.m{display:block}.mc{display:table-cell}}", '<table width="100%"><tr><td>A<div class="m">x</div></td><td class="mc">B</td></tr></table>'));
    expect(out.html).toMatch(/<!--\[if !mso\]><!--><div class="t-0" style="display:none;max-height:0;overflow:hidden;mso-hide:all">x<\/div><!--<!\[endif\]-->/);
    expect(out.html).toMatch(/<!--\[if !mso\]><!--><td class="t-1" style="display:none;max-height:0;overflow:hidden;mso-hide:all">B<\/td><!--<!\[endif\]-->/);
  });

  it("an inline image hidden mobile-first comes back inline, not block", () => {
    const out = compile(page("@media (min-width:481px){.mob{display:none}}", '<p class="x">a <img class="mob" src="https://example.com/a.png" width="10" height="10" alt=""> b</p>'));
    expect(out.html).toContain(".t-0 { display:inline !important; }");
  });

  it("a hidden flex:1 item takes both halves of its gap with it", () => {
    const out = compile(page(".row{display:flex;gap:16px} .i{flex:1;background:#ccc} @media (max-width:480px){.d{display:none}}", '<div class="row"><div class="i">a</div><div class="i d">b</div></div>'));
    expect(out.html.match(/<td class="t-0" width="8"/g)).toHaveLength(2);
  });

  it("a fixed column hidden on some screens keeps its cell, and warns when others follow it", () => {
    const css = ".row{display:flex} .c{width:50%} @media (max-width:480px){.d{display:none}}";
    const last = compile(page(css, '<div class="row"><div class="c">a</div><div class="c d">b</div></div>'), { lang: "en" });
    expect(last.diagnostics.map((d) => d.code)).toEqual([]);
    expect(last.html).toMatch(/<td width="300"[^>]*style="width:50%;?"/);
    const first = compile(page(css, '<div class="row"><div class="c d">a</div><div class="c">b</div></div>'));
    expect(first.diagnostics.map((d) => d.code)).toContain("W014");
  });

  it("a hidden element inside a hidden element gets no second Outlook guard", () => {
    const css = ".a,.b{display:none} @media (max-width:480px){.a{display:inline}} @media (max-width:380px){.b{display:inline}}";
    const { html } = compile(page(css, '<p>x <span class="a">one <em class="b">two</em></span> y</p>'));
    const body = html.slice(html.indexOf("<body"));
    expect(body.match(/<!--\[if !mso\]>/g)).toHaveLength(1);
    expect(body).toMatch(/<em class="[^"]*" style="[^"]*display:none;mso-hide:all">two<\/em>/);
  });

  it("a grid item hidden on some screens warns when items follow it", () => {
    const css = ".g{display:grid;grid-template-columns:1fr 1fr 1fr} @media (max-width:480px){.d{display:none}}";
    const codes = (body: string) => compile(page(css, body)).diagnostics.map((d) => d.code);
    expect(codes('<div class="g"><div>a</div><div class="d">b</div><div>c</div></div>')).toContain("W014");
    expect(codes('<div class="g"><div>a</div><div>b</div><div class="d">c</div></div>')).not.toContain("W014");
  });
});

describe("what the head styles assume is checked", () => {
  const e017 = (out: ReturnType<typeof compile>) => out.diagnostics.filter((d) => d.code === "E017");

  it("generated text that differs on a screen is E017 naming both texts, at the element", () => {
    const input = '<style>.x::before{content:"Desktop"} @media (max-width:480px){.x::before{content:"Mobile"}}</style>\n<div style="max-width:600px">\n  <p class="x">Hi</p>\n</div>';
    const out = compile(input, { strict: false });
    const [e] = e017(out);
    expect(e!.message).toBe('The max-width 480px rules change the generated text (::before / ::after) of the element at line 3, column 3: "Desktop" on the base, "Mobile" on this screen');
    expect(e!.loc).toEqual({ line: 3, col: 3 });
    expect(e!.hint).toMatch(/hide the others with display: none/);
    expect(out.html).toContain("<span>Desktop</span>");
    expect(out.html).not.toContain("@media");
  });

  it("the same text on every screen is fine", () => {
    const out = compile(page('.x::before{content:"Hi "} @media (max-width:480px){.x{padding:4px}}'));
    expect(e017(out)).toEqual([]);
    expect(out.html).toContain(".t-0 { padding:4px !important; }");
  });

  it("only the screen whose text differs is dropped", () => {
    const out = compile(page('.x::after{content:"!"} @media (max-width:480px){.x::after{content:"?"}} @media (prefers-color-scheme:dark){.x{color:#eeeeee}}'), { strict: false });
    expect(e017(out).map((d) => d.message)).toEqual([expect.stringContaining('"!" on the base, "?" on this screen')]);
    expect(out.html).toContain("prefers-color-scheme");
  });

  it("repeated elements reordered with CSS order, same tag sequence, are E017 naming both", () => {
    const input = '<style>.r{display:flex} .r>div{flex:1} @media (max-width:480px){.a{order:2}}</style>\n<div class="r" style="max-width:600px">\n<div class="a">A</div>\n<div class="b">B</div>\n</div>';
    const out = compile(input, { strict: false });
    const [e] = e017(out);
    expect(e!.message).toBe("The max-width 480px rules change the order of elements: the base has <td> (from line 3, column 1) where this screen has <td> (from line 4, column 1)");
    expect(e!.loc).toEqual({ line: 3, col: 1 });
  });

  it("order in a stacked column too; its box-less cells carry text-run markers, so the text tells", () => {
    const out = compile(page(".r{display:flex;flex-direction:column} @media (max-width:480px){.a{order:2}}", '<div class="r"><div class="a">A</div><div class="b">B</div></div>'), { strict: false });
    expect(e017(out)[0]!.message).toContain('"A" on the base, "B" on this screen');
  });

  it("Outlook-only markup that differs on a screen (the ghost table) is not compared", () => {
    const out = compile("<style>.c{max-width:640px;margin:0 auto;padding:32px;background:#eeeeee} @media (max-width:480px){.c{padding:16px}}</style><div class=\"c\">Hi</div>");
    expect(e017(out)).toEqual([]);
    expect(out.html).toContain(".t-1 { padding:16px !important; }");
  });

  it("show and hide and stacking still compile in one email", () => {
    const css = ".row{display:flex;gap:16px} .col{flex:1} .m{display:none} @media (max-width:480px){.row{flex-direction:column} .m{display:block} .d{display:none}}";
    const out = compile(page(css, '<div class="row"><div class="col">a</div><div class="col d">b</div></div><p class="m">Only on phones</p>'), { lang: "en" });
    expect(out.diagnostics).toEqual([]);
    expect(out.html).toContain(".t-0 { width:100% !important; padding:0 !important; display:block !important; }");
    expect(out.html).toContain(".t-1 { display:none !important; max-height:0 !important; overflow:hidden !important; }");
    expect(out.html).toContain(".t-2 { display:table-cell !important; max-height:none !important; overflow:visible !important; }");
  });

  it("the trace markers the compiles carry never reach the output, and a trace still points at the source", () => {
    const input = '<style>@media (max-width:480px){.x{padding:4px}}</style>\n<div style="max-width:600px">\n  <p class="x">Hello <b>there</b></p>\n</div>';
    const plain = compile(input);
    expect(plain.html).not.toContain("tddr\u{F8F0}src");
    const traced = compile(input, { trace: true });
    expect(traced.html).toBe(plain.html);
    const tags = startTags(traced.html);
    const entry = (tag: string) => traced.trace![tags.findIndex((t) => t.tag === tag)];
    expect(entry("b")).toEqual({ line: 3, col: 22 });
    // the cell that took the class is the paragraph's
    const cell = tags.findIndex((t) => traced.html.slice(t.start, t.end).includes('class="t-0"'));
    expect(traced.trace![cell]).toEqual({ line: 3, col: 3 });
  });
});

// docs/architecture.md#several-screens-one-structure: what some screen paints keeps its cell on all of them
describe("a box some screen paints or pads keeps one structure", () => {
  const W = (css: string, body: string) => `<style>.wrap{max-width:600px;margin:0 auto}${css}</style><div class="wrap">${body}</div>`;
  const row = '<div class="row"><div class="l">Label</div><div class="c">Copy</div></div>';
  const flex = ".row{display:flex;gap:16px} .c{flex:1}";
  it.each([
    ["a stretched column's fill dropped", `${flex} .l{background-color:#eeeeee} @media (max-width:480px){.l{background:none}}`, ".t-0 { background-color:transparent !important; }"],
    ["a stretched column's fill added", `${flex} @media (max-width:480px){.l{background-color:#eeeeee}}`, ".t-0 { background-color:#eeeeee !important; }"],
    ["a stretched card's padding added", `${flex} .l{background-color:#eeeeee} @media (max-width:480px){.l{padding:8px}}`, ".t-0 { padding:8px !important; }"],
    ["a stretched column's fill gone in dark", `${flex} .l{background-color:#eeeeee} @media (prefers-color-scheme:dark){.l{background-color:transparent}}`, "[data-ogsb] .t-0 { background-color:transparent !important; }"],
    ["a stacking label's border and padding dropped", `${flex} .l{border-right:1px solid #cccccc;padding-right:8px} @media (max-width:480px){.row{flex-direction:column}.l{border:0;padding:0}}`, "border-right:none !important; display:block !important; width:100% !important; }"],
  ])("%s", (_name, css, rule) => {
    const out = compile(W(css, row), { lang: "en" });
    expect(out.diagnostics.filter((d) => d.code === "E017")).toEqual([]);
    expect(out.html).toContain(rule);
  });

  // a box painted alike everywhere gets no cell the base would not give it
  const bodyOf = (html: string) => html.slice(html.indexOf("<body")).replace(/ class="[^"]*"/g, "");
  it.each([
    ["a width screen", "@media (max-width:480px){h1{font-size:20px}}"],
    ["a dark screen", "@media (prefers-color-scheme:dark){h1{color:#ffffff}}"],
  ])("a box painted alike on every screen is emitted as without %s", (_name, screen) => {
    const css = `${flex} .l,.c{background-color:#eeeeee}`;
    const plain = compile(W(css, `<h1>Title</h1>${row}`), { lang: "en" });
    const out = compile(W(css + screen, `<h1>Title</h1>${row}`), { lang: "en" });
    expect(bodyOf(out.html)).toBe(bodyOf(plain.html));
  });

  const label = '<p class="b">Label</p><p>Other</p>';
  it.each([
    ["a text block's fill dropped", ".b{background-color:#eeeeee;margin:0} @media (max-width:480px){.b{background:none}}", label, ".t-0 { background-color:transparent !important; }"],
    ["a text block's border added", ".b{margin:0} @media (max-width:480px){.b{border-left:2px solid #333333}}", label, ".t-0 { border-left:2px solid #333333 !important; }"],
    ["a text item's padding dropped", `${flex} .row p{padding-right:8px;margin:0} @media (max-width:480px){.row p{padding:0}}`, '<div class="row"><p>Label</p><div class="c">Copy</div></div>', ".t-0 { padding:0 !important; }"],
  ])("%s", (_name, css, body, rule) => {
    const out = compile(W(css, body), { lang: "en" });
    expect(out.diagnostics.filter((d) => d.code === "E017")).toEqual([]);
    expect(out.html).toContain(rule);
  });

  it("a text block padded alike on every screen is emitted as without the screen", () => {
    const css = ".b{padding:8px;margin:0}";
    const plain = compile(W(css, label), { lang: "en" });
    const out = compile(W(`${css} @media (max-width:480px){.b{font-size:20px}}`, label), { lang: "en" });
    expect(bodyOf(out.html)).toBe(bodyOf(plain.html));
  });
});

describe("ordinary style changes on a plain block still become overrides", () => {
  const W = (css: string, body = '<div class="a">One</div>') => `<style>.wrap{max-width:600px;margin:0 auto}${css}</style><div class="wrap">${body}</div>`;
  it.each([
    ["padding added", "@media (max-width:480px){.a{padding:10px}}", ".t-0 { padding:10px !important; }"],
    ["padding removed", ".a{padding:10px} @media (max-width:480px){.a{padding:0}}", ".t-0 { padding:0 !important; }"],
    ["a dark background", "@media (prefers-color-scheme:dark){.a{background-color:#111111}}", "background-color:#111111 !important;"],
    ["a hover background", ".a:hover{background-color:#eeeeee}", ":hover { background-color:#eeeeee !important; }"],
    ["background removed", ".a{background-color:#eeeeee} @media (max-width:480px){.a{background-color:transparent}}", "background-color:transparent !important;"],
    ["border added", "@media (max-width:480px){.a{border:1px solid #000000}}", "solid #000000 !important;"],
    ["background on the wrapper", "@media (max-width:480px){.wrap{background-color:#eeeeee}}", "background-color:#eeeeee !important;"],
  ])("%s", (_name, css, rule) => {
    const out = compile(W(css), { lang: "en" });
    expect(out.diagnostics.filter((d) => d.code === "E017")).toEqual([]);
    expect(out.html).toContain(rule);
  });

  it("a floated image's margin per screen is an override of its margins (hspace/vspace in Outlook)", () => {
    const img = (m: string) => compile(W(`img{float:left;margin:12px;width:100px;height:100px} @media (max-width:480px){img{margin:${m}}}`, '<p><img src="a.png" alt="A">Some text around the image.</p>'), { lang: "en" });
    expect(img("6px").diagnostics).toEqual([]);
    expect(img("6px").html).toContain("margin-left:6px !important; margin-right:6px !important; margin-top:6px !important; margin-bottom:6px !important;");
    expect(img("0").html).toContain("margin-left:0 !important;");
  });

  it("a url with & reaches the head as the url, not as &amp;", () => {
    const out = compile(W('.h{background:#333333 url("https://x.test/a.jpg?w=1&h=2") center/cover;min-height:200px;width:600px;color:#ffffff} @media (max-width:480px){.h{background-image:url("https://x.test/b.jpg?w=1&h=2")}}', '<div class="h">Hero</div>'), { strict: false });
    const head = out.html.slice(0, out.html.indexOf("</head>"));
    expect(head).toContain("b.jpg?w=1&h=2");
    expect(head).not.toContain("&amp;");
  });

  it("under white-space: pre a whitespace change in generated text is E017", () => {
    const out = compile(W('.x{white-space:pre}.x::before{content:"Hi "} @media (max-width:480px){.x::before{content:"Hi  "}}', '<div class="x">there</div>'), { strict: false });
    expect(out.diagnostics.find((d) => d.code === "E017")?.message).toContain('"Hi " on the base, "Hi  " on this screen');
    const normal = compile(W('.x::before{content:"Hi "} @media (max-width:480px){.x::before{content:"Hi  "}}', '<div class="x">there</div>'), { strict: false });
    expect(normal.diagnostics.map((d) => d.code)).not.toContain("E017");
  });

  it("a button whose radius goes on a screen names the real cause, not whitespace", () => {
    const out = compile(W(".b{display:inline-block;padding:12px 24px;background:#0050c0;color:#ffffff;text-decoration:none;width:120px;text-align:center;border-radius:6px} @media (max-width:480px){.b{border-radius:0}}", '<a class="b" href="https://x.test">Buy</a>'), { strict: false });
    const msg = out.diagnostics.find((d) => d.code === "E017")!.message;
    expect(msg).not.toContain("change the text");
    expect(msg).toContain("border-collapse");
  });
});

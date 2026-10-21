import { serialize } from "parse5";
import { adapter } from "parse5-htmlparser2-tree-adapter";
import { describe, expect, test } from "vitest";
import { parse } from "../../src/parse/html.ts";
import { sanitize } from "../../src/sanitize/sanitize.ts";
import { codesOf, styledFrom, testCtx } from "../helpers/index.ts";
import type { StyledElement } from "../../src/style/types.ts";

const ser = (n: unknown): string => serialize(n as never, { treeAdapter: adapter });

const run = (html: string) => {
  const ctx = testCtx();
  const out = sanitize(parse(html, ctx), ctx);
  return { out, ctx, html: ser(out.body) };
};

describe("sanitize", () => {
  test("removes scripts, reports I001 once at the first one", () => {
    const r = run("<p>a</p>\n<script>1</script><noscript>n</noscript><script>2</script><p>b</p>");
    expect(r.html).toBe("<p>a</p>\n<p>b</p>");
    expect(codesOf(r.ctx)).toEqual(["I001"]);
    expect(r.ctx.diagnostics.list()[0]?.loc).toEqual({ line: 2, col: 1 });
  });

  test("drops style/link/meta/base/template silently", () => {
    const r = run('<style>p{}</style><link rel="x"><meta name="a"><base href="/"><template><p>t</p></template><p>k</p>');
    expect(r.html).toBe("<p>k</p>");
    expect(codesOf(r.ctx)).toEqual([]);
  });

  test("a picture becomes its img; sources are dropped with one I007", () => {
    const r = run('<p>a</p><picture><source srcset="b.png"><source srcset="c.png"><img src="a.png" alt="x"></picture><p>b</p>');
    expect(r.html).toBe('<p>a</p><img src="a.png" alt="x"><p>b</p>');
    expect(codesOf(r.ctx)).toEqual(["I007"]);
    expect(r.ctx.diagnostics.list()[0]?.loc).toEqual({ line: 1, col: 9 });
  });

  test("a picture's own class/style/id is reported when it is unwrapped", () => {
    const r = run('<picture style="border:2px solid red"><img src="a.png"></picture>');
    expect(r.html).toBe('<img src="a.png">');
    expect(codesOf(r.ctx)).toEqual(["W001"]);
  });

  test("anything else inside a picture is reported as dropped, whitespace is not", () => {
    const a = run('<picture>\n<img src="a.png"> <img src="b.png"></picture>');
    expect(a.html).toBe('<img src="a.png">');
    expect(codesOf(a.ctx)).toEqual(["W001"]);
    const b = run('<picture><img src="a.png"><span>caption</span></picture>');
    expect(codesOf(b.ctx)).toEqual(["W001"]);
    const c = run('<picture> <source srcset="x.png"> <img src="a.png"> </picture>');
    expect(codesOf(c.ctx)).toEqual(["I007"]);
  });

  test("a stylesheet selector through a picture is reported once", () => {
    const r = run('<style>picture img{width:100%} .a, picture > img{x:y} @media (min-width:1px){p{x:y}}</style><picture><img src="a.png"></picture><picture><img src="b.png"></picture>');
    expect(codesOf(r.ctx)).toEqual(["W001", "W001"]);
    expect(r.ctx.diagnostics.list()[0]?.message).toContain("picture img");
  });

  test("a picture without sources is unwrapped silently, one without an img is left for the lint", () => {
    const a = run('<picture><img src="a.png"></picture>');
    expect(a.html).toBe('<img src="a.png">');
    expect(codesOf(a.ctx)).toEqual([]);
    const b = run('<picture><source srcset="b.png"></picture>');
    expect(b.html).toBe('<picture><source srcset="b.png"></picture>');
  });

  test("strips on* and javascript: urls, keeps normal links", () => {
    const r = run('<a href=" JaVa\nScript:alert(1)" onclick="x()">a</a><a href="https://x.y" onmouseover="y()">b</a>');
    expect(r.html).toBe('<a>a</a><a href="https://x.y">b</a>');
    expect(codesOf(r.ctx)).toEqual(["I001", "I001"]);
  });

  describe("frames, plugins and form controls", () => {
    // <frame> outside a frameset never leaves the parser.
    test.each(["iframe", "object", "embed", "applet", "portal", "fencedframe"])("removes <%s> with E008, in every mode", (tag) => {
      for (const strict of [true, false]) {
        const ctx = testCtx({ strict });
        // embed is void: nothing nests in it.
        const inner = tag === "embed" ? "" : `<p>fallback</p></${tag}>`;
        const out = sanitize(parse(`<p>a</p><${tag} src="https://x.test/" data="https://x.test/">${inner}<p>b</p>`, ctx), ctx);
        expect(ser(out.body)).toBe("<p>a</p><p>b</p>");
        expect(codesOf(ctx)).toEqual(["E008"]);
        expect(ctx.diagnostics.list()[0]?.message).toContain(`<${tag}>`);
      }
    });

    test("an iframe's srcdoc goes with it, inside raw too", () => {
      const r = run('<div data-email="raw"><iframe srcdoc="<script>alert(1)</script>"></iframe><p>k</p></div>');
      expect(r.html).toBe('<div data-email="raw"><p>k</p></div>');
      expect(codesOf(r.ctx)).toEqual(["E008"]);
    });

    test("removes form controls, keeps what else the form holds", () => {
      const r = run('<form action="https://x.test/post" method="post"><p>Name</p><input name="n"><select><option>a</option></select><textarea>t</textarea><button formaction="javascript:x()">Go</button><p>after</p></form>');
      expect(r.html).toBe("<p>Name</p><p>after</p>");
      expect(codesOf(r.ctx)).toEqual(["E008", "E008", "E008", "E008", "E008"]);
      expect(r.ctx.diagnostics.list().map((d) => d.message.split(" ")[0])).toEqual(["<input>", "<select>", "<textarea>", "<button>", "<form>"]);
    });

    test("a <button> is pointed at the bulletproof button", () => {
      const r = run("<p><button>Buy</button></p>");
      expect(r.html).toBe("<p></p>");
      expect(r.ctx.diagnostics.list()[0]?.hint).toContain('data-email="button"');
    });

    test("a hidden input is hidden content, I002", () => {
      const r = run('<p>a<input type="HIDDEN" name="t" value="x"></p>');
      expect(r.html).toBe("<p>a</p>");
      expect(codesOf(r.ctx)).toEqual(["I002"]);
    });

    test("a radio or checkbox is removed but kept for the cascade to read its state", () => {
      const r = run('<p>a<input type="radio" checked><input type="Checkbox"><input type="text"></p>');
      expect(codesOf(r.ctx)).toEqual(["E008"]);
      expect([...(r.out.stateOnly ?? [])].map((e) => e.attribs["type"])).toEqual(["radio", "Checkbox"]);
      expect(r.html).toBe('<p>a<input type="radio" checked=""><input type="Checkbox"></p>');
    });

    test("the panel a :checked hack starts on stays, the inputs don't compile", () => {
      const css = "<style>.p{display:none}#a:checked~.p1{display:block}#b:checked~.p2{display:block}</style>";
      const all = (n: StyledElement): StyledElement[] => [n, ...n.children.flatMap((c) => (c.type === "element" ? all(c) : []))];
      const ctx = testCtx();
      const els = all(styledFrom(`${css}<div><input type="radio" id="a" name="t" checked><input type="radio" id="b" name="t"><div class="p p1">one</div><div class="p p2">two</div></div>`, ctx));
      expect(els.map((e) => e.tag)).not.toContain("input");
      expect(els.filter((e) => e.attrs["class"]?.startsWith("p ")).map((e) => e.style["display"])).toEqual(["block", "none"]);
      // the reader would see these two, so the controls are lost
      expect(codesOf(ctx).filter((c) => c === "E008")).toHaveLength(2);
    });

    test("a checkbox the stylesheet hides is hidden content, I002", () => {
      const ctx = testCtx();
      styledFrom('<style>input{display:none}</style><p>a<input type="checkbox" id="x"><label for="x">b</label></p>', ctx);
      expect(ctx.diagnostics.list().map((d) => [d.code, d.message])).toEqual([["I002", "Hidden <input> dropped"]]);
    });

    test("srcdoc and formaction go wherever they sit", () => {
      const r = run('<p srcdoc="x" formaction="https://x.test/">a</p>');
      expect(r.html).toBe("<p>a</p>");
      expect(codesOf(r.ctx)).toEqual(["I001", "I001"]);
    });

    test("the body's own handlers go too", () => {
      const ctx = testCtx();
      const out = sanitize(parse('<body onload="x()" background="javascript:y()"><p>a</p></body>', ctx), ctx);
      expect(out.body.attribs).toEqual({});
      expect(codesOf(ctx)).toEqual(["I001", "I001"]);
    });
  });

  test("keeps MSO conditionals, drops other comments", () => {
    const mso =
      "<!--[if mso]><table><tr><td><![endif]--><!--[if !mso]><!--><b>x</b><!--<![endif]--><!--[if mso]></td></tr></table><![endif]-->";
    expect(run(`<body><!-- note -->${mso}<!---->`).html).toBe(mso);
  });

  test("data-* stays for the cascade (Vue scoped styles); serialization drops it", () => {
    const r = run(
      '<table><tr><td data-email="raw" data-v-7ba5bd90 data-hk="0" data-reactroot data-server-rendered="true" data-svelte-h="svelte-x" data-allow-mismatch data-foo="1" class="a svelte-1lj1c2j">x</td></tr></table>',
    );
    expect(r.html).toContain('data-v-7ba5bd90');
  });

  test("SSR markers from the pattern file", () => {
    expect(run("<table><tr><td>Hi z</td></tr><!----><td>1</td></table>").html).not.toContain("<!--");
    expect(run("<!--[--><i>x</i><i>y</i><!--]-->").html).toBe("<i>x</i><i>y</i>");
    expect(run("<p>Hi <!-- --> <!-- -->a<!-- -->42<b>x</b></p>").html).toBe("<p>Hi  a42<b>x</b></p>");
    expect(run("<div><!--$-->x<!--/$--><!--$?-->y<!--$!--></div>").html).toBe("<div>xy</div>");
    expect(run("<!--[0--><i>a</i><!--[-1--><!--]-->").html).toBe("<i>a</i>");
    expect(run("<div><!--teleport start--><p>a</p><!--teleport end--></div>").html).toBe("<div><p>a</p></div>");
    expect(run('<div data-hk="0">Hi <!--$-->Z<!--/--></div>').html).toBe('<div data-hk="0">Hi Z</div>');
    expect(run('<div hidden id="S:0"><template id="B:0"></template></div>').html).toBe('<div hidden="" id="S:0"></div>');
  });

  test("nested preheaders keep document order", () => {
    const r = run('<div data-email="preheader">A <span data-email="preheader">B</span> C</div><p>x</p>');
    expect(r.out.meta.preheader).toBe("A B C");
    expect(r.html).toBe("<p>x</p>");
    expect(codesOf(r.ctx)).toEqual([]);
  });

  test("an empty preheader is reported with its location", () => {
    const r = run('<p>x</p>\n<div data-email="preheader"> <span hidden>h</span> </div>');
    expect(r.out.meta.preheader).toBeUndefined();
    expect(codesOf(r.ctx)).toEqual(["W007"]);
    const d = r.ctx.diagnostics.list()[0]!;
    expect(d.loc).toEqual({ line: 2, col: 1 });
    expect(d.hint).toBeTruthy();
  });

  test("a preheader inside raw or outlook-only doesn't leave an empty shell behind", () => {
    const r = run('<div data-email="raw"><div data-email="preheader">x</div></div><div data-email="outlook-only"> <div data-email="preheader">y</div> </div><p>k</p>');
    expect(r.out.meta.preheader).toBe("x y");
    expect(r.html).toBe("<p>k</p>");
  });

  test("leaves the input alone and keeps locations", () => {
    const ctx = testCtx();
    const doc = parse('<body>\n<!-- c --><p onclick="a()" data-x="1">a</p><script>1</script></body>', ctx);
    const before = ser(doc.document);
    const out = sanitize(doc, ctx);
    expect(ser(doc.document)).toBe(before);
    expect(out.body).not.toBe(doc.body);
    expect(out.styles).toBe(doc.styles);
    const p = out.body.children.find((c) => "name" in c && c.name === "p");
    expect(p?.sourceCodeLocation?.startLine).toBe(2);
    expect(out.body.sourceCodeLocation?.startLine).toBe(1);
  });
});

test("javascript: hidden behind control characters is still caught", async () => {
  const { parse } = await import("../../src/parse/html.ts");
  const { sanitize } = await import("../../src/sanitize/sanitize.ts");
  const { testCtx } = await import("../helpers/index.ts");
  const ctx = testCtx();
  const out = sanitize(parse('<body><a href="\x01java\tscript:alert(1)">x</a><td background="javascript:x">y</td></body>', ctx), ctx);
  const a = out.body.children.find((c) => "name" in c && c.name === "a");
  expect(a && "attribs" in a ? a.attribs["href"] : "gone").toBeUndefined();
});

describe("sanitize", () => {
  describe("inline svg", () => {
    const svg = (inner: string) => run(`<svg viewBox="0 0 8 8">${inner}</svg><p>k</p>`);

    test("a title inside the svg is its accessible name and stays", () => {
      expect(svg('<title>Logo</title><circle r="1"/>').html).toBe('<svg viewBox="0 0 8 8"><title>Logo</title><circle r="1"></circle></svg><p>k</p>');
    });

    test("drops <script> and on* handlers, keeps the shapes", () => {
      const r = svg('<script>alert(1)</script><path d="M0 0h8v8z" onclick="x()" onload="y()"/>');
      expect(r.html).toBe('<svg viewBox="0 0 8 8"><path d="M0 0h8v8z"></path></svg><p>k</p>');
      expect(codesOf(r.ctx)).toEqual(["I001", "I001"]);
    });

    test("strips javascript: and data: hrefs, plain and xlink", () => {
      const r = svg('<a href="javascript:alert(1)"><circle r="1"/></a><a xlink:href=" JaVa&#9;script:x"><circle r="1"/></a><image href="data:text/html,hi"/><image xlink:href="data:image/svg+xml;base64,AAAA"/>');
      expect(r.html).not.toMatch(/javascript|data:|href/i);
      expect(r.html).toContain("<circle");
    });

    test("checks url() in presentation attributes like CSS", () => {
      const r = svg('<rect fill="url(javascript:alert(2))" stroke="url(#g) red" mask="url(\'data:text/html,x\')" width="1"/>');
      expect(r.html).toBe('<svg viewBox="0 0 8 8"><rect stroke="url(#g) red" width="1"></rect></svg><p>k</p>');
      expect(r.ctx.diagnostics.list().map((d) => d.message)).toEqual(["Removed javascript: URL", "Removed data: URL"]);
    });

    test("keeps an https link", () => {
      expect(svg('<a href="https://x.test/"><circle r="1"/></a>').html).toContain('href="https://x.test/"');
    });

    test("removes <foreignObject> with its html", () => {
      const r = svg('<foreignObject><div onclick="x()">hi</div></foreignObject><rect width="1" height="1"/>');
      expect(r.html).not.toMatch(/foreignobject|hi/i);
      expect(r.html).toContain("<rect");
      expect(codesOf(r.ctx)).toEqual(["I001"]);
    });

    test("removes external <use>, keeps same-document references", () => {
      const r = svg('<use href="https://evil.test/a.svg#x"/><use xlink:href="sprite.svg#i"/><use href="#local"/>');
      expect(r.html).not.toMatch(/evil|sprite/);
      expect(r.html).toContain('href="#local"');
    });

    test.each([
      ['<a><set attributeName="href" to="javascript:alert(1)"/><text>x</text></a>'],
      ['<a><animate attributeName="href" values="javascript:alert(1)"/><text>x</text></a>'],
      ['<a><set attributeName="xlink:href" to="data:text/html,x"/><text>x</text></a>'],
      ['<a><set attributeName=" HREF " to="javascript:1"/><text>x</text></a>'],
    ])("removes SMIL that sets an href: %s", (inner) => {
      const r = svg(inner);
      expect(r.html).not.toMatch(/<set|<animate|javascript|data:/);
      expect(r.html).toContain("<text>x</text>");
      expect(codesOf(r.ctx)).toEqual(["I001"]);
    });

    test("keeps animation of a harmless attribute", () => {
      const r = svg('<circle r="1"><animate attributeName="opacity" values="0;1" dur="1s"/></circle>');
      expect(r.html).toContain("<animate");
      expect(codesOf(r.ctx)).toEqual([]);
    });

    test("removes a <use> that mixes local and external references", () => {
      const r = svg('<use xlink:href="#a" href="https://e/x.svg#a"/><rect width="1" height="1"/>');
      expect(r.html).not.toMatch(/<use|e\/x/);
      expect(r.html).toContain("<rect");
    });

    test("<feImage> follows the same-document rule as <use>", () => {
      const r = svg('<filter><feImage href="https://e/x.png"/><feImage href="#local"/></filter>');
      expect(r.html).not.toContain("e/x.png");
      expect(r.html).toContain('href="#local"');
    });

  });

  describe("url schemes", () => {
    const attr = (html: string, name: string): string | undefined => {
      const r = run(html);
      const el = r.out.body.children.find((c): c is typeof r.out.body => "attribs" in c);
      return el?.attribs[name];
    };

    test.each([
      "https://x.test/a?b=1#c",
      "HTTP://x.test/",
      "mailto:a@x.test?subject=Hi",
      "tel:+15550100",
      "sms:+15550100",
      "cid:logo@x.test",
      "#top",
      "/p/1",
      "../p/1",
      "//x.test/p",
      "?page=2",
      "",
      "\uE000user.url\uE001",
      "{{unsubscribe_url}}",
      "*|UNSUB|*",
      "%%=RedirectTo(@url)=%%",
      "page/a:b",
    ])("keeps the link %s", (url) => {
      const r = run(`<a href="${url}">x</a>`);
      expect(attr(`<a href="${url}">x</a>`, "href")).toBe(url);
      expect(codesOf(r.ctx)).toEqual([]);
    });

    test.each([
      ["javascript:alert(1)", "javascript"],
      ["JavaScript:alert(1)", "javascript"],
      ["java\tscript:alert(1)", "javascript"],
      ["java&#9;script:alert(1)", "javascript"],
      ["&#106;avascript:alert(1)", "javascript"],
      ["&#x6A;&#x61;vascript&colon;alert(1)", "javascript"],
      ["\x01 javascript:alert(1)", "javascript"],
      ["javascript :alert(1)", "javascript"],
      ["java\u200bscript:alert(1)", "javascript"],
      ["\u00a0javascript:alert(1)", "javascript"],
      ["vbscript:msgbox(1)", "vbscript"],
      ["data:text/html,<script>alert(1)</script>", "data"],
      ["data:image/png;base64,AAAA", "data"],
      ["DATA:text/html;base64,PHNjcmlwdD4=", "data"],
      ["file:///etc/passwd", "file"],
      ["blob:https://x.test/1", "blob"],
      ["livescript:x", "livescript"],
    ])("removes the link %s", (url, scheme) => {
      const r = run(`<a href="${url}">x</a>`);
      expect(r.html).toBe("<a>x</a>");
      expect(codesOf(r.ctx)).toEqual(["I001"]);
      expect(r.ctx.diagnostics.list()[0]?.message).toBe(`Removed ${scheme}: URL`);
      expect(r.ctx.diagnostics.list()[0]?.hint).toContain("http, https, mailto");
    });

    test("data: is kept for images only", () => {
      expect(attr('<img src="data:image/png;base64,AAAA" alt="">', "src")).toBe("data:image/png;base64,AAAA");
      expect(attr('<img src="data:text/html,hi" alt="">', "src")).toBeUndefined();
      expect(attr('<img src="data:,hi" alt="">', "src")).toBeUndefined();
      expect(attr('<table background="data:image/gif;base64,R0lG"><tr><td>x</td></tr></table>', "background")).toBe("data:image/gif;base64,R0lG");
      expect(attr('<a href="data:image/png;base64,AAAA">x</a>', "href")).toBeUndefined();
    });

    test("checks every URL attribute, not only href and src", () => {
      for (const html of [
        '<table background="javascript:x"><tr><td>x</td></tr></table>',
        '<blockquote cite="javascript:x">q</blockquote>',
        '<video poster="vbscript:x"></video>',
        '<img lowsrc="javascript:x" src="a.png" alt="">',
        '<a ping="https://x.test/p javascript:x" href="/">x</a>',
        '<a xlink:href="javascript:x">x</a>',
        '<math><mi href="javascript:x">x</mi></math>',
      ]) {
        const r = run(html);
        expect(r.html, html).not.toMatch(/javascript|vbscript/);
        expect(codesOf(r.ctx), html).toEqual(["I001"]);
      }
    });

    test("one bad srcset candidate drops the srcset; commas in data: images don't split it", () => {
      expect(attr('<img src="a.png" srcset="a.png 1x, data:image/png;base64,AA,AA 2x" alt="">', "srcset")).toBe("a.png 1x, data:image/png;base64,AA,AA 2x");
      expect(attr('<img src="a.png" srcset="a.png 1x,javascript:x 2x" alt="">', "srcset")).toBeUndefined();
      expect(attr('<img src="a.png" srcset="data:text/html,a 1x" alt="">', "srcset")).toBeUndefined();
    });

    test("one I001 per scheme, at its first use", () => {
      const r = run('<a href="javascript:a">1</a>\n<a href="vbscript:b">2</a><a href="javascript:c">3</a>');
      expect(r.ctx.diagnostics.list().map((d) => d.message)).toEqual(["Removed javascript: URL", "Removed vbscript: URL"]);
      expect(r.ctx.diagnostics.list()[0]?.loc).toEqual({ line: 1, col: 1 });
    });
  });

  describe("tag names", () => {
    test("an element a browser can't name is unwrapped, its text kept, one I001", () => {
      const r = run("<div><scr<script>ipt>alert(1)</scr</script>ipt><p>after</p><a<b>x</a<b></div>");
      expect(r.html).not.toMatch(/<[a-z]+</i);
      expect(r.html).toBe("<div>ipt&gt;alert(1)ipt&gt;<p>after</p>x</div>");
      expect(r.ctx.diagnostics.list().map((d) => [d.code, d.message])).toEqual([["I001", "Removed element with an invalid tag name, its content kept"]]);
    });

    test("custom, Office and camelCase svg names stay", () => {
      const r = run('<x-card.v2><o:p>a</o:p><v:roundrect>b</v:roundrect><svg><linearGradient id="g"/></svg></x-card.v2>');
      expect(r.html).toContain("<x-card.v2>");
      expect(r.html).toContain("<o:p>");
      expect(r.html).toContain("<v:roundrect>");
      expect(r.html).toContain("<linearGradient");
      expect(codesOf(r.ctx)).toEqual([]);
    });
  });

  describe("markup inside conditional comments", () => {
    const messages = (r: ReturnType<typeof run>) => r.ctx.diagnostics.list().map((d) => [d.code, d.message]);

    test("loses scripts, handlers and unsafe URLs; untouched tags keep their bytes", () => {
      const vml = '<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="https://x.test/go" style="height:40px;v-text-anchor:middle;" arcsize="10%" stroke="f" fillcolor="#1a73e8"><w:anchorlock/><center>Go</center></v:roundrect>';
      const r = run(
        `<body><!--[if mso]><table role="presentation"><tr><td>${vml}<script>alert(1)</script><b onclick="a()" class=x>z</b>` +
          `<a href="jav&#x61;script:x" title=t>y</a><img src='vbscript:x' width=1/></td></tr></table><![endif]--></body>`,
      );
      expect(r.html).toBe(
        `<!--[if mso]><table role="presentation"><tr><td>${vml}<b class=x>z</b><a title=t>y</a><img width=1/></td></tr></table><![endif]-->`,
      );
      expect(messages(r)).toEqual([
        ["I001", "Removed script element"],
        ["I001", "Removed event handler attribute"],
        ["I001", "Removed javascript: URL"],
        ["I001", "Removed vbscript: URL"],
      ]);
    });

    test("obfuscated forms: split script tags, unquoted and uppercase handlers, srcdoc, embeds", () => {
      const r = run(
        "<body><!--[if IE]><scr<script></script>ipt>alert(1)</script><SCRIPT src=//x.test/a.js></SCRIPT><p ONMOUSEOVER=a()>p</p>" +
          '<iframe srcdoc="<b>x</b>" src="https://x.test"></iframe><input formaction="https://x.test" value=1><![endif]--></body>',
      );
      // `scr<script` is one tag to a browser, with an invalid name; its text is all that stays
      expect(r.html).toBe("<!--[if IE]>ipt>alert(1)<p>p</p><![endif]-->");
      expect(r.html).not.toMatch(/script|onmouseover|srcdoc|formaction/i);
      expect(codesOf(r.ctx).sort()).toEqual(["E008", "E008", "I001", "I001", "I001"]);
    });

    test.each([
      ['<img src=x onerror=alert(1) title=a"b>', ""],
      ["<a href=javascript:alert(1) title=it's>x</a>", "x</a>"],
      ["<img src=x onerror=alert(1) a='><p title='x'>", ""],
      ["<img src=x onerror=alert(1)//", ""],
      ['<a href="https://x.test" href="javascript:alert(1)">x</a>', "x</a>"],
      ['<img src="x" onerror="a()"/b>', ""],
      ["<b>k</b><img src=x onerror=alert(1)", "<b>k</b>"],
    ])("a tag a parser could read another way goes whole: %s", (inner, kept) => {
      const r = run(`<body><!--[if mso]>${inner}<![endif]--></body>`);
      expect(r.html).toBe(`<!--[if mso]>${kept}<![endif]-->`);
      expect(r.ctx.diagnostics.list().map((d) => d.message)).toEqual(["Removed malformed tag in a conditional comment"]);
    });

    test("a dropped tag can't join its neighbours into a new one", () => {
      const r = run("<body><!--[if IE]><<iframe>script>alert(1)<</iframe>/script><![endif]--></body>");
      expect(r.html).not.toMatch(/<script/i);
      expect(r.html).toMatch(/^<!--\[if IE\]>.*<!\[endif\]-->$/);
    });

    test("deep nesting gives up and empties the comment", () => {
      const r = run(`<body><!--[if IE]>${"<".repeat(20)}${"iframe>".repeat(20)}x<![endif]--></body>`);
      expect(r.html).toBe("<!--[if IE]><![endif]-->");
      expect(r.ctx.diagnostics.list().map((d) => d.message)).toContain("Removed malformed tag in a conditional comment");
    });

    test("CSS in style elements and attributes gets the sheet checks", () => {
      const r = run(
        '<body><!--[if IE]><style>p{width:expression(alert(1));color:#111}@import url(javascript:x);</style>' +
          '<p style="color:#222; background:#eee url(javascript:alert(1))">x</p><b style=\'behavior:url(a.htc)\'>y</b><![endif]--></body>',
      );
      expect(r.html).toBe('<!--[if IE]><style>p{color:#111}</style><p style="color:#222">x</p><b>y</b><![endif]-->');
      expect(r.ctx.diagnostics.list().map((d) => d.message)).toEqual([
        "Removed @import: javascript: URL",
        "Removed width: expression() runs script",
        "Removed background: javascript: URL",
        "Removed behavior: it loads script",
      ]);
    });

    test("a style that holds markup or CSS postcss can't read goes when it could hide script", () => {
      const r = run("<body><!--[if IE]><svg><style><img src=x onerror=alert(1)></style></svg><style>p{width:expression(1)</style><![endif]--></body>");
      expect(r.html).toBe("<!--[if IE]><svg></svg><![endif]-->");
      expect(codesOf(r.ctx)).toEqual(["I001", "I001"]);
    });

    test("Outlook CSS, VML styles and fonts keep their bytes", () => {
      const mso =
        "<!--[if mso]><style>table{border-collapse:collapse;mso-table-lspace:0pt}@font-face{font-family:X;src:url(data:font/woff2;base64,AA)}" +
        '.x { mso-line-height-rule: exactly; }</style><v:rect style="width:552px;height:4px;" fill="t"><v:fill src="https://x.test/a.png"/></v:rect><![endif]-->';
      const r = run(`<body>${mso}</body>`);
      expect(r.html).toBe(mso);
      expect(codesOf(r.ctx)).toEqual([]);
    });

    test("meta refresh and base go silently, as in the body", () => {
      const r = run('<body><!--[if mso]><meta http-equiv="refresh" content="0;url=javascript:alert(1)"><base href="https://x.test/"><meta name=x><![endif]--></body>');
      expect(r.html).toBe("<!--[if mso]><meta name=x><![endif]-->");
      expect(codesOf(r.ctx)).toEqual([]);
    });

    test("text with a lone < and downlevel-revealed openers stay", () => {
      const html = "<!--[if mso]><p>a < b &amp; c</p><![endif]--><!--[if !mso]><!--><i>x</i><!--<![endif]-->";
      const r = run(`<body>${html}</body>`);
      expect(r.html).toBe(html);
      expect(codesOf(r.ctx)).toEqual([]);
    });

    test("a VML fill takes a data: image like an img does", () => {
      const fill = '<!--[if gte mso 9]><v:rect fill="t"><v:fill type="tile" src="data:image/png;base64,AAAA" color="#ffffff"/></v:rect><![endif]-->';
      expect(run(`<body>${fill}</body>`).html).toBe(fill);
      expect(run('<body><!--[if mso]><v:fill src="data:text/html,x"/><![endif]--></body>').html).toBe("<!--[if mso]><v:fill/><![endif]-->");
    });

    test("a comment with nothing to clean is unchanged", () => {
      const mso = '<!--[if gte mso 9]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->';
      const r = run(`<body>${mso}</body>`);
      expect(r.html).toBe(mso);
      expect(codesOf(r.ctx)).toEqual([]);
    });
  });
});

import { describe, expect, test } from "vitest";
import { compile } from "../../src/index.ts";
import { parse } from "../../src/parse/html.ts";
import { sanitize } from "../../src/sanitize/sanitize.ts";
import { shell } from "../../src/shell/shell.ts";
import { testCtx } from "../helpers/index.ts";

const sanitized = (html: string) => {
  const ctx = testCtx();
  return sanitize(parse(html, ctx), ctx);
};

const bodyLine = (html: string): string => {
  const lines = html.split("\n");
  return lines[lines.findIndex((l) => l.startsWith("<body")) + 1]!;
};

describe("preheader", () => {
  test("sanitize moves the text into meta, whitespace collapsed, placeholders intact", () => {
    const out = sanitized('<div data-email="preheader"> Hi {{first_name}},\n  your   order </div><p>x</p>');
    expect(out.meta.preheader).toBe("Hi {{first_name}}, your order");
    expect(out.body.children.length).toBe(1);
  });

  test("shell writes the hidden div right after <body>", () => {
    const line = bodyLine(shell({ html: "", headCss: [] }, { preheader: "Hi {{n}} & co" }, testCtx(), ""));
    expect(line).toContain("display:none;max-height:0;overflow:hidden;mso-hide:all");
    expect(line).toContain("Hi {{n}} &amp; co&zwnj;&nbsp;");
  });

  test("no preheader, no div", () => {
    expect(shell({ html: "", headCss: [] }, {}, testCtx(), "")).not.toContain("mso-hide:all;font-size");
  });
});

describe("hints", () => {
  test("outlook-only wraps the lowered block in an mso conditional", () => {
    const r = compile('<p>a</p><div data-email="outlook-only" style="padding:8px">o</div>');
    expect(r.html).toMatch(/<!--\[if mso\]>[\s\S]*>o<[\s\S]*<!\[endif\]-->/);
    expect(r.html).not.toContain("data-email");
  });

  test("raw is not lowered and keeps its inner layout without diagnostics", () => {
    const r = compile('<div data-email="raw"><div style="display:flex"><span>L</span></div></div>', { lang: "en" });
    expect(r.html).toContain("display:flex");
    expect(r.html).not.toContain("data-email");
    expect(r.diagnostics).toEqual([]);
  });

  test("hints inside an outlook-only block still apply", () => {
    const btn = '<div><a data-email="button" href="https://x.test" style="color:#fff;background:#0a0">Go</a></div>';
    const inside = compile(`<div data-email="outlook-only">${btn}</div>`).html;
    const alone = compile(btn).html;
    const body = (h: string) => h.slice(h.indexOf("<body"));
    expect(body(inside)).toContain(body(alone).match(/<a [^>]*>/)![0]);
  });

  test("unknown value is an error listing valid ones", () => {
    const r = compile('<p data-email="rwa">x</p>', { strict: false });
    const d = r.diagnostics.find((x) => x.code === "E011");
    expect(d?.hint).toContain("outlook-only");
  });
});

describe("review fixes", () => {
  const body = (h: string) => h.slice(h.indexOf("<body"), h.indexOf("</body>"));
  // what Gmail or Apple Mail shows: comments end at the first -->, whatever opened them
  const seenElsewhere = (h: string) => body(h).replace(/<!--[\s\S]*?-->/g, "");

  test.each([
    ["ghost table", '<div data-email="outlook-only"><div style="max-width:300px;margin:0 auto;background:#eee">OOX1</div><p>OOX2</p></div>'],
    ["rounded button", '<div data-email="outlook-only"><a href="https://x" style="display:inline-block;padding:10px 20px;background:#00f;color:#fff;border-radius:6px">OOX1</a><p>OOX2</p></div>'],
    ["nested outlook-only", '<div data-email="outlook-only"><p>OOX1</p><div data-email="outlook-only"><p>OOX2</p></div><p>OOX3</p></div>'],
    ["raw with a conditional", '<div data-email="outlook-only"><div data-email="raw"><p>OOX1</p><!--[if mso]>m<![endif]--></div><p>OOX2</p></div>'],
  ])("outlook-only with a %s stays hidden from other clients", (_, html) => {
    const out = compile(html).html;
    expect(seenElsewhere(out)).not.toContain("OOX");
    expect(body(out)).toContain("OOX1");
  });

  test("outlook-only keeps the Outlook side of what's inside", () => {
    const out = body(compile('<div data-email="outlook-only"><a href="https://x" style="display:inline-block;padding:10px 20px;background:#00f;color:#fff;border-radius:6px">Go</a></div>').html);
    expect(out).toContain("v:roundrect");
  });

  test("preheader text skips scripts, styles and inline-hidden children", () => {
    const out = sanitized('<div data-email="preheader">Hi <script>track()</script><noscript>NS</noscript><style>.a{}</style><span style="display:none">SECRET</span><span hidden>H</span>there</div><p>x</p>');
    expect(out.meta.preheader).toBe("Hi there");
  });

  test("preheader keeps template syntax verbatim", () => {
    const out = compile('<div data-email="preheader">Hi {{ first_name | default: "there" }} {{> partial}} &amp; co</div><p>x</p>').html;
    expect(out).toContain('Hi {{ first_name | default: "there" }} {{> partial}} &amp; co');
  });
});

describe("data-email=button on something that is not a link", () => {
  test.each([
    ['<div data-email="button" style="padding:8px;background-color:#00f">Go</div>', "<a>"],
    ['<a data-email="button" style="padding:8px;background-color:#00f">Go</a>', "href"],
  ])("%s", (html, what) => {
    const r = compile(html, { strict: false });
    const d = r.diagnostics.find((x) => x.code === "W001");
    expect(d?.message).toContain("data-email");
    expect(d?.hint).toContain(what);
    expect(d?.loc).toEqual({ line: 1, col: 1 });
    expect(r.html).not.toContain("data-email");
  });
});

describe("outlook-only on a text-level element", () => {
  test("sits inside one conditional and loses the attribute", () => {
    const { html } = compile('<p style="margin:0">Hello <span data-email="outlook-only">(Outlook)</span> world</p>');
    expect(html).toContain("Hello <!--[if mso]><span>(Outlook)</span><![endif]--> world");
    expect(html).not.toContain("data-email");
  });
});

describe("outlook-only on a text-level element inside other conditionals", () => {
  const read = (html: string) => html.replace(/<!--[\s\S]*?-->/g, "");
  test("a VML button label keeps it as plain content, with no early endif", () => {
    const { html } = compile('<a href="https://x.test" data-email="button" style="display:inline-block;padding:10px 20px;background:#336;color:#fff;border-radius:6px">Buy <span data-email="outlook-only">X</span> now</a>');
    expect(html).not.toContain("tddr:");
    // comments stripped the way Gmail does: nothing of the VML label may remain
    expect(read(html)).not.toContain("roundrect");
    expect(read(html)).not.toContain("</center>");
  });

  test("nested outlook-only spans make one conditional", () => {
    const { html } = compile('<p style="margin:0">a <span data-email="outlook-only">b <span data-email="outlook-only">c</span></span> d</p>');
    expect(html).toContain("a <!--[if mso]><span>b <span>c</span></span><![endif]--> d");
  });

  test("inside a !mso block it is dropped", () => {
    const { html } = compile('<p style="margin:0">a <!--[if !mso]><!--><span data-email="outlook-only">b</span><!--<![endif]--> c</p>');
    expect(html).not.toContain(">b<");
  });
});

describe("hints on text-level elements and link boxes", () => {
  const codes = (html: string) => compile(html).diagnostics.filter((d) => d.severity !== "info").map((d) => d.code);
  test("an unknown value is E011 wherever it sits", () => {
    expect(codes('<p>hi <span data-email="nope">x</span></p>')).toEqual(["E011"]);
    expect(codes('<p><em><b data-email="nope">x</b></em></p>')).toEqual(["E011"]);
  });
  test("raw and button on a span say they are ignored", () => {
    for (const v of ["raw", "button"]) {
      const r = compile(`<p>hi <span data-email="${v}">x</span></p>`);
      expect(r.html).not.toContain("data-email");
      const d = r.diagnostics.find((x) => x.code === "W001");
      expect(d?.hint).toBeTruthy();
      expect(d?.loc?.line).toBe(1);
    }
  });
  test("a button link in text keeps its one W003", () => {
    expect(codes('<p>hi <a href="https://x.test" data-email="button" style="display:inline-block;padding:4px;background:#ddf">go</a></p>')).toEqual(["W003"]);
  });
  test("outlook-only on a span stays quiet", () => {
    expect(codes('<p>hi <span data-email="outlook-only">x</span></p>')).toEqual([]);
  });
  test("a button hint on a link around layout warns", () => {
    const html = '<a href="https://x.test" data-email="button" style="display:block"><div style="padding:10px;background:#eee"><div>box</div></div></a>';
    expect(codes(html)).toContain("W001");
    expect(codes(html.replace(' data-email="button"', ""))).not.toContain("W001");
  });
});

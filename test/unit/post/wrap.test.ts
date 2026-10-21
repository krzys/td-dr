import { describe, expect, it } from "vitest";
import { createCtx } from "../../../src/ctx.ts";
import { compile } from "../../../src/index.ts";
import { byteLength, SMTP_LINE_BYTES, WRAP_LINE_BYTES } from "../../../src/limits.ts";
import { wrapLines } from "../../../src/post/wrap.ts";

const wrap = (html: string, limit = 60) => {
  const ctx = createCtx();
  return { html: wrapLines(html, ctx, limit), diagnostics: ctx.diagnostics.list() };
};
const longest = (html: string) => Math.max(...html.split("\n").map(byteLength));
const words = (n: number, w = "word") => Array.from({ length: n }, (_, i) => `${w}${i}`).join(" ");

describe("wrapLines", () => {
  it("leaves short lines as they are", () => {
    const html = `<p>${words(5)}</p>\n<p>${words(5)}</p>`;
    expect(wrap(html).html).toBe(html);
  });

  it("breaks text at a space, so the text reads the same", () => {
    const html = `<p>${words(40)}</p>`;
    const out = wrap(html).html;
    expect(longest(out)).toBeLessThanOrEqual(60);
    expect(out.replaceAll("\n", " ")).toBe(html);
  });

  it("counts UTF-8 bytes, not characters", () => {
    const html = `<p>${words(20, "ééé")}</p>`;
    expect(html.length).toBeLessThan(140);
    expect(longest(wrap(html, 100).html)).toBeLessThanOrEqual(100);
  });

  it("breaks between attributes and after a style declaration, never inside a value or url()", () => {
    const img = "url(data:image/png;base64,iVBORw0KGgo;AAAA)";
    const html = `<td class="a b c d e f" title="one two three four five" style="color:#111;background-image:${img};padding:0 0 16px 0;font-size:14px">x</td>`;
    const out = wrap(html, 50).html;
    expect(out).toContain('title="one two three four five"');
    expect(out).toContain('class="a b c d e f"');
    expect(out).toContain(img);
    expect(out).toMatch(/;\npadding:0 0 16px 0;/);
    expect(out.replace(/\n(?=[a-z-]+:)/g, "").replaceAll("\n", " ")).toBe(html);
  });

  it("reads &quot; and &#39; in a style attribute as the quotes of a CSS string", () => {
    const fonts = "font-family:&quot;Plume Sans; Text&quot;, &#39;Ink; Serif&#39;, Arial";
    const html = `<td style="color:#111;${fonts};padding:0 0 16px 0;font-size:14px">x</td>`;
    const out = wrap(html, 40).html;
    expect(out).toContain(fonts);
    expect(out.replaceAll("\n", "")).toBe(html);
  });

  it("breaks a <style> after a rule or declaration", () => {
    const rules = Array.from({ length: 8 }, (_, i) => `.c${i}{color:#${i}${i}${i};font-family:'A B', serif}`).join("");
    const out = wrap(`<style>${rules}</style>`).html;
    expect(longest(out)).toBeLessThanOrEqual(60);
    expect(out.replaceAll("\n", "")).toBe(`<style>${rules}</style>`);
    expect(out).toContain("'A B'");
  });

  it("keeps the spaces of preformatted text", () => {
    for (const open of ["<pre>", '<td style="white-space:pre-wrap">', "<textarea>"]) {
      const tag = /<(\w+)/.exec(open)![1];
      const html = `${open}<span>${words(30)}</span></${tag}><p>${words(30)}</p>`;
      const out = wrap(html).html;
      expect(out.slice(out.indexOf("<span>"), out.indexOf(`</${tag}>`))).not.toContain("\n");
      expect(out.slice(out.indexOf("<p>"))).toContain("\n");
    }
  });

  it("leaves conditional markers whole and Outlook-only text unbroken", () => {
    const html = `<!--[if mso]><table role="presentation" width="600"><tr><td>${words(20)}</td></tr></table><![endif]--><!--[if !mso]><!--><p>${words(20)}</p><!--<![endif]-->`;
    const out = wrap(html, 40).html;
    for (const marker of ["<!--[if mso]>", "<![endif]-->", "<!--[if !mso]><!-->", "<!--<![endif]-->"]) expect(out).toContain(marker);
    const mso = out.slice(0, out.indexOf("<![endif]-->"));
    expect(mso).toContain(words(20));
    expect(mso).toContain("\n");
    expect(mso.replaceAll("\n", " ")).toBe(html.slice(0, html.indexOf("<![endif]-->")));
    expect(out.slice(out.indexOf("<p>"))).toContain("\n");
  });

  it("never breaks inside a template tag", () => {
    const tags = ["{{ name | escape }}", "{% if order.total > 100 %}", "{{#each items as |item|}}", "{{{ raw stuff }}}"];
    const html = `<p>${Array.from({ length: 6 }, () => tags.join(" text with spaces ")).join(" ")}</p>`;
    const out = wrap(html).html;
    expect(out).not.toBe(html);
    for (const t of tags) expect(out.split(t).length).toBe(html.split(t).length);
  });

  it("leaves comments whole", () => {
    const html = `<!-- ${words(30)} --><p>x</p>`;
    expect(wrap(html).html).toBe(html);
  });

  it("is stable: a wrapped page wraps to itself", () => {
    const html = `<p style="font-family:Arial;color:#111;margin:0">${words(200)}</p>`;
    const once = wrap(html).html;
    expect(wrap(once).html).toBe(once);
  });

  it("reports a line it can't break with W019", () => {
    const url = `https://example.com/${"a".repeat(1200)}`;
    const { html, diagnostics } = wrap(`<p>${words(5)}</p>\n<a href="${url}">go</a>`, WRAP_LINE_BYTES);
    expect(html.split("\n")).toEqual([`<p>${words(5)}</p>`, "<a", `href="${url}">go</a>`]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ code: "W019", severity: "warning" });
    expect(diagnostics[0]!.message).toContain("Output line 3 is 1,234 bytes");
  });

  it("says nothing for a long line it could break", () => {
    expect(wrap(`<p>${words(400)}</p>`, WRAP_LINE_BYTES).diagnostics).toEqual([]);
  });
});

describe("compile", () => {
  it("keeps every output line under SMTP's limit", () => {
    const html = `<div style="max-width:600px;margin:0 auto"><p style="font-family:Arial, sans-serif;font-size:9px;line-height:16px">${words(300)}</p></div>`;
    const { html: out, diagnostics } = compile(html);
    expect(longest(out)).toBeLessThanOrEqual(WRAP_LINE_BYTES);
    expect(longest(out)).toBeLessThan(SMTP_LINE_BYTES);
    expect(diagnostics.map((d) => d.code)).not.toContain("W019");
  });
});

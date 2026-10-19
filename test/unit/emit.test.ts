import { describe, expect, test } from "vitest";
import { emit } from "../../src/emit/emit.ts";
import { compile } from "../../src/index.ts";
import { checkEmitReady, emptyBox, sides, type Box, type Node } from "../../src/ir/index.ts";
import { testCtx } from "../helpers/index.ts";

const inline = (html: string, style: Record<string, string> = {}): Node => ({
  kind: "inline",
  html,
  style,
  margin: sides(0),
});
const stack = (children: Node[], box: Partial<Box> = {}): Node => ({
  kind: "stack",
  box: { ...emptyBox(), ...box },
  children,
  gap: 0,
  collapse: false,
  resolvedWidth: 600,
});
const run = (n: Node) => emit(checkEmitReady(n), testCtx());
const TABLE =
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;">';

describe("emit", () => {
  test("plain stack: one table, one row per child, html verbatim", () => {
    const { html, headCss } = run(stack([inline("<p>a</p>", { color: "#111" }), inline("b")]));
    expect(headCss).toEqual([]);
    expect(html).toBe(
      [
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;">',
        "<tr>",
        '<td style="color:#111;"><p>a</p></td>',
        "</tr>",
        "<tr>",
        "<td>b</td>",
        "</tr>",
        "</table>",
      ].join("\n"),
    );
  });

  test("a full-width box shares its slot cell, and a lone inline child shares it too", () => {
    const { html } = run(
      stack([stack([inline("x")], {
        padding: sides(10, 20),
        background: "#fff",
        border: { top: { width: 1, style: "solid", color: "#ccc" } },
      })]),
    );
    expect(html).toBe(
      [
        TABLE,
        "<tr>",
        '<td bgcolor="#ffffff" style="padding:10px 20px;background-color:#fff;border-top:1px solid #ccc;">x</td>',
        "</tr>",
        "</table>",
      ].join("\n"),
    );
  });

  test("padding-only wrappers fold into the child's cell", () => {
    const wrapped = stack([inline("x")], { padding: sides(8, 0) });
    expect(run(stack([stack([wrapped], { padding: sides(0, 0, 4, 0) })])).html).toBe(
      [TABLE, "<tr>", '<td style="padding:8px 0 12px 0;">x</td>', "</tr>", "</table>"].join("\n"),
    );
  });

  test("a box with several children keeps an inner table of rows", () => {
    const { html } = run(stack([stack([inline("a"), inline("b")], { padding: sides(5), background: "#eee" })]));
    expect(html).toBe(
      [
        TABLE,
        "<tr>",
        '<td bgcolor="#eeeeee" style="padding:5px;background-color:#eee;">',
        TABLE,
        "<tr>",
        "<td>a</td>",
        "</tr>",
        "<tr>",
        "<td>b</td>",
        "</tr>",
        "</table>",
        "</td>",
        "</tr>",
        "</table>",
      ].join("\n"),
    );
  });

  test("sizing: px width, pct width, maxWidth and centering", () => {
    const tag = (attrs: string) => `<table role="presentation" width=${attrs} cellpadding="0" cellspacing="0" border="0"`;
    expect(run(stack([inline("x")], { width: { px: 300 } })).html).toBe(
      `${tag('"300"')} style="width:300px;">\n<tr>\n<td>x</td>\n</tr>\n</table>`,
    );
    expect(run(stack([inline("x")], { width: { pct: 50 } })).html).toBe(
      `${tag('"50%"')} style="width:50%;table-layout:fixed;">\n<tr>\n<td>x</td>\n</tr>\n</table>`,
    );
    expect(run(stack([inline("x")], { maxWidth: 600, align: "center" })).html).toBe(
      `${tag('"100%"')} align="center" style="width:100%;max-width:600px;margin:0 auto;table-layout:fixed;">\n<tr>\n<td>x</td>\n</tr>\n</table>`,
    );
    expect(run(stack([inline("x")], { width: { pct: 50 }, align: "center" })).html).toBe(
      `${tag('"50%"')} align="center" style="width:50%;margin:0 auto;table-layout:fixed;">\n<tr>\n<td>x</td>\n</tr>\n</table>`,
    );
    // a fixed px table is centered by align alone
    const px = run(stack([inline("x")], { width: { px: 300 }, align: "right" })).html;
    expect(px).toBe(`${tag('"300"')} align="right" style="width:300px;">\n<tr>\n<td>x</td>\n</tr>\n</table>`);
    expect(run(stack([inline("x")], { width: { px: 300 }, align: "center" })).html).not.toContain("margin");
  });

  test("px width stack with padding: box td carries width attr and css", () => {
    const { html } = run(stack([inline("x")], { width: { px: 300 }, padding: sides(8) }));
    expect(html).toContain('<td width="300" style="width:300px;padding:8px;">');
  });

  test("empty stack emits no rows and no blank cells", () => {
    expect(run(stack([])).html).toBe("");
    const padded = run(stack([], { padding: sides(8) })).html;
    expect(padded).not.toMatch(/<td[^>]*>\s*<\/td>/);
    // a spacer: zero-sized text so Word doesn't add a line of height
    expect(padded).toBe(
      [TABLE, "<tr>", '<td style="padding:8px;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td>', "</tr>", "</table>"].join("\n"),
    );
  });

  test("root background is handed to the shell, not painted", () => {
    const r = run(stack([inline("x")], { background: "#eee", padding: sides(4) }));
    expect(r.background).toBe("#eee");
    expect(r.html).not.toContain("#eee");
    expect(r.html).not.toContain("bgcolor");
    expect(r.html).not.toContain("background-color");
    expect(r.html).toContain('<td style="padding:4px;">');
  });

  test("conditional wraps the whole row, so Outlook never sees an empty td", () => {
    const m = run(stack([{ kind: "conditional", target: "mso", child: { kind: "raw", html: "<i>o</i>" } }])).html;
    expect(m).toBe([TABLE, "<!--[if mso]><tr>", "<td><i>o</i></td>", "</tr><![endif]-->", "</table>"].join("\n"));
    const n = run(stack([{ kind: "conditional", target: "not-mso", child: stack([inline("z")]) }])).html;
    expect(n).toBe([TABLE, "<!--[if !mso]><!--><tr>", "<td>z</td>", "</tr><!--<![endif]-->", "</table>"].join("\n"));
    expect(run({ kind: "conditional", target: "not-mso", child: inline("z") }).html).toBe(
      "<!--[if !mso]><!-->z<!--<![endif]-->",
    );
  });

  test("inline text style: quotes escaped, px line-height gets the mso rule", () => {
    const { html } = run(stack([inline("t", { "font-family": '"Open Sans",Arial', "line-height": "24px" })]));
    expect(html).toContain(
      `style="font-family:'Open Sans',Arial;line-height:24px;mso-line-height-rule:exactly;"`,
    );
  });

  test("line-height: unitless/em get no mso rule, an existing rule isn't duplicated", () => {
    expect(run(stack([inline("t", { "line-height": "1.5" })])).html).not.toContain("mso-line-height-rule");
    expect(run(stack([inline("t", { "line-height": "1.5em" })])).html).not.toContain("mso-line-height-rule");
    const h = run(stack([inline("t", { "line-height": "20px", "mso-line-height-rule": "exactly" })])).html;
    expect(h.match(/mso-line-height-rule/g)).toHaveLength(1);
  });

  test("a heading states a normal line height, which clients' own h1–h6 rules would replace", () => {
    const body = (h: string) => h.slice(h.indexOf("<body"));
    expect(body(compile("<h1>Hi</h1><p>text</p>", { lang: "en" }).html)).toMatch(/<h1 style="[^"]*line-height:normal;[^"]*">Hi<\/h1>[\s\S]*<p style="(?![^"]*line-height)[^"]*">text/);
    expect(body(compile('<div style="line-height:20px"><h2>Hi</h2></div>', { lang: "en" }).html)).toMatch(/<h2 style="[^"]*line-height:20px;[^"]*mso-line-height-rule:exactly;[^"]*">Hi/);
  });

  test("attribute values escape & and <", () => {
    const { html } = run(stack([inline("t", { "font-family": "A&B<C" })], { padding: sides(1), background: "a&b<c" }));
    expect(html).toContain('font-family:A&amp;B&lt;C;"');
    expect(html).not.toContain("bgcolor");
    const r = emit(checkEmitReady(stack([stack([inline("t")], { background: "a&b<c" })])), testCtx()).html;
    expect(r).not.toContain("bgcolor"); // not a colour bgcolor can parse
    expect(r).toContain("background-color:a&amp;b&lt;c;");
  });

  test("raw is verbatim", () => {
    expect(run({ kind: "raw", html: " <b>  x </b> " }).html).toBe(" <b>  x </b> ");
  });

  test("non-zero gap throws", () => {
    expect(() => run({ ...(stack([]) as Extract<Node, { kind: "stack" }>), gap: 8 })).toThrow("gap");
    expect(() => run({ kind: "row", box: emptyBox(), gap: 8, wrap: false, cols: [], resolvedWidth: 600 })).toThrow("gap");
  });

  test("a rounded box keeps its own table with separate borders, or browsers drop the radius", () => {
    const { html } = run(stack([stack([inline("x")], { padding: sides(8), background: "#fff", radius: 6 })]));
    expect(html).toContain("border-collapse:separate;");
    expect(html).toContain("border-radius:6px;");
  });
});

describe("side-bordered boxes", () => {
  const page = (css = "") =>
    `<style>p{margin:0}.q{border-left:4px solid #dc2626;padding-left:12px}${css}</style><div style="max-width:600px;margin:0 auto"><p>a</p><p class="q">b</p><p>c</p></div>`;
  test("get a table of their own, so the stack's collapsed column keeps no border for the siblings", () => {
    const { html } = compile(page(), { lang: "en" });
    expect(html).toMatch(/<td>\n<table role="presentation" width="100%"[^>]*>\n<tr>\n<td style="padding:0 0 0 12px;border-left:4px solid #dc2626;"><p style="margin:0">b<\/p><\/td>/);
  });

  test("the base screen's border decides for every screen, so they keep one structure", () => {
    const off = compile(page("@media (max-width:480px){.q{border-left:0}}"), { lang: "en" });
    expect(off.diagnostics.filter((d) => d.code === "E017")).toEqual([]);
    expect(off.html).toContain("border-left:none !important;");
    const on = compile(`<style>p{margin:0}@media (max-width:480px){.q{border-left:4px solid #dc2626}}</style><div style="max-width:600px;margin:0 auto"><p>a</p><p class="q" style="padding-left:12px">b</p></div>`, { lang: "en" });
    expect(on.diagnostics.filter((d) => d.code === "E017")).toEqual([]);
  });
});

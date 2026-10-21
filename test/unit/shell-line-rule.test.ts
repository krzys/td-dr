import { describe, expect, test } from "vitest";
import { compile } from "../../src/index.ts";
import { hoistLineRule } from "../../src/shell/line-rule.ts";
import { shell } from "../../src/shell/shell.ts";
import { testCtx } from "../helpers/index.ts";

const R = "mso-line-height-rule:exactly";
const p = (style = `font-size:16px;line-height:24px;${R};margin:0`): string => `<p style="${style}">x</p>`;
const many = (n: number, f: () => string = p): string => Array.from({ length: n }, f).join("\n");
const head = (tags: string): string => `<!--[if mso]>\n<style>${tags}{${R};}</style>\n<![endif]-->`;

describe("hoistLineRule", () => {
  test("a tag whose every element has it inline gets it from one Outlook-only rule", () => {
    const out = hoistLineRule(`<td style="padding:0;">${many(4)}<h1 style="line-height:30px;${R};">a</h1><h1 style="${R}">b</h1></td>`);
    expect(out.head).toBe(head("p,h1"));
    expect(out.body).not.toContain(R);
    expect(out.body).toContain('<p style="font-size:16px;line-height:24px;margin:0">');
    expect(out.body).toContain('<h1 style="line-height:30px;">a</h1><h1>b</h1>');
  });

  test("one element of the tag without it keeps the tag's inline: no line height, a non-px one or a filler", () => {
    for (const odd of [p("margin:0"), p("line-height:normal;margin:0"), p("line-height:1.5;margin:0")]) {
      const out = hoistLineRule(`${many(6)}${odd}`);
      expect(out.head).toBeUndefined();
      expect(out.body.split(R)).toHaveLength(7);
    }
    const fillers = `${many(6, () => `<td style="font-size:0;line-height:0;${R};">&nbsp;</td>`)}<td style="padding:0;">${many(6)}</td>`;
    const out = hoistLineRule(fillers);
    expect(out.head).toBe(head("p"));
    expect(out.body.split(R)).toHaveLength(7);
    expect(out.body).toContain(`<td style="font-size:0;line-height:0;${R};">&nbsp;</td>`);
  });

  test("an author's other value, or the rule written another way, keeps it inline", () => {
    for (const odd of [p(`line-height:24px;mso-line-height-rule:at-least`), p(`line-height:24px;${R};mso-line-height-rule:at-least`), p("line-height:24px;mso-line-height-rule: exactly")]) {
      expect(hoistLineRule(`${many(6)}${odd}`).head).toBeUndefined();
    }
  });

  test("only the tags the font override names, and only where it is smaller", () => {
    expect(hoistLineRule(many(6, () => `<ul style="line-height:20px;${R}">x</ul>`)).head).toBeUndefined();
    expect(hoistLineRule(many(2)).head).toBeUndefined();
    expect(hoistLineRule(many(4)).head).toBe(head("p"));
  });

  test("the shell's own elements count, and the block sits in the head", () => {
    const out = shell({ html: many(6, () => `<td style="line-height:20px;${R}">x</td>`), headCss: [] }, {}, testCtx(), "");
    expect(out).not.toContain(`{${R};}`);
    expect(out.split(R)).toHaveLength(7);
    const ps = shell({ html: many(6), headCss: [] }, {}, testCtx(), "");
    expect(ps.indexOf(head("p"))).toBeGreaterThan(-1);
    expect(ps.indexOf(head("p"))).toBeLessThan(ps.indexOf("</head>"));
    expect(ps.slice(ps.indexOf("<body"))).not.toContain(R);
  });
});

describe("in a compile", () => {
  const input = `<div style="max-width:600px;margin:0 auto;font:16px/24px Arial">${many(5, () => "<p>Some text</p>")}<h2 style="line-height:normal">Head</h2></div>`;
  test("paragraphs take the head rule, a heading without a px line height keeps none", () => {
    const { html, diagnostics } = compile(input);
    expect(html).toContain(head("p"));
    const body = html.slice(html.indexOf("<body"));
    expect(body).not.toContain(R);
    expect(body).toMatch(/<p style="[^"]*line-height:24px[^"]*">Some text<\/p>/);
    expect(body).toMatch(/<h2 style="[^"]*line-height:normal[^"]*">Head<\/h2>/);
    expect(diagnostics.filter((d) => d.severity !== "info")).toEqual([]);
  });
});

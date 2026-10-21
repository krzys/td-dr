import { describe, expect, test } from "vitest";
import { emitFluidRow } from "../../src/emit/fluid.ts";
import { UNTRACED } from "../../src/emit/trace.ts";
import { emit } from "../../src/emit/emit.ts";
import { checkEmitReady, emptyBox, sides, type Box, type Column, type Node, type RowNode } from "../../src/ir/index.ts";
import { testCtx } from "../helpers/index.ts";
import { lintEmail } from "../harness/golden-lint.test.ts";

const inline = (html: string): Node => ({ kind: "inline", html, style: { "font-size": "14px" }, margin: sides(0) });
const col = (html: string, px?: number, c: Partial<Column> = {}): Column => ({
  width: px === undefined ? { auto: true } : { px },
  valign: "top",
  child: inline(html),
  ...(px === undefined ? {} : { resolved: { px, pct: 0 } }),
  ...c,
});
const row = (cols: Column[], resolvedWidth?: number, box: Partial<Box> = {}): RowNode => ({
  kind: "row",
  box: { ...emptyBox(), ...box },
  gap: 0,
  wrap: true,
  cols,
  ...(resolvedWidth === undefined ? {} : { resolvedWidth }),
});
const fluid = (r: RowNode) => emitFluidRow(UNTRACED, r, () => "CHILD");

describe("emitFluidRow", () => {
  test("font-size:0 wrapper, one ghost table, a conditional between columns, no whitespace around them", () => {
    const { html, css } = fluid(row([col("a", 300), col("b", 300)], 600));
    expect(css).toEqual([]);
    expect(html.startsWith('<div style="font-size:0;text-align:left;">')).toBe(true);
    expect(html.match(/<!--\[if mso\]><table /g)).toHaveLength(1);
    expect(html).toContain('width="600"><tr><![endif]--><!--[if mso]><td width="300" valign="top"><![endif]--><div class="tddr-col"');
    expect(html).toContain('</div><!--[if mso]></td><td width="300" valign="top"><![endif]--><div class="tddr-col"');
    expect(html).toMatch(/<\/div><!--\[if mso\]><\/td><\/tr><\/table><!\[endif\]--><\/div>$/);
    expect(lintEmail(html)).toEqual([]);
  });

  test("each column is a 100% wide inline-block capped at its px, with an inner table and a font-size reset", () => {
    const { html } = fluid(row([col("a", 212, { padding: sides(0, 6, 8, 6) })], 600));
    expect(html).toContain('<div class="tddr-col" style="display:inline-block;vertical-align:top;width:100%;max-width:212px;">');
    expect(html).toContain('<td style="padding:0 6px 8px 6px;font-size:14px;text-align:left;">a</td>');
    expect(fluid(row([{ ...col("a", 100), child: { kind: "raw", html: "r" } }], 600)).html).toContain("font-size:16px;");
  });

  test("a calc column is a % inline-block, never a px cap", () => {
    const calcCol = (px: number, pct: number): Column => ({ ...col("a", px), width: { calc: { pct: 50, px: -10 } }, resolved: { px, pct } });
    const { html } = fluid(row([calcCol(300, 48.33), calcCol(300, 48.33)], 600));
    expect(html.match(/vertical-align:top;width:50%;"/g)).toHaveLength(2);
    expect(html).not.toContain("max-width:");
  });

  test("a % column whose max-width is below its share keeps both: width:P% and max-width", () => {
    const capped = (c: Column, max = 200): Column => ({ ...c, width: { pct: 50 }, resolved: { px: Math.min(max, 300), pct: 50 }, child: { kind: "stack", box: { ...emptyBox(), maxWidth: max }, children: [], gap: 0, collapse: false } });
    const { html } = emitFluidRow(UNTRACED, row([capped(col("a", 200))], 600), () => "X");
    expect(html).toContain("vertical-align:top;width:50%;max-width:200px;");
    const roomy = emitFluidRow(UNTRACED, row([capped(col("a"), 400)], 600), () => "X");
    expect(roomy.html).toContain("vertical-align:top;width:50%;");
    expect(roomy.html).not.toContain("max-width:300px");
  });

  test("non-inline children go through emitChild", () => {
    const stack: Node = { kind: "stack", box: emptyBox(), children: [], gap: 0, collapse: false };
    const { html } = emitFluidRow(UNTRACED, row([col("a", 100, { child: stack })], 600), (n) => (n === stack ? "<table>STACK</table>" : ""));
    expect(html).toContain("<table>STACK</table>");
  });

  test("auto columns hug their content and don't get a td width", () => {
    const { html } = fluid(row([col("a"), col("b")], 600));
    expect(html).toContain('<div class="tddr-col" style="display:inline-block;vertical-align:top;">');
    expect(html).toContain('<!--[if mso]><td valign="top"><![endif]-->');
    expect(html).toMatch(/<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>/);
    expect(html).not.toContain('border="0" width=');
  });

  test("columns that don't fit get one ghost table per line, cut where the browser wraps", () => {
    const { html } = fluid(row([col("a", 226), col("b", 226), col("c", 226)], 600, { padding: sides(12) }));
    expect(html.match(/<!--\[if mso\]><table /g)).toHaveLength(2);
    expect(html).toContain('width="452"><tr>');
    expect(html).toContain('width="226"><tr>');
    expect(html).toContain("</td></tr></table><![endif]--><!--[if mso]><table ");
    expect(lintEmail(html)).toEqual([]);
  });

  test("a % column is a % of the line with no cap, and Outlook gets its px", () => {
    const pct = (px: number) => col("a", px, { width: { pct: 49 }, resolved: { px, pct: 49 } });
    const { html } = fluid(row([pct(294), pct(294)], 600));
    expect(html).toContain('style="display:inline-block;vertical-align:top;width:49%;"');
    expect(html).not.toContain("max-width");
    expect(html).toContain('width="588"><tr>');
    expect(html).toContain('<td width="294" valign="top">');
    expect(lintEmail(html)).toEqual([]);
  });

  test("grown px columns stay 100% wide caps; each line's ghost row adds up to its table", () => {
    const grown = (px: number) => col("a", px, { width: { px: 184, grow: 1 } });
    const { html } = fluid(row([grown(300), grown(300), grown(600)], 600));
    expect(html.match(/width:100%;max-width:300px;/g)).toHaveLength(2);
    expect(html).toContain('width:100%;max-width:600px;');
    expect(html.match(/<!--\[if mso\]><table [^>]*width="600">/g)).toHaveLength(2);
    expect(lintEmail(html)).toEqual([]);
  });

  test("centered and right-aligned columns align the wrapped lines", () => {
    expect(fluid(row([col("a", 100, { align: "center" }), col("b", 100, { align: "center" })], 600)).html).toContain("font-size:0;text-align:center;");
    expect(fluid(row([col("a", 100, { align: "right" })], 600)).html).toContain('align="right"');
    expect(fluid(row([col("a", 100, { align: "center" }), col("b", 100)], 600)).html).toContain("font-size:0;text-align:left;");
  });
});

describe("emit() with a wrap row", () => {
  test("the row's box wraps the fluid markup", () => {
    const { html, headCss } = emit(checkEmitReady(row([col("a", 200), col("b", 200)], 600, { padding: sides(10), background: "#fafafa" })), testCtx());
    expect(lintEmail(html)).toEqual([]);
    expect(html).toContain('<td bgcolor="#fafafa" style="padding:10px;background-color:#fafafa;">');
    expect(html).toContain('<div style="font-size:0;text-align:left;">');
    expect(headCss).toEqual([]);
  });

  test("a wrap row nested in a stack is still fluid", () => {
    const r = row([col("a", 200)], 600, { background: "#eee" });
    const { html } = emit(checkEmitReady({ kind: "stack", box: emptyBox(), children: [r], gap: 0, collapse: false, resolvedWidth: 600 }), testCtx());
    expect(html).toContain("tddr-col");
    expect(lintEmail(html)).toEqual([]);
  });
});

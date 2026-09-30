import { describe, expect, test } from "vitest";
import { emitButton } from "../../src/emit/button.ts";
import { UNTRACED } from "../../src/emit/trace.ts";
import { emptyBox, sides, type Box, type BorderSide, type ButtonNode } from "../../src/ir/index.ts";
import { lintEmail } from "../harness/golden-lint.test.ts";

const button = (box: Partial<Box> = {}): ButtonNode => ({
  kind: "button",
  box: { ...emptyBox(), padding: sides(12, 24), background: "#1d4ed8", ...box },
  href: "https://x.test/?a=1&b=2",
  content: "Go now",
  style: { color: "#ffffff", "font-size": "16px", "line-height": "20px", "text-decoration": "none" },
});

const side: BorderSide = { width: 2, style: "solid", color: "#1d4ed8" };

describe("emitButton", () => {
  test("square button: table > td > a, no VML", () => {
    const html = emitButton(UNTRACED, button());
    expect(html).toMatch(/^<table role="presentation" border="0" cellpadding="0" cellspacing="0" align="left"/);
    expect(html).toContain('<td align="center" bgcolor="#1d4ed8" style="background-color:#1d4ed8;mso-padding-alt:12px 24px;">');
    expect(html).toContain(
      '<a href="https://x.test/?a=1&amp;b=2" style="display:inline-block;padding:12px 24px;color:#ffffff;font-size:16px;line-height:20px;text-decoration:none;text-align:left;mso-line-height-rule:exactly;">Go now</a>',
    );
    expect(html).not.toContain("v:roundrect");
    expect(html).not.toContain("[if");
  });

  test("an author's own mso-line-height-rule is kept once, like on text cells", () => {
    const html = emitButton(UNTRACED, { ...button(), style: { ...button().style, "mso-line-height-rule": "at-least" } });
    expect(html.match(/mso-line-height-rule/g)).toHaveLength(1);
    expect(html).toContain("mso-line-height-rule:at-least;");
  });

  test("radius adds VML with an estimated size and a guarded html button", () => {
    const html = emitButton(UNTRACED, button({ radius: 6 }));
    expect(html).toContain("border-radius:6px");
    expect(html).toContain("<!--[if mso]><v:roundrect");
    expect(html).toContain("<!--[if !mso]><!--><table");
    expect(html).toContain("<!--<![endif]-->");
    // 6 chars * 16 * 0.6 + 48 wide, 20 + 24 high
    expect(html).toContain("height:44px;v-text-anchor:middle;width:106px;");
    expect(html).toContain('arcsize="14%"');
    expect(lintEmail(html)).toEqual([]);
  });

  test("a px width sizes the table, the VML and makes the link fill the cell", () => {
    const html = emitButton(UNTRACED, button({ radius: 8, width: { px: 200 }, align: "center" }));
    expect(html).toContain('width="200" align="center" style="width:200px;border-collapse:separate;"');
    expect(html).toContain("height:44px;v-text-anchor:middle;width:200px;");
    expect(html).toContain("display:block;padding:12px 24px;");
  });

  test("borders go on the cell and the VML stroke", () => {
    const html = emitButton(UNTRACED, button({ radius: 20, border: { top: side, right: side, bottom: side, left: side } }));
    expect(html).toContain("border-top:2px solid #1d4ed8");
    expect(html).toContain('strokecolor="#1d4ed8" strokeweight="2px"');
  });

  test("full width stays full width", () => {
    expect(emitButton(UNTRACED, button({ width: { pct: 100 } }))).toContain('width="100%"');
  });

  test("a capped button stays fluid, Outlook gets the cap as a ghost table and VML", () => {
    const html = emitButton(UNTRACED, button({ radius: 6, width: { pct: 100 }, maxWidth: 440, align: "center" }));
    expect(html).toContain("width:100%;max-width:440px;");
    expect(html).toContain('<!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="440" align="center">');
    expect(html).toContain("width:440px;");
    expect(lintEmail(html)).toEqual([]);
  });

  test("a percentage width has no known VML size, so a rounded button stays square in Outlook", () => {
    const html = emitButton(UNTRACED, button({ radius: 8, width: { pct: 100 } }));
    expect(html).not.toContain("v:roundrect");
    expect(html).toContain("border-radius:8px");
    expect(lintEmail(html)).toEqual([]);
  });

  test("a px width with a border keeps the VML width and the stroke matches the border", () => {
    const b = { top: side, right: side, bottom: side, left: side };
    const html = emitButton(UNTRACED, button({ radius: 8, width: { px: 220 }, border: b, background: "#ffffff" }));
    expect(html).toContain("width:220px;");
    expect(html).toContain('strokeweight="2px"');
    expect(html).toContain('strokecolor="#1d4ed8"');
    expect(lintEmail(html)).toEqual([]);
  });

  test("inline markup in the label is kept in the VML and the size estimate counts visible text only", () => {
    const n = { ...button({ radius: 6 }), content: "<b>Save</b> &amp; go" };
    const html = emitButton(UNTRACED, n);
    expect(html).toContain("<center");
    expect(html.match(/<b>Save<\/b> &amp; go/g)).toHaveLength(2);
    // "Save x go" is 9 visible chars: 9 * 16 * 0.6 + 48
    expect(html).toContain("width:134px;");
    expect(lintEmail(html)).toEqual([]);
  });

  test("a percentage width keeps square corners in Outlook", () => {
    const html = emitButton(UNTRACED, button({ radius: 8, width: { pct: 50 }, align: "center" }));
    expect(html).not.toContain("v:roundrect");
    expect(html).toContain('width="50%"');
    expect(html).toContain('align="center"');
  });
});

import { describe, expect, test } from "vitest";
import { compile, field, preview } from "../../src/index.ts";
import { expand } from "../harness/template-fixture.ts";

const both = ["handlebars", "liquid"] as const;
const bg = field("brand.bg");
const fg = field("brand.fg");
const line = field("brand.line");
const codes = (src: string, css?: string[]) => compile(src, { template: "handlebars", strict: false, ...(css ? { css } : {}) }).diagnostics.map((d) => d.code);

describe("a placeholder as a whole colour value", () => {
  test("colour properties take it, with no E013", () => {
    for (const style of [
      `color:${fg}`,
      `background-color:${bg}`,
      `background:${bg}`,
      `border-color:${line};border-style:solid;border-width:1px`,
      `border-top-color:${line};border-top:1px solid`,
      `border:1px solid ${line}`,
      `border-left:${line} 2px dashed`,
      `color: ${fg} !important`,
    ]) {
      expect(codes(`<div style="padding:8px;${style}"><p style="margin:0">x</p></div>`), style).not.toContain("E013");
    }
  });

  test("anywhere else in CSS it is still E013, at the placeholder", () => {
    for (const style of [`padding:${bg}`, `color:rgba(${bg}, 0.5)`, `background:${bg} url(https://i.test/a.png)`, `background-image:linear-gradient(${bg}, #fff)`, `border:${line}px solid #000`, `--brand:${bg}`, `font-family:${fg}`]) {
      expect(codes(`<div style="${style}"><p style="margin:0">x</p></div>`), style).toContain("E013");
    }
    expect(codes(`<style>p { color: ${fg}; }</style><p style="margin:0">x</p>`)).toContain("E013");
    expect(codes(`<p style="margin:0">x</p>`, [`p { color: ${fg}; }`])).toContain("E013");
    const d = compile(`<p style="margin:0">x</p>\n<p style="color:${fg};padding:${bg}">y</p>`, { template: "liquid" }).diagnostics.filter((x) => x.code === "E013");
    expect(d.map((x) => [x.loc?.line, x.loc?.col])).toEqual([[2, 36]]);
    expect(d[0]?.hint).toMatch(/whole value/);
  });

  test("a painted box gets it in style and bgcolor; children inherit the text colour", () => {
    const { html, diagnostics } = compile(`<div style="padding:16px;background:${bg};color:${fg};border:2px solid ${line}"><p style="margin:0">Hi <b>you</b></p></div>`, { template: "handlebars" });
    expect(diagnostics.filter((d) => d.severity !== "info")).toEqual([]);
    expect(html).toContain('bgcolor="{{brand.bg}}"');
    expect(html).toContain("background-color:{{brand.bg}};");
    expect(html).toContain("border-top:2px solid {{brand.line}};");
    expect(html).toMatch(/<p style="[^"]*color:\{\{brand\.fg\}\}/);
  });

  test("a rounded button gets it in the VML fill and stroke", () => {
    const { html } = compile(`<a href="https://x.test" style="display:inline-block;padding:12px 24px;background:${bg};color:${fg};border:1px solid ${line};border-radius:6px;text-decoration:none">Go</a>`, { template: "liquid" });
    expect(html).toContain('fillcolor="{{ brand.bg | escape }}"');
    expect(html).toContain('strokecolor="{{ brand.line | escape }}"');
    expect(html).toContain('bgcolor="{{ brand.bg | escape }}"');
    expect(html).toContain("color:{{ brand.fg | escape }}");
  });

  test("a VML background photo gets it as the fill colour", () => {
    const { html } = compile(`<div style="width:600px;min-height:200px;background:${bg} url(https://i.test/a.png) center / cover"><p style="margin:0">x</p></div>`, { template: "handlebars", strict: false });
    expect(html).toMatch(/<v:fill [^>]*color="\{\{brand\.bg\}\}"/);
  });

  test("it is never flattened: a translucent colour over it is W001", () => {
    const r = compile(`<div style="padding:8px;background:${bg}"><p style="margin:0;background:rgba(255,255,255,0.5)">x</p></div>`, { template: "handlebars", strict: false });
    expect(r.diagnostics.find((d) => d.code === "W001")?.message).toMatch(/rgba\(255,255,255,0.5\)/);
    expect(r.html).toContain("rgba(255,255,255,0.5)");
  });

  test("the expanded email matches the preview", () => {
    const src = `<div style="padding:16px;background:${bg};color:${fg};border:2px solid ${line}"><p style="margin:0">Hi</p></div>`;
    const props = { brand: { bg: "#123456", fg: "#fefefe", line: "red" } };
    expect(preview(src, props)).toContain("background:#123456;color:#fefefe;border:2px solid red");
    for (const d of both) {
      const out = expand(compile(src, { template: d }).html, d, props);
      expect(out, d).toContain('bgcolor="#123456"');
      expect(out, d).toContain("color:#fefefe");
      expect(out, d).toContain("border-left:2px solid red");
    }
  });
});

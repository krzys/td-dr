import { describe, expect, test } from "vitest";
import { compile } from "../../../src/index.ts";

const codes = (html: string): string[] => compile(html, { strict: false }).diagnostics.map((d) => d.code);

describe("display: table inside a text run", () => {
  test("a span in a paragraph is E001 (nothing lowers it)", () => {
    expect(codes('<p>Hello <span style="display:table">world</span> end</p>')).toContain("E001");
  });

  test("a centered span in a div text run is E001", () => {
    expect(codes('<div>Hello <span style="display:table;margin:0 auto">world</span> end</div>')).toContain("E001");
  });

  test("a table-cell span in a text run is E001", () => {
    expect(codes('<p>Hello <span style="display:table-cell">world</span> end</p>')).toContain("E001");
  });

  test("a block div with display: table is still lowered", () => {
    expect(codes('<div style="display:table;margin:0 auto"><p>Hi</p></div>')).not.toContain("E001");
  });
});

describe("order must be an integer", () => {
  test("order: 1.5 is E007 and keeps source order", () => {
    const r = compile('<div style="display:flex"><div style="order:1.5">A</div><div>B</div></div>', { strict: false });
    expect(r.diagnostics.map((d) => d.code)).toContain("E007");
    expect(r.html.indexOf(">A<")).toBeLessThan(r.html.indexOf(">B<"));
  });
});

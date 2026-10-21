import { describe, expect, it } from "vitest";
import { compile } from "../../src/index.ts";
import { CSS_NESTING_DEPTH } from "../../src/limits.ts";

const page = (css: string, body: string) => `<!doctype html><html lang="en"><head><title>t</title><style>${css}</style></head><body>${body}</body></html>`;
// `&` alone stands for its parent, so every level matches .a
const nested = (levels: number, decl: string) => `.a{${"&{".repeat(levels - 1)}${decl}${"}".repeat(levels - 1)}}`;

describe("css nesting depth", () => {
  it("applies rules nested as deep as the cap", () => {
    const r = compile(page(nested(CSS_NESTING_DEPTH, "color:#c00"), '<p class="a">x</p>'));
    expect(r.html).toContain("color:#c00");
    expect(r.diagnostics.map((d) => d.code)).not.toContain("W002");
  });

  it("ignores rules nested deeper, with a located W002", () => {
    const css = `.a{color:#00c}${nested(CSS_NESTING_DEPTH + 1, "color:#c00")}`;
    const html = page(css, '<p class="a">x</p>');
    const r = compile(html);
    expect(r.html).toContain("color:#00c");
    expect(r.html).not.toContain("color:#c00");
    const w = r.diagnostics.filter((d) => d.code === "W002");
    expect(w).toHaveLength(1);
    expect(w[0]!.message).toContain(`${CSS_NESTING_DEPTH}`);
    expect(w[0]!.hint).toMatch(/flatten/i);
    // at the first rule past the cap
    expect(w[0]!.loc).toEqual({ line: 1, col: html.lastIndexOf("&{") + 1 });
  });

  it("compiles 10,000 levels without running out of stack", () => {
    const css = `${"a{".repeat(10_000)}color:#c00${"}".repeat(10_000)}`;
    const r = compile(page(css, '<p>x <a href="https://example.com">y</a></p>'));
    expect(r.html).toContain("example.com");
    expect(r.diagnostics.filter((d) => d.code === "W002")).toHaveLength(1);
    expect(r.diagnostics.map((d) => d.code)).not.toContain("E018");
  });
});

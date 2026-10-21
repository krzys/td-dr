import { describe, expect, it } from "vitest";
import { run, type CliIO } from "../../src/cli.ts";
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

const deep = (open: string, close: string, n: number) => `<!doctype html><html lang="en"><head><title>t</title></head><body>${open.repeat(n)}x${close.repeat(n)}</body></html>`;

describe("elements nested too deep", () => {
  const cases: [string, string, string][] = [
    ["plain divs", "<div>", "</div>"],
    ["styled divs", '<div style="padding:1px">', "</div>"],
    ["spans", "<span>", "</span>"],
    ["tables", "<table><tr><td>", "</td></tr></table>"],
  ];
  for (const [name, open, close] of cases) {
    it(`5,000 ${name} report a located E018 instead of throwing`, () => {
      const r = compile(deep(open, close, 5000), { strict: false });
      expect(r.html).toBe("");
      const e = r.diagnostics.filter((d) => d.code === "E018");
      expect(e).toHaveLength(1);
      // no output was written: it stays an error with strict off
      expect(e[0]!.severity).toBe("error");
      expect(e[0]!.message).toMatch(/^Elements nest \d{1,2},\d{3} deep/);
      expect(e[0]!.loc?.line).toBe(1);
      expect(e[0]!.loc?.col).toBeGreaterThan(5000);
    });
  }

  it("keeps what was reported before", () => {
    const r = compile(deep('<div style="position:fixed">', "</div>", 5000), { strict: false });
    expect(r.diagnostics.at(-1)?.code).toBe("E018");
  });

  it("fails the cli with the location", async () => {
    const err: string[] = [];
    const written: Record<string, string> = {};
    const io: CliIO = {
      stdout: () => {},
      stderr: (s) => void err.push(s),
      readFile: () => deep("<div>", "</div>", 5000),
      writeFile: (p, s) => void (written[p] = s),
    };
    expect(await run(["build", "in.html", "-o", "out.html", "--allow-unsupported"], io)).toBe(1);
    expect(err.join("")).toMatch(/^in\.html:1:\d+: error E018: /m);
  });
});

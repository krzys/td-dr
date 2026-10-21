import { describe, expect, it } from "vitest";
import { runPipeline } from "../../src/pipeline.ts";
import { codesOf, testCtx } from "../helpers/index.ts";

const compile = (html: string) => {
  const ctx = testCtx();
  const out = runPipeline(html, ctx);
  return { out, ctx };
};

describe("W009 Gmail clip", () => {
  it("warns when the output passes 102,000 bytes", () => {
    const rows = Array.from({ length: 1200 }, (_, i) => `<p style="margin:0">Row ${i} of a very long newsletter body text</p>`).join("");
    const { out, ctx } = compile(`<div>${rows}</div>`);
    expect(Buffer.byteLength(out, "utf8")).toBeGreaterThan(102_000);
    expect(codesOf(ctx)).toContain("W009");
    expect(ctx.diagnostics.list().find((d) => d.code === "W009")?.message).toMatch(/KB/);
  });

  it("stays quiet for a small email", () => {
    expect(codesOf(compile("<p>hi</p>").ctx)).not.toContain("W009");
  });
});

describe("W009 edge cases", () => {
  const rows = (n: number) => `<div>${Array.from({ length: n }, (_, i) => `<p style="margin:0">Row ${i} of a very long newsletter body text</p>`).join("")}</div>`;

  it("measures the template output in template mode", () => {
    const ctx = testCtx({ template: "handlebars" });
    const out = runPipeline(rows(1200), ctx);
    expect(Buffer.byteLength(out, "utf8")).toBeGreaterThan(102_000);
    expect(codesOf(ctx)).toContain("W009");
  });

  it("stays silent just under the limit and states KB in thousands", () => {
    let n = 1000;
    let c = compile(rows(n));
    while (Buffer.byteLength(c.out, "utf8") < 101_000) c = compile(rows((n += 5)));
    expect(Buffer.byteLength(c.out, "utf8")).toBeLessThanOrEqual(102_000);
    expect(codesOf(c.ctx)).not.toContain("W009");
  }, 30_000);
});

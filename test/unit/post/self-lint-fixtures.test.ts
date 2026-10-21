import { describe, expect, it } from "vitest";
import { compile } from "../../../src/index.ts";
import { isActive, loadFixtures } from "../../harness/fixture-runner.ts";


describe("selfLint on real output", () => {
  for (const f of loadFixtures().filter(isActive)) {
    it(`${f.feature}/${f.name} has no W006 with default targets`, () => {
      const { diagnostics } = compile(f.input);
      expect(diagnostics.filter((d) => d.code === "W006")).toEqual([]);
    });
  }
});

describe("selfLint on author values that are lowered", () => {
  it("light-dark() reaches neither the output (W006) nor the input lint (W005)", () => {
    const html = '<!doctype html><html><head><style>.card{background-color:light-dark(#ffffff,#1d2126)}</style></head><body><div class="card" style="padding:16px">Hi</div></body></html>';
    const out = compile(html);
    const codes = out.diagnostics.map((d) => `${d.code} ${d.message}`);
    expect(codes.filter((c) => c.startsWith("W006"))).toEqual([]);
    expect(codes.filter((c) => c.startsWith("W005 light-dark()"))).toEqual([]);
    expect(out.html).not.toContain("light-dark(");
    expect(out.html).toContain("#ffffff");
  });
});

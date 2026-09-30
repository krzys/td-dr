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

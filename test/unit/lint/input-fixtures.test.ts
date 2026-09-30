import { describe, expect, it } from "vitest";
import { compile } from "../../../src/index.ts";
import { isActive, loadFixtures } from "../../harness/fixture-runner.ts";


// Margins that really do reach the output: li inside a list, and floats/animations kept as raw HTML.
const NESTED_MARGIN = new Set([
  "bleed/inline-span-negative", // inline boxes are not lowered; the note is the point
  "article/lists-ul-ol",
  "container/float-sidebar-oos",
  "out-of-scope/css-animation-pulse",
  "table-display/text-block-tags-oos", // an E001 fixture: the unsupported ul/h1 keep their margin in the output
]);

describe("lintInput on real output", () => {
  for (const f of loadFixtures().filter(isActive)) {
    it.skipIf(NESTED_MARGIN.has(`${f.feature}/${f.name}`))(`${f.feature}/${f.name} reports no margin on a root text block`, () => {
      const { diagnostics } = compile(f.input);
      // passThrough writes margin:0 and the margin passes move the real one, so margin never reaches the output
      const bad = diagnostics.filter((d) => (d.code === "W005" || d.code === "I003") && /^margin\b/.test(d.message));
      expect(bad.map((d) => d.message)).toEqual([]);
    });
  }
});

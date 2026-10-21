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

describe("lintInput hints", () => {
  const rgbaOver = (colour: string) =>
    compile(`<body><div style="background-image:linear-gradient(#123456,#654321)"><p style="color:${colour}">Hi</p></div></body>`).diagnostics.find((d) => d.code === "W005" && d.message.startsWith("an rgba() colour"));

  it("an rgba() kept over a gradient isn't told about the whitespace syntax nobody wrote", () => {
    for (const colour of ["rgba(255,255,255,0.8)", "rgb(255 255 255 / 0.8)"]) {
      const d = rgbaOver(colour);
      expect(d?.message).toBe("an rgba() colour isn't supported in Outlook Windows");
      expect(d?.hint).toBe("Those clients ignore it; drop the property or narrow --targets.");
    }
  });
});

import { describe, expect, it } from "vitest";
import { compile } from "../../../src/index.ts";
import { widthDecision } from "../../../src/analyze/design-width.ts";
import { styledFrom, testCtx } from "../../helpers/index.ts";

const inferred = (html: string): number => {
  const ctx = testCtx();
  return widthDecision(styledFrom(html, ctx), ctx).width;
};
const card = (width: number, css = "", p = 'style="font-size:5vw;margin:0"'): string =>
  `${css}<div style="max-width:${width}px;margin:0 auto"><p class="x" ${p}>Hello there</p></div>`;

// The design width the email infers is the one it is compiled at: as if it had been given.
describe("an inferred design width compiles like the same width given", () => {
  const cases: [string, string, number][] = [
    ["wider than 600, vw text", card(800), 800],
    ["narrower than 600, vw text", card(480), 480],
    ["exactly 600, vw text", card(600), 600],
    ["wider than 600, an author breakpoint", card(800, "<style>@media (max-width:700px){.x{padding:4px}}</style>", ""), 800],
  ];

  for (const [name, html, width] of cases) {
    it(name, () => {
      expect(inferred(html)).toBe(width);
      const a = compile(html);
      const b = compile(html, { width });
      expect(a.html).toBe(b.html);
      expect(a.diagnostics).toEqual(b.diagnostics);
    });
  }

  // the rendered sizes are checked in test/harness/inferred-width.visual.test.ts
  it("vw text in an 800px email stays live up to 800px", () => {
    const { html } = compile(card(800));
    expect(html).toContain("@media screen and (max-width:799px)");
    expect(html).not.toContain("max-width:599px");
  });
});

import { expect, test } from "vitest";
import { compile } from "../../src/index.ts";

const strong = (body: string): string => {
  const { html } = compile(`<style>.p{font:15px/22px Arial;color:#1f2937}</style>${body}`);
  return /<strong style="([^"]*)"/.exec(html)?.[1] ?? "(no style)";
};

// a v-if beside it must not change how it's written, or the template reads unlike the HTML render
test("an inline element alone in its parent is written like one in a run", () => {
  expect(strong('<div class="p"><strong>x</strong></div>')).toBe(strong('<div class="p"><strong>x</strong> <span>y</span></div>'));
});

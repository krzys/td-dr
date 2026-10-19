import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Browser } from "playwright";
import { compile } from "../../src/index.ts";
import { launchBrowser } from "./visual-diff.ts";

// An inferred design width renders like the same width given: the vw text stays live up to it.

let browser: Browser;
beforeAll(async () => {
  browser = await launchBrowser();
});
afterAll(async () => {
  await browser?.close();
});

const TEXT = "Hello there";
const card = (width: number): string => `<div style="max-width:${width}px;margin:0 auto"><p style="font-size:5vw;margin:0">${TEXT}</p></div>`;

type Measured = { fontSize: string; width: number; height: number };

// The rendered size of the element holding TEXT, at one viewport width.
const measure = async (html: string, viewport: number): Promise<Measured> => {
  const ctx = await browser.newContext({ viewport: { width: viewport, height: 800 } });
  try {
    const page = await ctx.newPage();
    await page.route("**/*", (route) => route.abort());
    await page.setContent(html, { waitUntil: "load" });
    return await page.evaluate((text) => {
      const el = [...document.querySelectorAll("p")].find((p) => p.textContent?.trim() === text);
      if (!el) throw new Error(`no element holds "${text}"`);
      const r = el.getBoundingClientRect();
      // WebKit prints a computed size as a float32: 39.949997px for 39.95px
      const fontSize = `${Math.round(parseFloat(getComputedStyle(el).fontSize) * 100) / 100}px`;
      return { fontSize, width: r.width, height: r.height };
    }, TEXT);
  } finally {
    await ctx.close();
  }
};

const source = (html: string): string => `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body>${html}</body></html>`;

describe("an inferred design width renders like the same width given", () => {
  // viewport → the font-size both compiles render
  const cases: { width: number; expected: Record<number, string> }[] = [
    // live up to 800: 5vw at 360 and 700, the design width's 40px from 800 on
    { width: 800, expected: { 360: "18px", 700: "35px", 799: "39.95px", 800: "40px", 1000: "40px" } },
    // live below 480; from 480 on, wider than the email, the design width's 24px
    { width: 480, expected: { 320: "16px", 400: "20px", 479: "23.95px", 480: "24px", 540: "24px", 599: "24px", 700: "24px" } },
  ];

  for (const { width, expected } of cases) {
    test(`${width}px`, async () => {
      const html = card(width);
      const inferred = compile(html).html;
      const given = compile(html, { width }).html;
      for (const [vp, size] of Object.entries(expected).map(([k, v]) => [Number(k), v] as const)) {
        const a = await measure(inferred, vp);
        const b = await measure(given, vp);
        // end-to-end guard: the unit test proves the two compiles identical, this proves they render alike
        expect(a, `${vp}px viewport`).toEqual(b);
        expect(a.fontSize, `${vp}px viewport`).toBe(size);
        // below the design width the text follows the viewport as the source does
        if (vp < width) expect(a.fontSize, `${vp}px viewport, source`).toBe((await measure(source(html), vp)).fontSize);
      }
    });
  }
});

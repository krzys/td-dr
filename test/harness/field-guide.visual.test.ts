import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Browser } from "playwright";
import { compile } from "../../src/index.ts";
import { fixtureOptions, loadFixtures } from "./fixture-runner.ts";
import { launchBrowser } from "./visual-diff.ts";

// The real-world field-guide email's rendered layout holds on a desktop and a phone (field-guide.test.ts checks its html).

let browser: Browser;
beforeAll(async () => {
  browser = await launchBrowser();
});
afterAll(async () => {
  await browser?.close();
});

const f = loadFixtures().find((x) => `${x.feature}/${x.name}` === "real-world/field-guide");
if (!f) throw new Error("no fixture real-world/field-guide");
const { html } = compile(f.input, fixtureOptions(f));

type Layout = { scrollWidth: number; reel: { top: number; left: number; right: number }[] };

const layout = async (viewport: number): Promise<Layout> => {
  const ctx = await browser.newContext({ viewport: { width: viewport, height: 800 } });
  try {
    const page = await ctx.newPage();
    await page.route("**/*", (route) => route.abort());
    await page.setContent(html, { waitUntil: "load" });
    return await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      // the "Seen on the trail" photos are the only 280x280 images
      reel: [...document.querySelectorAll<HTMLImageElement>('img[src$="/280x280.png"]')].map((img) => {
        const r = img.getBoundingClientRect();
        return { top: Math.round(r.top), left: r.left, right: r.right };
      }),
    }));
  } finally {
    await ctx.close();
  }
};

describe("real-world/field-guide", () => {
  for (const viewport of [600, 375]) {
    test(`${viewport}px: nothing scrolls sideways and the reel wraps`, async () => {
      const { scrollWidth, reel } = await layout(viewport);
      expect(scrollWidth).toBeLessThanOrEqual(viewport);
      expect(reel).toHaveLength(4);
      // four 140px photos with 12px gaps don't fit the 552px column, so they take two rows or more
      expect(new Set(reel.map((r) => r.top)).size).toBeGreaterThan(1);
      for (const r of reel) {
        expect(r.left).toBeGreaterThanOrEqual(0);
        expect(r.right).toBeLessThanOrEqual(viewport);
      }
    });
  }
});

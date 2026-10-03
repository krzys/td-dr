import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Browser } from "playwright";
import { compile, preview } from "../../src/index.ts";
import { fixtureOptions, isActive, loadFixtures } from "./fixture-runner.ts";
import { dataSets, expand, templateDialects, tokenize } from "./template-fixture.ts";
import { launchBrowser, renderAndDiff } from "./visual-diff.ts";

const VISUAL = fileURLToPath(new URL("../.visual", import.meta.url));

let browser: Browser;
beforeAll(async () => {
  browser = await launchBrowser();
});
afterAll(async () => {
  await browser?.close();
});

describe("harness smoke", () => {
  test("identical html has zero diff", async () => {
    const html = '<p style="color:red">same</p><img src="https://x.test/200x50.png">';
    const r = await renderAndDiff({
      input: html,
      output: html,
      viewport: 600,
      maxDiffRatio: 0,
      outDir: join(VISUAL, "_smoke", "same", "600"),
      browser,
    });
    expect(r.ratio).toBe(0);
    expect(r.pass).toBe(true);
  });

  test("different html has a diff", async () => {
    const r = await renderAndDiff({
      input: '<div style="height:100px;background:#000"></div>',
      output: "<p>nothing like it</p>",
      viewport: 600,
      maxDiffRatio: 0.002,
      outDir: join(VISUAL, "_smoke", "different", "600"),
      browser,
    });
    expect(r.ratio).toBeGreaterThan(0);
    expect(r.pass).toBe(false);
  });

  test("placeholder size comes from the url and its colour matches", async () => {
    const r = await renderAndDiff({
      input: '<img src="https://x.test/200x50.png">',
      output: '<div style="width:200px;height:50px;background:#8899aa"></div>',
      viewport: 600,
      maxDiffRatio: 0,
      outDir: join(VISUAL, "_smoke", "placeholder", "600"),
      browser,
    });
    expect(r.ratio).toBe(0);
  });

  test("different heights pad with white", async () => {
    const r = await renderAndDiff({
      input: '<div style="height:100px;background:#000"></div>',
      output: '<div style="height:1200px;background:#000"></div>',
      viewport: 600,
      maxDiffRatio: 1,
      outDir: join(VISUAL, "_smoke", "heights", "600"),
      browser,
    });
    // 600x1200 canvas; the 100px black strip matches, the other 1100 rows are black vs white
    expect(r.ratio).toBeCloseTo(1100 / 1200, 2);
  });

  test("stylesheets and fonts are blocked", async () => {
    const base = '<p style="font-family:serif">hi</p>';
    const r = await renderAndDiff({
      input: base,
      output: '<link rel="stylesheet" href="https://x.test/a.css">' + base,
      viewport: 600,
      maxDiffRatio: 0,
      outDir: join(VISUAL, "_smoke", "blocked", "600"),
      browser,
    });
    expect(r.ratio).toBe(0);
  });
});

// The oracle must notice faint but real paint losses (light-grey fills, hairlines).
// Corner radii alone are too few pixels for a ratio oracle: dropping every radius in react-itinerary measures ~0.002.
describe("oracle sensitivity: mutated output must fail", () => {
  const fixture = (id: string) => {
    const f = loadFixtures().find((x) => `${x.feature}/${x.name}` === id);
    if (!f) throw new Error(`no fixture ${id}`);
    return f;
  };
  const cases: Array<[string, string, (h: string) => string]> = [
    ["flex-row/percentage-widths", "1px #e5e7eb divider", (h) => h.replaceAll("border-bottom:1px solid #e5e7eb;", "")],
    ["flex-row/fixed-px-and-flex-grow", "#f3f4f6 background", (h) => h.replaceAll("#f3f4f6", "#ffffff")],
    ["frameworks/react-itinerary", "#f1f5f9 background", (h) => h.replaceAll("#f1f5f9", "#ffffff")],
  ];
  const run = async (id: string, label: string, html: string) => {
    const f = fixture(id);
    return renderAndDiff({
      input: f.input,
      output: html,
      viewport: 600,
      maxDiffRatio: f.intent.maxDiffRatio ?? 0.002,
      outDir: join(VISUAL, "_mutation", id, label.replaceAll(/\W+/g, "-")),
      browser,
    });
  };
  for (const [id, label, mutate] of cases) {
    test(`${id}: unmutated passes, without ${label} fails`, async () => {
      const { html } = compile(fixture(id).input, fixtureOptions(fixture(id)));
      const mutated = mutate(html);
      expect(mutated, "mutation must change the output").not.toBe(html);
      expect((await run(id, "base", html)).pass).toBe(true);
      const r = await run(id, label, mutated);
      expect(r.pass, `mutated ratio ${r.ratio}`).toBe(false);
    });
  }
});

for (const f of loadFixtures().filter(isActive)) {
  if (f.intent.expect !== "compile") continue;
  const dialects = templateDialects(f);
  for (const w of f.intent.viewports ?? [600, 375]) {
    // `maxDiffRatio375: 0.03` overrides one viewport, so a phone-only approximation
    // doesn't loosen the 600px check
    const own = f.intent[`maxDiffRatio${w}`];
    const max = typeof own === "number" ? own : (f.intent.maxDiffRatio ?? 0.002);
    for (const dialect of dialects ?? [undefined]) {
      for (const [set, props] of dialect ? dataSets(f) : [["", {}] as const]) {
        const label = `${f.feature}/${f.name}${dialect ? ` [${dialect}${set ? `, ${set}` : ""}]` : ""} @${w}`;
        test(label, async () => {
          // a template is judged after the ESP's engine has filled it in, against the source with the same data
          const source = dialect ? preview(tokenize(f.input), props) : f.input;
          const html = dialect ? expand(compile(tokenize(f.input), { ...fixtureOptions(f), template: dialect }).html, dialect, props) : compile(f.input, fixtureOptions(f)).html;
          const r = await renderAndDiff({
            input: source,
            output: html,
            viewport: w,
            maxDiffRatio: max,
            outDir: join(VISUAL, f.feature, f.name + (dialect ? `-${dialect}${set ? `-${set}` : ""}` : ""), String(w)),
            browser,
          });
          expect(r.ratio, `see ${r.paths.diff}`).toBeLessThanOrEqual(max);
        });
      }
    }
  }
}

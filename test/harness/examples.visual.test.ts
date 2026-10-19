import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser } from "playwright";
import type { ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createEmailServer, findEmails, renderEmail } from "../../adapters/vite/index.ts";
import { ENGINE, type Engine } from "./engines.ts";
import { launchBrowser, renderAndDiff, VISUAL } from "./visual-diff.ts";

const EXAMPLES = fileURLToPath(new URL("../../examples", import.meta.url));
const MAX = 0.002;
// the html-mode compile of the same data differs as much: the narrow address cells round a
// fractional line height 1px off, and everything below follows, ~0.0085
const ALLOW: Record<string, number> = { "react-order-template pickup @375": 0.01 };
// Engines whose check of one example is skipped, like a fixture's skipEngines, for an engine property:
// WebKit lays a unitless line-height times a fractional font size out 1px short (font: 25.6px/1.25
// is 31px tall, computed 32px, where 25.6px/32px is 32px), in the source only, so the h1 here and
// everything under it sit 1px off the output's 32px.
const SKIP: Record<string, Engine[]> = { "react-order-template": ["webkit"] };

let browser: Browser;
let vite: ViteDevServer;
beforeAll(async () => {
  [browser, vite] = await Promise.all([launchBrowser(), createEmailServer({ root: EXAMPLES })]);
});
afterAll(async () => {
  await Promise.all([browser?.close(), vite?.close()]);
});

// A natively written template, compiled and filled by the ESP's engine, must look like the
// same components rendered with that data.
describe("example templates filled by the real engines", () => {
  for (const email of findEmails(EXAMPLES).filter((e) => e.template.length > 0)) {
    for (const set of email.data) {
      for (const dialect of email.template) {
        for (const w of [600, 375]) {
          test.skipIf(SKIP[email.name]?.includes(ENGINE))(`${email.name} [${dialect}, ${set.name}] @${w}`, async () => {
            const data = JSON.parse(readFileSync(set.file, "utf8"));
            const plain = await renderEmail(vite, email, { data, mode: "html" });
            const filled = await renderEmail(vite, email, { data, mode: dialect });
            expect(filled.filled).toBe("engine");
            expect(filled.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
            const max = ALLOW[`${email.name} ${set.name} @${w}`] ?? MAX;
            const r = await renderAndDiff({
              input: plain.source,
              output: filled.html,
              viewport: w,
              maxDiffRatio: max,
              outDir: join(VISUAL, "examples", `${email.name}-${dialect}-${set.name}`, String(w)),
              browser,
            });
            expect(r.ratio, `see ${r.paths.diff}`).toBeLessThanOrEqual(max);
          });
        }
      }
    }
  }
});

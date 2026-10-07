import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ViteDevServer } from "vite";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createEmailServer, findEmails, renderEmail } from "../../../adapters/vite/index.ts";

// as if neither handlebars nor liquidjs were installed in the user's project
vi.mock("../../../adapters/vite/engines.ts", () => ({ engine: async () => undefined }));

const root = resolve(import.meta.dirname, "../../vite-emails");
let vite: ViteDevServer;
beforeAll(async () => {
  vite = await createEmailServer({ root });
});
afterAll(() => vite.close());

it.each(["handlebars", "liquid"] as const)("fills a %s template with preview() when the engine isn't installed", async (mode) => {
  const email = findEmails(root).find((e) => e.name === "promo")!;
  const data = JSON.parse(readFileSync(email.data[0]!.file, "utf8"));
  const r = await renderEmail(vite, email, { data, mode });
  expect(r.filled).toBe("preview");
  expect(r.template).toContain(mode === "handlebars" ? "{{#if show}}" : "{% if show and show != 0 and show != \"\" %}");
  expect(r.html).not.toMatch(/\{\{|\{%/);
  expect(r.html).toContain("<b style=\"font-weight:bold\">Teapot</b> for $30");
});

it.each(["handlebars", "liquid"] as const)("marks the %s frame's elements from the annotated preview when the engine isn't installed", async (mode) => {
  const email = findEmails(root).find((e) => e.name === "promo")!;
  const data = JSON.parse(readFileSync(email.data[0]!.file, "utf8"));
  const r = await renderEmail(vite, email, { data, mode });
  const marked = r.htmlShown!;
  expect(marked.replace(/ data-tddr-[sn]="[^"]*"/g, "")).toBe(r.html);
  // the two deals are copies of one source element, told apart by position
  const bs = [...marked.matchAll(/<b [^>]*data-tddr-s="(\d+)"[^>]*>/g)].map((m) => m[1]);
  expect(bs).toHaveLength(2);
  expect(new Set(bs).size).toBe(1);
  expect(marked).toContain('data-tddr-n="1"');
});

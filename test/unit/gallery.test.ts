import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { buildGallery } from "../../scripts/gallery.ts";

const dir = mkdtempSync(join(tmpdir(), "tddr-gallery-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

test("builds an index and standalone email files", () => {
  const { count, index } = buildGallery(dir);
  expect(count).toBeGreaterThan(0);
  expect(index).toBe(join(dir, "index.html"));
  expect(existsSync(index)).toBe(true);
  const page = readFileSync(index, "utf8");
  expect(page).toContain("td;dr gallery");
  expect(page).toContain('sandbox="allow-same-origin"');
  expect(page).toContain("srcdoc=");

  const emails = readdirSync(join(dir, "emails"));
  expect(emails).toHaveLength(count);
  const first = emails[0]!;
  expect(first).toMatch(/^[^-]+.*--.+\.html$/);
  expect(page).toContain(`emails/${first}`);
  expect(readFileSync(join(dir, "emails", first), "utf8").toLowerCase()).toContain("<html");
}, 30_000);

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (f: string) => readFileSync(new URL(`../../../src/targets/data/${f}`, import.meta.url), "utf8");
const meta = JSON.parse(read("caniemail.meta.json"));
const text = read("caniemail.json");

describe("vendored caniemail data", () => {
  it("matches its meta file", () => {
    expect(createHash("sha256").update(text).digest("hex")).toBe(meta.sha256);
    const data = JSON.parse(text);
    expect([data.api_version, data.last_update_date, data.data.length]).toEqual([meta.api_version, meta.last_update_date, meta.features]);
  });

  // client support moves; stale data means wrong warnings. Fix with: pnpm caniemail
  it("was fetched in the last 120 days", () => {
    const days = (Date.now() - Date.parse(meta.fetched_at)) / 86_400_000;
    expect(days, "run pnpm caniemail").toBeLessThan(120);
  });
});

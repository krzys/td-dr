import { resolve } from "node:path";
import type { ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEmailServer, findEmails, renderEmail } from "../../../adapters/vite/index.ts";

const root = resolve(import.meta.dirname, "../../vite-svg");
let vite: ViteDevServer;

beforeAll(async () => {
  vite = await createEmailServer({ root });
});
afterAll(() => vite.close());

describe("renderEmail, svg", () => {
  const icon = () => findEmails(root).find((e) => e.name === "icon")!;

  it("passes compile.allowSvg through to compile()", async () => {
    const r = await renderEmail(vite, icon(), { data: {}, mode: "html", compile: { strict: true, allowSvg: true, lang: "en" } });
    expect(r.diagnostics.map((d) => d.code)).toEqual(["W010", "I015"]);
    expect(r.html).toContain("<svg");
  });

  it("is E008 without it", async () => {
    const r = await renderEmail(vite, icon(), { data: {}, mode: "html", compile: { strict: true } });
    expect(r.diagnostics.map((d) => d.code)).toContain("E008");
  });
});

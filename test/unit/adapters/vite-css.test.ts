import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEmailServer, findEmails, renderEmail, type EmailEntry } from "../../../adapters/vite/index.ts";
import { loadEmail } from "../../../adapters/vite/render.ts";

const repo = resolve(import.meta.dirname, "../../..");

const byName = (dir: string, name: string): EmailEntry => findEmails(dir).find((e) => e.name === name)!;

describe("CSS collection on the examples", () => {
  const examples = join(repo, "examples");
  let vite: ViteDevServer;
  beforeAll(async () => {
    vite = await createEmailServer({ root: examples });
  });
  afterAll(() => vite.close());

  it("takes a React email's imported stylesheet as Vite processed it", async () => {
    const { css } = await loadEmail(vite, byName(examples, "react-itinerary"));
    expect(css).toBe(readFileSync(join(examples, "react-itinerary/styles.css"), "utf8").trim());
  });

  it("takes Vue's scoped styles, child components before the parent that imports them", async () => {
    const email = byName(examples, "vue-digest");
    const { css } = await loadEmail(vite, email);
    const markup = (await renderEmail(vite, email, { data: JSON.parse(readFileSync(email.data[0]!.file, "utf8")), mode: "html" })).source;
    const scopes = new Set(css.match(/data-v-[0-9a-f]{8}/g));
    expect(scopes.size).toBe(8);
    for (const s of scopes) expect(markup).toContain(` ${s}`);
    // App.vue's own blocks (scoped .digest, then the unscoped :root) come after every child's
    expect(css.indexOf(".card[")).toBeLessThan(css.indexOf(".digest["));
    expect(css.indexOf(".digest[")).toBeLessThan(css.indexOf(":root"));
  });

  it("runs Tailwind through its Vite plugin, only for the classes the email uses", async () => {
    const { css } = await loadEmail(vite, byName(examples, "react-tailwind-receipt"));
    expect(css).toContain(".max-w-\\[600px\\]");
    expect(css).toContain(".bg-indigo-600\\/10");
    expect(css).not.toContain("@import");
    // source(".") in its styles.css: the other examples' words don't become utilities
    expect(css).not.toContain(".grow {");
  });
});

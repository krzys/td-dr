import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEmailServer, findEmails, renderEmail } from "../../../adapters/vite/index.ts";

const repo = resolve(import.meta.dirname, "../../..");
let dir: string;

beforeAll(() => {
  mkdirSync(join(repo, "test/.tmp"), { recursive: true });
  dir = mkdtempSync(join(repo, "test/.tmp/config-"));
  cpSync(join(repo, "test/vite-emails/hello"), join(dir, "hello"), { recursive: true });
  cpSync(join(repo, "test/vite-emails/note.vue"), join(dir, "note.vue"));
  // a project config without the Vue plugin, with a plugin of its own
  writeFileSync(
    join(dir, "vite.config.mjs"),
    `export default { plugins: [{ name: "shout", transform: (code, id) => id.endsWith("index.jsx") ? code.replace("Hello ", "HELLO ") : undefined }] };\n`,
  );
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const render = async (configFile: string | false | undefined, name: string) => {
  const vite = await createEmailServer(configFile === undefined ? { root: dir } : { root: dir, configFile });
  try {
    const email = findEmails(dir).find((e) => e.name === name)!;
    return await renderEmail(vite, email, { data: name === "note" ? { title: "x" } : { name: "Ada", items: [] }, mode: "html" });
  } finally {
    await vite.close();
  }
};

describe("createEmailServer", () => {
  it("uses the project's vite config when there is one, and adds only tddr()", async () => {
    expect((await render(undefined, "hello")).source).toContain("HELLO Ada");
    await expect(render(undefined, "note")).rejects.toThrow(/^note: loading .*note\.vue failed/);
  });

  it("brings its own plugins with configFile: false", async () => {
    expect((await render(false, "hello")).source).toContain("Hello Ada");
    expect((await render(false, "note")).source).toMatch(/<div class="note" data-v-[0-9a-f]{8}>/);
  });
});

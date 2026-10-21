import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findEmails } from "../../../adapters/vite/index.ts";

const dirs: string[] = [];

const tree = (files: Record<string, string>): string => {
  const dir = mkdtempSync(join(tmpdir(), "tddr-find-"));
  dirs.push(dir);
  for (const [f, src] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    writeFileSync(join(dir, f), src);
  }
  return dir;
};

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const summary = (d: string) =>
  findEmails(d).map((e) => ({ ...e, entry: e.entry.slice(d.length + 1), data: e.data.map((s) => [s.name, s.file.slice(d.length + 1)]) }));

describe("findEmails", () => {
  it("finds folder and single-file emails with their data sets, sorted", () => {
    const d = tree({
      "welcome/index.tsx": "export default () => null;",
      "welcome/props.json": "{}",
      "welcome/props.empty.json": "{}",
      "welcome/Header.tsx": "",
      "digest/App.vue": "<template><p/></template>",
      "digest/Card.vue": "",
      "receipt/index.jsx": "",
      "reset.vue": "<template><p/></template>",
      "reset.json": "{}",
      "reset.long.json": "{}",
      "reset-old.json": "{}",
      "promo.tsx": "",
      "components/Button.tsx": "",
      ".hidden/index.tsx": "",
    });
    expect(summary(d)).toEqual([
      { name: "digest", entry: "digest/App.vue", framework: "vue", data: [], template: [] },
      { name: "promo", entry: "promo.tsx", framework: "react", data: [], template: [] },
      { name: "receipt", entry: "receipt/index.jsx", framework: "react", data: [], template: [] },
      {
        name: "reset",
        entry: "reset.vue",
        framework: "vue",
        data: [
          ["reset", "reset.json"],
          ["reset.long", "reset.long.json"],
        ],
        template: [],
      },
      {
        name: "welcome",
        entry: "welcome/index.tsx",
        framework: "react",
        data: [
          ["props.empty", "welcome/props.empty.json"],
          ["props", "welcome/props.json"],
        ],
        template: [],
      },
    ]);
  });

  it("reads `export const template` from the source without running it", () => {
    const d = tree({
      "a/index.tsx": `import x from "nowhere";\nexport const template: Dialect[] = ["handlebars", 'liquid'] as const;\nthrow new Error("never run");`,
      "b.vue": `<script>\nexport const template = ["liquid"];\n</script>\n<script setup>\nconst template = ["handlebars"];\n</script>`,
      "c.vue": `<script setup>\nexport const template = ["handlebars"];\n</script>`,
    });
    expect(findEmails(d).map((e) => [e.name, e.template])).toEqual([
      ["a", ["handlebars", "liquid"]],
      ["b", ["liquid"]],
      ["c", []],
    ]);
  });

  it("reads `export const lang` from the source", () => {
    const d = tree({
      "a/index.tsx": `export const lang = "de";\nthrow new Error("never run");`,
      "b.vue": `<script>\nexport const lang: string = 'pt-BR';\n</script>`,
      "c.jsx": "export default () => null;",
    });
    expect(findEmails(d).map((e) => [e.name, e.lang])).toEqual([
      ["a", "de"],
      ["b", "pt-BR"],
      ["c", undefined],
    ]);
    expect(() => findEmails(tree({ "x/index.tsx": "export const lang = code;" }))).toThrow(/lang/);
  });

  it.each([
    ["an unknown dialect", `export const template = ["custom"];`, /unknown template dialect "custom"/],
    ["a non-literal entry", `const d = "liquid";\nexport const template = [d];`, /string literals/],
  ])("rejects a template list with %s", (_name, src, error) => {
    expect(() => findEmails(tree({ "x/index.tsx": src }))).toThrow(error);
  });

  it("rejects a folder with two entries, and two emails with one name", () => {
    expect(() => findEmails(tree({ "x/index.tsx": "", "x/App.vue": "" }))).toThrow(/more than one email entry \(index.tsx, App.vue\)/);
    expect(() => findEmails(tree({ "x/index.tsx": "", "x.vue": "" }))).toThrow(/Two emails are called "x"/);
  });
});

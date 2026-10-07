import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createEmailServer, findEmails, renderEmail, type EmailEntry } from "../../../adapters/vite/index.ts";

const repo = resolve(import.meta.dirname, "../../..");

const byName = (dir: string, name: string): EmailEntry => findEmails(dir).find((e) => e.name === name)!;

const BODIES: Record<string, string> = {
  stmt: ['import { jsx } from "react/jsx-runtime";', "export default function Body({ order }) {", "  const rows = [];", "  if (order.paid) rows.push(1);", '  return jsx("p", { children: rows.length });', "}", ""].join("\n"),
  op: ['import { jsx } from "react/jsx-runtime";', "export default function Body({ order }) {", '  const big = 1 && (order.total > 5);', '  return jsx("p", { children: big ? "big" : "small" });', "}", ""].join("\n"),
  refused: ['import { jsx } from "react/jsx-runtime";', "export default function Body({ order }) {", "  with (order) {", '    return jsx("p", { children: total });', "  }", "}", ""].join("\n"),
  unparsed: ['import { jsx } from "react/jsx-runtime";', "export default function Body({ order }) {", "  return jsx(;", "}", ""].join("\n"),
};

describe("edits and errors", () => {
  let dir: string;
  let vite: ViteDevServer;
  beforeAll(async () => {
    // inside the repo so the copies resolve react and vue
    mkdirSync(join(repo, "test/.tmp"), { recursive: true });
    dir = mkdtempSync(join(repo, "test/.tmp/edits-"));
    cpSync(join(repo, "test/vite-emails/hello"), join(dir, "hello"), { recursive: true });
    cpSync(join(repo, "test/vite-emails/note.vue"), join(dir, "note.vue"));
    writeFileSync(join(dir, "nodefault.jsx"), "export const Mail = () => null;\n");
    writeFileSync(join(dir, "syntax.jsx"), "export default () => <div><p>hi</div>;\n");
    writeFileSync(join(dir, "raw.jsx"), 'import text from "./hello/hello.css?raw";\nimport "./hello/badge.css";\nexport default () => <p>{text.length}</p>;\n');
    // plain JS bodies behind JSX entries: only the rewrite's source map sits between them and the stack
    for (const [name, body] of Object.entries(BODIES)) {
      writeFileSync(join(dir, `${name}.jsx`), `import Body from "./${name}-body.js";\nexport const template = ["handlebars"];\nexport default ({ order }) => <Body order={order} />;\n`);
      writeFileSync(join(dir, `${name}-body.js`), body);
    }
    vite = await createEmailServer({ root: dir });
  });
  afterAll(async () => {
    await vite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const edit = (file: string, from: string, to: string) => writeFileSync(join(dir, file), readFileSync(join(dir, file), "utf8").replace(from, to));
  const source = async (name: string, data: unknown) => (await renderEmail(vite, byName(dir, name), { data, mode: "html" })).source;

  it("shows edits to components and stylesheets on the next render", async () => {
    const hello = { name: "Ada", items: [] };
    expect(await source("hello", hello)).toContain("#4f46e5");
    expect(await source("note", { title: "x" })).toContain("#92400e");
    edit("hello/badge.css", "#4f46e5", "#dc2626");
    edit("hello/Badge.jsx", ">new<", ">fresh<");
    edit("note.vue", "#92400e", "#166534");
    await vi.waitFor(
      async () => {
        const out = await source("hello", hello);
        expect(out).toContain("#dc2626");
        expect(out).toContain(">fresh<");
        expect(await source("note", { title: "x" })).toContain("#166534");
      },
      { timeout: 5000, interval: 50 },
    );
  });

  it("leaves out CSS imported as a string", async () => {
    expect(await source("raw", {})).toMatch(/^<style>\n\.badge \{[^}]*\}\n<\/style>\n<p>\d+<\/p>/);
  });

  it("reports a syntax error with its place in the file, without terminal colours", async () => {
    const err: Error = await renderEmail(vite, byName(dir, "syntax"), { data: {}, mode: "html" }).catch((e) => e);
    expect(err.message).toMatch(/^syntax: loading .*syntax\.jsx failed: /);
    expect(err.message).toContain("syntax.jsx:1:");
    expect(err.message).not.toContain("\x1b[");
  });

  describe("places what a template can't do in the author's file", () => {
    const failure = async (name: string, mode: "html" | "handlebars" = "handlebars"): Promise<string> =>
      (await renderEmail(vite, byName(dir, name), { data: {}, mode }).then(
        () => "rendered",
        (e: Error) => e.message,
      )) as string;

    it("a statement the rewrite left alone, at its test", async () => {
      expect(await failure("stmt")).toMatch(/order\.paid: decides a branch that does more than return or assign.*\n {4}at .*\/stmt-body\.js:4:7$/s);
    });

    it("a rewritten operator, at its expression", async () => {
      expect(await failure("op")).toMatch(/order\.total.*\n {4}at .*\/op-body\.js:3:21$/s);
    });

    it("refused syntax and a syntax error, before anything runs", async () => {
      expect(await failure("refused", "html")).toMatch(/failed: .*\/refused-body\.js:3:3: tddr can't rewrite this email module: a with statement /);
      const unparsed = await failure("unparsed", "html");
      expect(unparsed).toMatch(/failed: .*\/unparsed-body\.js:3:14: Unexpected token\n/);
      expect(unparsed).toContain("3  |    return jsx(;\n   |               ^");
      // one code frame, Vite's
      expect(unparsed.match(/\^/g)).toHaveLength(1);
    });
  });

  it("rejects an entry without a default export", async () => {
    await expect(renderEmail(vite, byName(dir, "nodefault"), { data: {}, mode: "html" })).rejects.toThrow(/has no default export/);
  });
});

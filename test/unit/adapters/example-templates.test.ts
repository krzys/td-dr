import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import vue from "@vitejs/plugin-vue";
import tailwind from "@tailwindcss/vite";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEmailServer, findEmails, renderEmail, type EmailEntry } from "../../../adapters/vite/index.ts";
import { verifyEmail } from "../../../adapters/vite/equivalence.ts";
import { emailEnvironment } from "../../../adapters/vite/plugin.ts";
import { loadEmail, templateMarkup } from "../../../adapters/vite/render.ts";
import { FIELD_CLOSE, FIELD_OPEN } from "../../../src/template/tokens.ts";

const examples = join(resolve(import.meta.dirname, "../../.."), "examples");
const emails = findEmails(examples);
const templates = emails.filter((e) => e.template.length > 0);
const dataOf = (set: { file: string }) => JSON.parse(readFileSync(set.file, "utf8"));

// one element per line, fields as {{path}}, so a snapshot diff reads
const readable = (markup: string) =>
  markup.replaceAll(FIELD_OPEN, "{{").replaceAll(FIELD_CLOSE, "}}").replaceAll("><", ">\n<");

// what a reader sees: tags gone, the entities the engines and React write decoded
const ENTITIES: Record<string, string> = { "&amp;": "&", "&#x27;": "'", "&#39;": "'", "&#x3D;": "=", "&quot;": '"', "&#x60;": "`", "&nbsp;": " " };
const text = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[#\w]+;/g, (e) => ENTITIES[e] ?? e)
    .replace(/\s+/g, " ")
    .trim();

let vite: ViteDevServer;
beforeAll(async () => {
  vite = await createEmailServer({ root: examples });
});
afterAll(() => vite.close());

describe("the natively written example templates", () => {
  it("are found as handlebars and liquid templates, each with data sets for its branches", () => {
    expect(templates.map((e) => [e.name, e.template, e.data.map((d) => d.name)])).toEqual([
      ["react-order-template", ["handlebars", "liquid"], ["pickup", "standard", "subscription"]],
      ["vue-order-template", ["handlebars", "liquid"], ["pickup", "standard", "subscription"]],
    ]);
  });

  it.each(templates.map((e) => [e.name, e] as const))("%s renders to tddr markup", async (_, email) => {
    const { component } = await loadEmail(vite, email);
    expect(readable(await templateMarkup(email, component))).toMatchSnapshot();
  });

  const cases = templates.flatMap((e) => e.data.flatMap((set) => e.template.map((d) => [`${e.name} [${d}, ${set.name}]`, e, set, d] as const)));
  it.each(cases)("%s compiles, and the engine's fill reads like the html render", async (_, email, set, dialect) => {
    const data = dataOf(set);
    const filled = await renderEmail(vite, email, { data, mode: dialect });
    const plain = await renderEmail(vite, email, { data, mode: "html" });
    expect(filled.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(filled.filled).toBe("engine");
    expect(text(filled.html)).toBe(text(plain.html));
    // the dev server's preview fill picks the same branches
    expect(text(filled.source)).toBe(text(plain.source));
  });
});

describe("html mode with the operator rewrite", () => {
  // the same Vite setup without the rewrite and shims
  let bare: ViteDevServer;
  beforeAll(async () => {
    bare = await createServer({
      root: examples,
      configFile: false,
      appType: "custom",
      clearScreen: false,
      server: { middlewareMode: true, ws: false },
      optimizeDeps: { noDiscovery: true },
      plugins: [vue(), tailwind(), emailEnvironment()],
      oxc: { jsx: { runtime: "automatic" } },
    });
  });
  afterAll(() => bare.close());

  const cases = emails.flatMap((e: EmailEntry) => e.data.map((set) => [`${e.name} (${set.name})`, e, set] as const));
  it.each(cases)("%s renders exactly as without it", async (_, email, set) => {
    const data = dataOf(set);
    const ours = await renderEmail(vite, email, { data, mode: "html" });
    const theirs = await renderEmail(bare, email, { data, mode: "html" });
    expect(ours.source).toBe(theirs.source);
  });
});

// A data set whose values a dialect's conditions can't read as JS does is reported with what is
// needed, instead of being compared (where the difference might not even show).
describe("data sets are checked against the dialects' data needs", () => {
  let dir: string;
  let server: ViteDevServer;
  beforeAll(async () => {
    // inside the repository, so the project's engines resolve from it
    mkdirSync(join(resolve(import.meta.dirname, "../../.."), "test/.tmp"), { recursive: true });
    dir = mkdtempSync(join(resolve(import.meta.dirname, "../../.."), "test/.tmp/needs-"));
    const files: Record<string, string> = {
      "needs/index.jsx": 'export const lang = "en";\nexport const template = ["handlebars", "liquid"];\nexport default function Needs({ order }) {\n  return <div>{order.tags && <div>Tagged</div>}<div>Note: {order.note ?? "none"}</div></div>;\n}\n',
      "needs/fits.json": '{ "order": { "tags": ["a"], "note": "Hi" } }',
      "needs/empty.json": '{ "order": { "tags": [], "note": null } }',
      "needs/blank.json": '{ "order": { "tags": ["a"], "note": "" } }',
    };
    for (const [f, text] of Object.entries(files)) {
      mkdirSync(join(dir, f, ".."), { recursive: true });
      writeFileSync(join(dir, f), text);
    }
    server = await createEmailServer({ root: dir });
  });
  afterAll(async () => {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("names the data set, the value and the need; Liquid reads them all as JS", async () => {
    const email = findEmails(dir).find((e) => e.name === "needs")!;
    const { diagnostics } = await verifyEmail(server, email);
    expect(diagnostics.map((d) => [d.code, d.message])).toEqual([
      ["E016", 'needs: data set "blank" doesn\'t suit the handlebars template: in "order.note != null", order.note is ""; the handlebars template needs null, missing, or a value other than false, 0, "" and [] there (Handlebars can\'t tell null from those: the template tests that the value is false-like).'],
      ["E016", 'needs: data set "empty" doesn\'t suit the handlebars template: in "order.tags", order.tags is []; the handlebars template needs anything but an empty list there (Handlebars counts an empty list as false, JS as true).'],
    ]);
    expect(diagnostics[1]!.hint).toMatch(/order\.tags\.length != 0/);
  });
});

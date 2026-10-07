import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEmailServer, findEmails, renderEmail, type EmailEntry } from "../../../adapters/vite/index.ts";
import { compileTemplate, fillsLike } from "../../../adapters/vite/render.ts";
import { startTags } from "../../../src/template/tags.ts";

const root = resolve(import.meta.dirname, "../../vite-emails");
let vite: ViteDevServer;
let emails: EmailEntry[];

beforeAll(async () => {
  vite = await createEmailServer({ root });
  emails = findEmails(root);
});
afterAll(() => vite.close());

const email = (name: string) => emails.find((e) => e.name === name)!;
const data = (name: string, set: string) => JSON.parse(readFileSync(email(name).data.find((d) => d.name === set)!.file, "utf8"));
const text = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("renderEmail, html mode", () => {
  it("renders with the data as props, collects the CSS and compiles", async () => {
    const r = await renderEmail(vite, email("hello"), { data: data("hello", "props"), mode: "html" });
    // Badge.jsx is imported before hello.css, so its sheet runs (and cascades) first
    expect(r.source).toBe(
      [
        "<style>",
        ".badge { color: #4f46e5; font-weight: 700; }",
        ".card { max-width: 600px; margin: 0 auto; padding: 16px; background: #ffffff; }",
        ".title { font-size: 24px; color: #111827; }",
        "</style>",
        '<div class="card"><img src="https://example.com/logo.png" width="40" height="40" alt=""/><h1 class="title">Hello Ada</h1><p>tea</p><p>cake</p><span class="badge">new</span></div>',
        "",
      ].join("\n"),
    );
    expect(r.html).toContain("<!DOCTYPE html>");
    expect(r.html).toMatch(/<h1 style="[^"]*color:#111827/);
    expect(r.html).toMatch(/<span style="[^"]*color:#4f46e5/);
    expect(r.template).toBeUndefined();
    expect(r.filled).toBeUndefined();
  });

  it("renders a Vue single-file email with its scoped styles", async () => {
    const r = await renderEmail(vite, email("note"), { data: data("note", "note"), mode: "html" });
    const scope = /<div class="note" (data-v-[0-9a-f]{8})>/.exec(r.source)?.[1];
    expect(scope).toBeDefined();
    expect(r.source).toContain(`.note[${scope}] {`);
    expect(r.source).toContain(`.text[${scope}] {`);
    expect(r.html).not.toContain("data-v-");
    expect(r.html).toMatch(/<p style="[^"]*color:#92400e/);
  });

  it("rejects with the email's name and the error when rendering throws", async () => {
    await expect(renderEmail(vite, email("broken"), { data: {}, mode: "html" })).rejects.toThrow(
      /^broken: rendering with react failed: Cannot read properties of undefined \(reading 'total'\)/,
    );
  });
});

describe.each(["handlebars", "liquid"] as const)("renderEmail, %s mode", (mode) => {
  it("compiles the template once and fills it with the real engine", async () => {
    const r = await renderEmail(vite, email("promo"), { data: data("promo", "props"), mode });
    expect(r.filled).toBe("engine");
    const [field, open] = mode === "handlebars" ? ["{{user.name}}", "{{#each deals as |deal|}}"] : ["{{ user.name | escape }}", "{% for deal in deals %}"];
    expect(r.template).toContain(field);
    expect(r.template).toContain(open);
    expect(text(r.html)).toBe("Hello Ada. Green tea for $9 Teapot for $30");
    expect(r.source).toContain(".deal { padding: 12px; background: #fef3c7; }");
    expect(text(r.source)).toBe("Hello Ada. Green tea for $9 Teapot for $30");
  });

  it("decides branches from the data", async () => {
    const r = await renderEmail(vite, email("promo"), { data: { ...data("promo", "props"), show: false }, mode });
    expect(text(r.html)).toBe("Hello Ada.");
  });
});

describe("rejections", () => {
  it("won't render an email as a template it isn't written for", async () => {
    await expect(renderEmail(vite, email("hello"), { data: {}, mode: "liquid" })).rejects.toThrow(
      "hello is not written as a liquid template (it has no `export const template`)",
    );
  });

  it("wants the data to be an object", async () => {
    await expect(renderEmail(vite, email("hello"), { data: ["Ada"], mode: "html" })).rejects.toThrow('hello: data must be a JSON object, got ["Ada"]');
  });

  it("says which entry failed to load", async () => {
    const missing: EmailEntry = { ...email("hello"), name: "ghost", entry: join(root, "ghost/index.jsx") };
    await expect(renderEmail(vite, missing, { data: {}, mode: "html" })).rejects.toThrow(/^ghost: loading .*ghost\/index\.jsx failed/);
  });
});

describe("what the dev page gets to tie its views together", () => {
  const bare = (html: string) => html.replace(/ data-tddr-[stn]="[^"]*"/g, "").replace(/<tddr-f data-tddr-f="\d+">([^]*?)<\/tddr-f>/g, "$1");

  it("html mode: a trace of the compiled html, and nothing else", async () => {
    const r = await renderEmail(vite, email("hello"), { data: data("hello", "props"), mode: "html" });
    expect(r.trace).toHaveLength(startTags(r.html).length);
    expect(r.trace!.some((e) => e !== undefined)).toBe(true);
    expect(r.html).not.toContain("tddr\u{F8F0}src");
    expect(r.sourceShown).toBeUndefined();
    expect(r.htmlShown).toBeUndefined();
  });

  it.each(["handlebars", "liquid"] as const)("%s mode: the template's trace and both frames, marked", async (mode) => {
    const r = await renderEmail(vite, email("promo"), { data: data("promo", "props"), mode });
    expect(r.trace).toHaveLength(startTags(r.template!).length);
    expect(r.sourceShown).toContain('data-tddr-s="');
    expect(r.sourceShown).toContain("<tddr-f");
    expect(bare(r.sourceShown!)).toBe(r.source);
    expect(r.htmlShown).toContain('data-tddr-t="');
    // the same page as the compiled tab shows, once the marks are taken off
    expect(bare(r.htmlShown!)).toBe(r.html);
    expect(r.unlinked).toBeUndefined();
    expect(r.html).not.toMatch(/tddr-(src|f)|data-tddr/);
  });

  it("marks the frame without the loop's copies too", async () => {
    const r = await renderEmail(vite, email("promo"), { data: { ...data("promo", "props"), show: false }, mode: "handlebars" });
    expect(bare(r.htmlShown!)).toBe(r.html);
  });

  it("a build never sees the trace or the marks", async () => {
    const t = await compileTemplate(vite, email("promo"), "handlebars");
    expect(t.trace).toBeUndefined();
    expect(t.template).not.toMatch(/tddr-(src|f)|data-tddr/);
    const r = await renderEmail(vite, email("promo"), { data: data("promo", "props"), mode: "handlebars" });
    expect(t.template).toBe(r.template);
  });
});

describe("annotated fill check", () => {
  it("accepts a fill that only adds the annotations, and refuses one with other tags", () => {
    const html = '<table><tr><td><p>Ann</p></td></tr></table>';
    expect(fillsLike('<table data-tddr-t="0"><tr data-tddr-t="1"><td data-tddr-t="2"><p data-tddr-t="3"><tddr-f data-tddr-f="40">Ann</tddr-f></p></td></tr></table>', html)).toBe(true);
    expect(fillsLike('<table data-tddr-t="0"><tr data-tddr-t="1"><td data-tddr-t="2"><b>Ann</b></td></tr></table>', html)).toBe(false);
  });
});

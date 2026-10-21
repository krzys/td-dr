import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startDevServer, type DevDeps, type DevServer } from "../../adapters/dev/index.ts";
import { sanitizeName } from "../../adapters/dev/data.ts";
import type { EmailEntry } from "../../adapters/vite/types.ts";
import type { StartDevServer } from "../../src/cli.ts";
import { GMAIL_CLIP_BYTES } from "../../src/limits.ts";

// the CLI loads the dev server by URL, so tsc can't check the call; this does
startDevServer satisfies StartDevServer;

// a cut-down findEmails: folders with index.tsx, or single .tsx files with `<name>.<set>.json` beside them
const scan = (dir: string): EmailEntry[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((f): EmailEntry[] => {
    const at = join(dir, f.name);
    if (f.isDirectory()) {
      const files = readdirSync(at);
      if (!files.includes("index.tsx")) return [];
      const data = files.filter((x) => x.endsWith(".json")).map((x) => ({ name: basename(x, ".json"), file: join(at, x) }));
      const template = f.name === "receipt" ? (["handlebars"] as const) : [];
      return [{ name: f.name, entry: join(at, "index.tsx"), framework: "react", data, template: [...template] }];
    }
    if (!f.name.endsWith(".vue")) return [];
    const name = basename(f.name, ".vue");
    const data = readdirSync(dir)
      .filter((x) => x.startsWith(`${name}.`) && x.endsWith(".json"))
      .map((x) => ({ name: x.slice(name.length + 1, -5), file: join(dir, x) }));
    return [{ name, entry: at, framework: "vue", data, template: [] }];
  });

let dir: string;
let server: DevServer;
let watcher: EventEmitter;
let render: ReturnType<typeof vi.fn<DevDeps["renderEmail"]>>;

const start = async (extra: Partial<DevDeps> = {}, { fsWatch = false } = {}): Promise<void> => {
  const deps: DevDeps = { findEmails: scan, renderEmail: render, ...(!fsWatch && { watcher: watcher as never }), ...extra };
  server = await startDevServer({ dir, port: 0, host: "127.0.0.1", deps });
};

const api = async (path: string, init: RequestInit & { json?: unknown } = {}) => {
  const { json, ...rest } = init;
  const res = await fetch(new URL(path, server.url), {
    ...rest,
    ...(json !== undefined && { body: JSON.stringify(json), headers: { "content-type": "application/json" } }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tddr-dev-"));
  mkdirSync(join(dir, "welcome"));
  writeFileSync(join(dir, "welcome/index.tsx"), "export default () => null;");
  writeFileSync(join(dir, "welcome/default.json"), '{"name":"Ada"}');
  mkdirSync(join(dir, "receipt"));
  writeFileSync(join(dir, "receipt/index.tsx"), "");
  writeFileSync(join(dir, "note.vue"), "");
  writeFileSync(join(dir, "note.short.json"), "{}");
  watcher = new EventEmitter();
  render = vi.fn<DevDeps["renderEmail"]>(async (_e, o) => {
    if ((o.data as { boom?: boolean }).boom) throw Object.assign(new Error("boom"), { frame: "> 1 | x", loc: { file: "/x.tsx", line: 1, column: 2 } });
    const page = `<p>${JSON.stringify(o.data)}</p>`;
    return { source: page, input: page, html: "<table></table>", text: "", diagnostics: [], assets: [] };
  });
});

afterEach(async () => {
  await server?.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("dev server api", () => {
  it("lists emails with framework, data sets and dialects", async () => {
    await start();
    const { status, body } = await api("/__tddr/api/emails");
    expect(status).toBe(200);
    expect(body.dir).toBe(dir);
    expect(body.emails).toEqual([
      { name: "note", framework: "vue", data: ["short"], template: [] },
      { name: "receipt", framework: "react", data: [], template: ["handlebars"] },
      { name: "welcome", framework: "react", data: ["default"], template: [] },
    ]);
  });

  it("renders with a data set, inline data and compile options", async () => {
    await start();
    const a = await api("/__tddr/api/render", { method: "POST", json: { email: "welcome", data: "default" } });
    expect(a.status).toBe(200);
    expect(a.body).toEqual({
      source: '<p>{"name":"Ada"}</p>',
      input: '<p>{"name":"Ada"}</p>',
      html: "<table></table>",
      text: "",
      diagnostics: [],
      assets: [],
      size: { bytes: 15, limit: GMAIL_CLIP_BYTES },
    });
    expect(render.mock.calls[0]![1]).toEqual({ data: { name: "Ada" }, mode: "html", compile: {} });

    await api("/__tddr/api/render", {
      method: "POST",
      json: { email: "receipt", json: { n: 1 }, mode: "handlebars", compile: { width: 480, nope: 1 } },
    });
    expect(render.mock.calls[1]![0].name).toBe("receipt");
    expect(render.mock.calls[1]![1]).toEqual({ data: { n: 1 }, mode: "handlebars", compile: { width: 480 } });
  });

  it("passes the dev-only fields of a render on as they are", async () => {
    render.mockResolvedValueOnce({
      source: "<p>a</p>",
      input: "<p>a</p>",
      html: "<p>a</p>",
      text: "a\n",
      template: "<p>a</p>",
      diagnostics: [],
      assets: [],
      trace: [undefined, { line: 1, col: 1 }],
      sourceShown: '<p data-tddr-s="0">a</p>',
      htmlShown: '<p data-tddr-t="0">a</p>',
    });
    await start();
    const r = await api("/__tddr/api/render", { method: "POST", json: { email: "receipt", json: {}, mode: "handlebars" } });
    expect(r.status).toBe(200);
    // an entry with no source is null in JSON; the page reads null and undefined alike
    expect(r.body.trace).toEqual([null, { line: 1, col: 1 }]);
    expect(r.body.sourceShown).toBe('<p data-tddr-s="0">a</p>');
    expect(r.body.htmlShown).toBe('<p data-tddr-t="0">a</p>');
    // the page can't ask for a trace in the compile options
    expect(render.mock.calls[0]![1].compile).toEqual({});
    await api("/__tddr/api/render", { method: "POST", json: { email: "receipt", json: {}, mode: "handlebars", compile: { trace: true } } });
    expect(render.mock.calls[1]![1].compile).toEqual({});
  });

  it("refuses unknown emails, modes and bad options", async () => {
    await start();
    const post = (json: unknown) => api("/__tddr/api/render", { method: "POST", json });
    expect((await post({ email: "nope" })).status).toBe(404);
    expect((await post({ email: "welcome", mode: "liquid" })).status).toBe(400);
    expect((await post({ email: "welcome", compile: { width: -1 } })).status).toBe(400);
    expect((await post({ email: "welcome", compile: { allowSvg: "yes" } })).status).toBe(400);
    expect((await post({ email: "welcome", json: [1] })).status).toBe(400);
    expect((await post({ email: "welcome", data: "../../etc/passwd" })).status).toBe(404);
    expect(render).not.toHaveBeenCalled();
  });

  it("checks every field of a render request before rendering", async () => {
    await start();
    const post = (json: unknown) => api("/__tddr/api/render", { method: "POST", json });
    const bad = [{}, { email: 1 }, { email: "welcome", mode: 2 }, { email: "welcome", mode: "jinja" }, { email: "welcome", json: "x" }, { email: "welcome", compile: 1 }];
    for (const body of bad) {
      const r = await post(body);
      expect(r.status, JSON.stringify(body)).toBe(400);
      expect(typeof r.body.error.message).toBe("string");
    }
    expect((await api("/__tddr/api/render", { method: "POST", body: "[1]" })).status).toBe(400);
    expect((await api("/__tddr/api/render", { method: "POST", body: "{nope" })).status).toBe(400);
    expect(render).not.toHaveBeenCalled();
    // a typed editor wins over the saved set
    await post({ email: "welcome", data: "default", json: { name: "Grace" } });
    expect(render.mock.calls[0]![1].data).toEqual({ name: "Grace" });
    // a data that names no set is no set
    await post({ email: "welcome", data: {} });
    expect(render.mock.calls[1]![1].data).toBeUndefined();
  });

  it("measures the compiled email in UTF-8 bytes against the compiler's clipping limit", async () => {
    render.mockResolvedValueOnce({ source: "", input: "", html: "é".repeat(51_001), text: "", diagnostics: [], assets: [] });
    await start();
    const r = await api("/__tddr/api/render", { method: "POST", json: { email: "welcome" } });
    expect(r.body.size).toEqual({ bytes: 102_002, limit: 102_000 });
  });

  it("returns render errors as data and keeps serving", async () => {
    await start();
    const r = await api("/__tddr/api/render", { method: "POST", json: { email: "welcome", json: { boom: true } } });
    expect(r.status).toBe(500);
    expect(r.body.error).toMatchObject({ message: "boom", frame: "> 1 | x", file: "/x.tsx", line: 1, col: 2 });
    expect((await api("/__tddr/api/emails")).status).toBe(200);
  });

  it("reports a throwing findEmails as a 500, not a crash", async () => {
    await start({
      findEmails: () => {
        throw new Error("scan failed");
      },
    });
    const r = await api("/__tddr/api/emails");
    expect(r.status).toBe(500);
    expect(r.body.error.message).toBe("scan failed");
  });

  it("reads a data set", async () => {
    await start();
    const r = await api("/__tddr/api/data?email=welcome&set=default");
    expect(r.body).toEqual({ name: "default", text: '{"name":"Ada"}' });
    expect((await api("/__tddr/api/data?email=welcome&set=nope")).status).toBe(404);
  });

  it("writes a data set pretty-printed, after validating it", async () => {
    await start();
    const file = join(dir, "welcome/default.json");
    const put = (body: string) => api("/__tddr/api/data?email=welcome&set=default", { method: "PUT", body });

    expect((await put('{"name":"Grace","tags":["a"]}')).status).toBe(200);
    expect(readFileSync(file, "utf8")).toBe('{\n  "name": "Grace",\n  "tags": [\n    "a"\n  ]\n}\n');

    const bad = await put("{nope");
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toMatch(/invalid JSON/);
    expect((await put("[1,2]")).status).toBe(400);
    expect(readFileSync(file, "utf8")).toContain("Grace");
  });

  it("never writes outside an email's data sets", async () => {
    await start();
    for (const set of ["../../evil", "../receipt/index", "/etc/passwd", "default/../../x"]) {
      const r = await api(`/__tddr/api/data?email=welcome&set=${encodeURIComponent(set)}`, { method: "PUT", body: "{}" });
      expect(r.status).toBe(404);
    }
    const r = await api(`/__tddr/api/data?email=${encodeURIComponent("../welcome")}&set=default`, { method: "PUT", body: "{}" });
    expect(r.status).toBe(404);
    expect(readFileSync(join(dir, "welcome/default.json"), "utf8")).toBe('{"name":"Ada"}');
  });

  it("saves as a new data set inside a folder email", async () => {
    await start();
    const r = await api("/__tddr/api/data?email=welcome", { method: "POST", json: { name: "Summer Promo!", text: '{"a":1}' } });
    expect(r).toEqual({ status: 200, body: { name: "summer-promo" } });
    expect(readFileSync(join(dir, "welcome/summer-promo.json"), "utf8")).toBe('{\n  "a": 1\n}\n');

    const again = await api("/__tddr/api/data?email=welcome", { method: "POST", json: { name: "summer promo", text: "{}" } });
    expect(again.status).toBe(409);
  });

  it("saves as next to a single-file email, and sanitizes traversal away", async () => {
    await start();
    const r = await api("/__tddr/api/data?email=note", { method: "POST", json: { name: "../../../tmp/evil", text: "{}" } });
    expect(r.body).toEqual({ name: "tmp-evil" });
    expect(readdirSync(dir)).toContain("note.tmp-evil.json");

    for (const name of ["..", "///", ""]) {
      const bad = await api("/__tddr/api/data?email=note", { method: "POST", json: { name, text: "{}" } });
      expect(bad.status).toBe(400);
    }
    const invalid = await api("/__tddr/api/data?email=note", { method: "POST", json: { name: "x", text: "nope" } });
    expect(invalid.status).toBe(400);
  });

  it("refuses writes from other origins", async () => {
    await start();
    const from = (origin: string) =>
      fetch(new URL("/__tddr/api/data?email=welcome", server.url), {
        method: "POST",
        headers: { origin, "content-type": "text/plain" },
        body: JSON.stringify({ name: "x", text: "{}" }),
      });
    expect((await from("https://evil.example")).status).toBe(403);
    expect((await from("null")).status).toBe(403);
    expect(readdirSync(join(dir, "welcome"))).not.toContain("x.json");
    expect((await from(new URL(server.url).origin)).status).toBe(200);
  });

  it("sanitizes names", () => {
    expect(sanitizeName("  Hello World.json ")).toBe("hello-world");
    expect(sanitizeName("..\\..\\win")).toBe("win");
    expect(sanitizeName("a/b")).toBe("a-b");
    expect(sanitizeName("ü")).toBe("");
  });

  it("serves the page and its modules, 404s the rest", async () => {
    await start();
    const page = await fetch(new URL("/", server.url));
    expect(page.headers.get("content-type")).toMatch(/text\/html/);
    expect(await page.text()).toContain("td;dr");
    const js = await fetch(new URL("/__tddr/ui/app.js", server.url));
    expect(js.headers.get("content-type")).toMatch(/javascript/);
    expect((await fetch(new URL("/__tddr/ui/..%2F..%2Fpackage.json", server.url))).status).toBe(404);
    expect((await fetch(new URL("/nope", server.url))).status).toBe(404);
    expect((await fetch(new URL("/__tddr/api/nope", server.url))).status).toBe(404);
  });

  it("refuses a missing emails folder before starting anything", async () => {
    const close = vi.fn(async () => {});
    await expect(
      startDevServer({ dir: join(dir, "nope"), port: 0, deps: { findEmails: scan, renderEmail: render, close } }),
    ).rejects.toThrow(/no emails folder/);
  });

  it("hands unknown paths to Vite's middlewares", async () => {
    await start({ middlewares: (req, res) => res.end(`vite ${req.url}`) });
    expect(await (await fetch(new URL("/logo.png", server.url))).text()).toBe("vite /logo.png");
  });
});

// reads SSE frames until one matches
const nextEvent = async (reader: ReadableStreamDefaultReader<Uint8Array>, kind = "change") => {
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) throw new Error("stream ended");
    buf += dec.decode(value);
    const frames = buf.split("\n\n");
    buf = frames.pop()!;
    for (const f of frames) {
      const ev = /^event: (.*)$/m.exec(f)?.[1];
      const data = /^data: (.*)$/m.exec(f)?.[1];
      if (ev === kind && data) return JSON.parse(data) as Record<string, unknown>;
    }
  }
};

describe("dev server live reload", () => {
  it("pushes a change event from the watcher, with the email and data set it belongs to", async () => {
    await start();
    const res = await fetch(new URL("/__tddr/events", server.url));
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const reader = res.body!.getReader();
    await vi.waitFor(() => expect(watcher.listenerCount("all")).toBe(1));
    // let the stream open before the event goes out
    await new Promise((r) => setTimeout(r, 20));
    watcher.emit("all", "change", join(dir, "../elsewhere.css")); // outside dir: dropped
    watcher.emit("all", "change", join(dir, "welcome/default.json"));
    expect(await nextEvent(reader)).toEqual({ kind: "change", file: "welcome/default.json", email: "welcome", data: "default" });
    writeFileSync(join(dir, "fresh.vue"), "");
    watcher.emit("all", "add", join(dir, "fresh.vue"));
    expect(await nextEvent(reader)).toEqual({ kind: "add", file: "fresh.vue", email: "fresh" });
    await reader.cancel();
  });

  it("also pushes changes to files outside dir that an email imports", async () => {
    const shared = join(dir, "../shared/Button.jsx");
    await start({ imports: (f) => f === shared });
    const res = await fetch(new URL("/__tddr/events", server.url));
    const reader = res.body!.getReader();
    await vi.waitFor(() => expect(watcher.listenerCount("all")).toBe(1));
    await new Promise((r) => setTimeout(r, 20));
    watcher.emit("all", "change", join(dir, "../elsewhere.css"));
    watcher.emit("all", "change", shared);
    expect(await nextEvent(reader)).toEqual({ kind: "change", file: "../shared/Button.jsx" });
    await reader.cancel();
  });

  it("falls back to fs.watch without a Vite watcher", async () => {
    await start({}, { fsWatch: true });
    const res = await fetch(new URL("/__tddr/events", server.url));
    const reader = res.body!.getReader();
    await new Promise((r) => setTimeout(r, 50));
    writeFileSync(join(dir, "welcome/style.css"), "p{}");
    const ev = await nextEvent(reader);
    expect(ev.file).toBe("welcome/style.css");
    await reader.cancel();
  });

  it("stops listening on close", async () => {
    await start();
    expect(watcher.listenerCount("all")).toBe(1);
    await server.close();
    expect(watcher.listenerCount("all")).toBe(0);
    server = undefined as never;
  });
});

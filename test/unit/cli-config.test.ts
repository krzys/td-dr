import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startDevServer } from "../../adapters/dev/index.ts";
import { buildEmails } from "../../adapters/vite/index.ts";
import { run, type CliIO } from "../../src/cli.ts";
import { loadConfig } from "../../src/config-file.ts";
import { compile } from "../../src/index.ts";

vi.mock("../../src/index.ts", async (orig) => {
  const actual = await orig<typeof import("../../src/index.ts")>();
  return { ...actual, compile: vi.fn(() => ({ html: "<p>ok</p>", diagnostics: [] })) };
});
vi.mock("../../adapters/vite/index.ts", () => ({ buildEmails: vi.fn(async () => []) }));
vi.mock("../../adapters/dev/index.ts", () => ({ startDevServer: vi.fn(async () => ({ url: "http://localhost:3100/" })) }));

const index = pathToFileURL(join(import.meta.dirname, "../../src/index.ts")).href;
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tddr-config-"));
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  vi.mocked(compile).mockClear();
  vi.mocked(buildEmails).mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

const write = (name: string, source: string) => writeFileSync(join(dir, name), source);

const io = (dirs: string[] = []) => {
  const err: string[] = [];
  const io: CliIO = {
    stdout: () => {},
    stderr: (s) => void err.push(s),
    readFile: () => "<p>hi</p>",
    writeFile: () => {},
    isDir: (p) => dirs.includes(p),
  };
  return { io, err: () => err.join("") };
};

describe("tddr.config", () => {
  it("is optional", async () => {
    expect(await loadConfig(dir)).toBeUndefined();
    expect(await run(["build", "in.html"], io().io)).toBe(0);
    expect(vi.mocked(compile).mock.calls[0]![1]).not.toHaveProperty("width");
  });

  it("loads a .ts config with its types, and a .mjs one through defineConfig", async () => {
    write("tddr.config.ts", 'const width: number = 480;\nexport default { targets: ["gmail"], width } satisfies { width: number };\n');
    expect(await loadConfig(dir)).toEqual({ file: "tddr.config.ts", config: { targets: ["gmail"], width: 480 } });
    rmSync(join(dir, "tddr.config.ts"));
    write("tddr.config.mjs", `import { defineConfig } from "${index}";\nexport default defineConfig({ baseUrl: "https://cdn.example.com/e" });\n`);
    expect(await loadConfig(dir)).toEqual({ file: "tddr.config.mjs", config: { baseUrl: "https://cdn.example.com/e" } });
  });

  it("gives a file build its targets and width, and a flag wins", async () => {
    write("tddr.config.mjs", 'export default { targets: ["gmail", "outlook-2019"], width: 480, baseUrl: "https://cdn.example.com/e" };\n');
    expect(await run(["build", "in.html"], io().io)).toBe(0);
    // one file has no images to host, so the base URL isn't for it
    expect(vi.mocked(compile).mock.calls[0]![1]).toMatchObject({ targets: ["gmail", "outlook-2019"], width: 480 });
    expect(await run(["build", "in.html", "--width", "640", "--targets", "apple-mail"], io().io)).toBe(0);
    expect(vi.mocked(compile).mock.calls[1]![1]).toMatchObject({ targets: ["apple-mail"], width: 640 });
  });

  it("gives a folder build and dev the base URL, and --base-url wins", async () => {
    write("tddr.config.js", 'export default { width: 520, baseUrl: "https://cdn.example.com/e" };\n');
    expect(await run(["build", "emails"], io(["emails"]).io)).toBe(0);
    expect(vi.mocked(buildEmails).mock.calls[0]![0]).toEqual({ dir: "emails", out: "dist/emails", baseUrl: "https://cdn.example.com/e", compile: { strict: true, width: 520 } });
    expect(await run(["build", "emails", "--base-url", "https://img.example.com"], io(["emails"]).io)).toBe(0);
    expect(vi.mocked(buildEmails).mock.calls[1]![0]).toMatchObject({ baseUrl: "https://img.example.com" });
    expect(await run(["dev"], io().io)).toBe(0);
    expect(vi.mocked(startDevServer).mock.calls.at(-1)![0]).toEqual({ dir: "emails", port: 3100, baseUrl: "https://cdn.example.com/e" });
  });

  it("names the file and the key that is wrong, and exits 2", async () => {
    const cases: [string, string, string][] = [
      ["tddr.config.ts", "export default { widht: 600 };", 'tddr: tddr.config.ts: unknown key "widht"; expected targets, width or baseUrl\n'],
      ["tddr.config.mts", 'export default { width: "600" };', 'tddr: tddr.config.mts: width must be a positive integer, got "600"\n'],
      ["tddr.config.js", 'export default { targets: "gmail" };', 'tddr: tddr.config.js: targets must be an array of target names, got "gmail"\n'],
      ["tddr.config.mjs", 'export default { baseUrl: "" };', 'tddr: tddr.config.mjs: baseUrl must be a URL, got ""\n'],
      ["tddr.config.mjs", "export const width = 600;", "tddr: tddr.config.mjs: the default export must be an object, like defineConfig({ … })\n"],
    ];
    for (const [i, [name, source, message]] of cases.entries()) {
      // a folder each, as a module loads once per path
      const sub = join(dir, `${i}`);
      mkdirSync(sub);
      vi.mocked(process.cwd).mockReturnValue(sub);
      writeFileSync(join(sub, name), source);
      const t = io();
      expect(await run(["build", "in.html"], t.io)).toBe(2);
      expect(t.err()).toBe(message);
    }
    expect(compile).not.toHaveBeenCalled();
  });

  it("wants one config file", async () => {
    write("tddr.config.ts", "export default {};");
    write("tddr.config.mjs", "export default {};");
    const t = io();
    expect(await run(["build", "in.html"], t.io)).toBe(2);
    expect(t.err()).toBe("tddr: found tddr.config.ts and tddr.config.mjs; keep one\n");
  });
});

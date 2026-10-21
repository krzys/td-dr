import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildEmails } from "../../adapters/vite/index.ts";
import { run, type CliIO } from "../../src/cli.ts";
import { compile } from "../../src/index.ts";

// real compile unless a test swaps it out
vi.mock("../../src/index.ts", async (orig) => {
  const actual = await orig<typeof import("../../src/index.ts")>();
  return { ...actual, compile: vi.fn(actual.compile) };
});
vi.mock("../../adapters/vite/index.ts", () => ({ buildEmails: vi.fn() }));

beforeEach(() => {
  vi.mocked(compile).mockClear();
  vi.mocked(buildEmails).mockReset();
});

const warned = (n: number) => ({ html: "<p/>", diagnostics: Array.from({ length: n }, (_, i) => ({ code: "W001", severity: "warning", message: `w${i}` })) }) as never;

const fakeIO = (files: Record<string, string> = { "in.html": "<p>hi</p>" }, dirs: string[] = []) => {
  const out: string[] = [];
  const err: string[] = [];
  const written: string[] = [];
  const io: CliIO = {
    stdout: (s) => void out.push(s),
    stderr: (s) => void err.push(s),
    readFile: (p) => {
      if (!(p in files)) throw new Error(`ENOENT: ${p}`);
      return files[p]!;
    },
    writeFile: (p) => void written.push(p),
    isDir: (p) => dirs.includes(p),
  };
  return { io, out: () => out.join(""), err: () => err.join(""), written };
};

describe("tddr check <file>", () => {
  it("compiles as build does and writes nothing, not even to stdout", async () => {
    const t = fakeIO({ "in.html": '<html lang="en"><title>Hi</title><p>hi</p></html>', "a.css": "p{color:#111}" });
    expect(await run(["check", "in.html", "--css", "a.css", "--width", "480", "--targets", "gmail"], t.io)).toBe(0);
    expect(vi.mocked(compile).mock.calls[0]![1]).toMatchObject({ css: ["p{color:#111}"], width: 480, targets: ["gmail"], strict: true });
    expect(t.out()).toBe("");
    expect(t.err()).toBe("");
    expect(t.written).toEqual([]);
  });

  it("says each diagnostic and exits 1 on an error", async () => {
    vi.mocked(compile).mockReturnValueOnce({ html: "", diagnostics: [{ code: "E999", severity: "error", message: "msg", loc: { line: 2, col: 7 } }] } as never);
    const t = fakeIO();
    expect(await run(["check", "in.html"], t.io)).toBe(1);
    expect(t.err()).toBe("in.html:2:7: error E999: msg\n");
    expect(t.out()).toBe("");
  });

  it("exits 1 on more warnings than --max-warnings", async () => {
    vi.mocked(compile).mockReturnValueOnce(warned(2));
    const over = fakeIO();
    expect(await run(["check", "in.html", "--max-warnings", "1"], over.io)).toBe(1);
    expect(over.err()).toBe("in.html: warning W001: w0\nin.html: warning W001: w1\ntddr: 2 warnings, more than --max-warnings 1\n");
    vi.mocked(compile).mockReturnValueOnce(warned(2));
    expect(await run(["check", "in.html", "--max-warnings", "2"], fakeIO().io)).toBe(0);
    vi.mocked(compile).mockReturnValueOnce(warned(1));
    const zero = fakeIO();
    expect(await run(["check", "in.html", "--max-warnings", "0"], zero.io)).toBe(1);
    expect(zero.err()).toContain("tddr: 1 warning, more than --max-warnings 0\n");
    // without it warnings pass, as for build
    vi.mocked(compile).mockReturnValueOnce(warned(5));
    expect(await run(["check", "in.html"], fakeIO().io)).toBe(0);
  });

  it("rejects a --max-warnings that isn't a whole number", async () => {
    for (const n of ["-1", "1.5", "x", ""]) {
      const t = fakeIO();
      expect(await run(["check", "in.html", `--max-warnings=${n}`], t.io)).toBe(2);
      expect(t.err()).toBe(`tddr: --max-warnings must be a whole number, got "${n}"\n`);
    }
  });

  it("says --format json or sarif on stdout without needing -o", async () => {
    vi.mocked(compile).mockReturnValueOnce(warned(1));
    const t = fakeIO();
    expect(await run(["check", "in.html", "--format", "json"], t.io)).toBe(0);
    expect(JSON.parse(t.out())).toEqual([{ file: "in.html", code: "W001", severity: "warning", message: "w0", count: 1, places: [] }]);
    expect(t.err()).toBe("");
    vi.mocked(compile).mockReturnValueOnce(warned(1));
    const s = fakeIO();
    expect(await run(["check", "in.html", "--format", "sarif"], s.io)).toBe(0);
    expect(JSON.parse(s.out()).runs[0].results).toHaveLength(1);
  });

  it("rejects the flags that write, the dev flags, and --max-warnings elsewhere", async () => {
    for (const [args, flag, command] of [
      [["check", "in.html", "-o", "out.html"], "out", "check"],
      [["check", "in.html", "--text"], "text", "check"],
      [["check", "emails", "--file-name", "[name].html"], "file-name", "check"],
      [["check", "in.html", "--port", "1"], "port", "check"],
      [["build", "in.html", "--max-warnings", "0"], "max-warnings", "build"],
      [["dev", "--max-warnings", "0"], "max-warnings", "dev"],
    ] as const) {
      const t = fakeIO();
      expect(await run([...args], t.io)).toBe(2);
      expect(t.err()).toBe(`tddr: --${flag} doesn't apply to "${command}"\n`);
    }
    expect(compile).not.toHaveBeenCalled();
  });

  it("needs one input", async () => {
    const t = fakeIO();
    expect(await run(["check"], t.io)).toBe(2);
    expect(t.err()).toContain('expected "build <input.html>", "check <input.html>" or "dev [dir]"');
    expect(await run(["check", "a.html", "b.html"], fakeIO().io)).toBe(2);
  });
});

describe("tddr check <folder>", () => {
  it("builds the folder without writing, and says what it skipped and found", async () => {
    vi.mocked(buildEmails).mockResolvedValue([
      { email: "badge", dialect: "liquid", diagnostics: [{ code: "W008", severity: "warning", message: "big" }] },
      { email: "plain", skipped: "not a template", diagnostics: [] },
    ]);
    const t = fakeIO({}, ["emails"]);
    expect(await run(["check", "emails", "--base-url", "https://cdn.example.com/e", "--no-verify"], t.io)).toBe(0);
    expect(vi.mocked(buildEmails).mock.calls[0]![0]).toEqual({
      dir: "emails",
      out: "dist/emails",
      baseUrl: "https://cdn.example.com/e",
      verify: false,
      write: false,
      compile: { strict: true },
    });
    expect(t.out()).toBe("skipped plain: not a template\n");
    expect(t.err()).toBe("badge (liquid): warning W008: big\n");
    expect(await run(["check", "emails", "--max-warnings", "0"], fakeIO({}, ["emails"]).io)).toBe(1);
  });

  it("exits 1 on an error or a render failure", async () => {
    vi.mocked(buildEmails).mockResolvedValue([{ email: "boom", dialect: "handlebars", error: "boom: rendering with react failed: nope", diagnostics: [] }]);
    const t = fakeIO({}, ["emails"]);
    expect(await run(["check", "emails"], t.io)).toBe(1);
    expect(t.err()).toBe("boom (handlebars): rendering with react failed: nope\n");
  });
});

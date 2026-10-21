import { beforeEach, describe, expect, it, vi } from "vitest";
import { run, type CliIO } from "../../src/cli.ts";
import { compile } from "../../src/index.ts";

// real compile unless a test swaps it out
vi.mock("../../src/index.ts", async (orig) => {
  const actual = await orig<typeof import("../../src/index.ts")>();
  return { ...actual, compile: vi.fn(actual.compile) };
});

beforeEach(() => {
  vi.mocked(compile).mockClear();
});

const clean = { html: "<p>ok</p>", diagnostics: [] } as never;

const fakeIO = (files: Record<string, string> = { "in.html": "<p>hi</p>" }) => {
  const out: string[] = [];
  const err: string[] = [];
  const written: Record<string, string> = {};
  const io: CliIO = {
    stdout: (s) => void out.push(s),
    stderr: (s) => void err.push(s),
    readFile: (p) => {
      if (!(p in files)) throw new Error(`ENOENT: ${p}`);
      return files[p]!;
    },
    writeFile: (p, s) => void (written[p] = s),
  };
  return { io, out, err, written };
};

describe("cli", () => {
  it("prints help and version", async () => {
    const a = fakeIO();
    expect(await run(["--help"], a.io)).toBe(0);
    expect(a.out.join("")).toContain("Usage: tddr build");
    const b = fakeIO();
    expect(await run(["--version"], b.io)).toBe(0);
    expect(b.out.join("")).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("rejects missing command or input", async () => {
    expect(await run([], fakeIO().io)).toBe(2);
    expect(await run(["build"], fakeIO().io)).toBe(2);
    expect(await run(["--nope"], fakeIO().io)).toBe(2);
  });

  it("rejects bad --width", async () => {
    for (const w of ["0", "-3", "abc", "1.5"]) {
      const t = fakeIO();
      expect(await run(["build", "in.html", "--width", w], t.io)).toBe(2);
      expect(t.err.join("")).toContain("--width");
    }
  });

  it("returns 2 for unreadable input or css", async () => {
    expect(await run(["build", "missing.html"], fakeIO().io)).toBe(2);
    expect(await run(["build", "in.html", "--css", "nope.css"], fakeIO().io)).toBe(2);
  });

  it("writes to -o and not stdout", async () => {
    vi.mocked(compile).mockReturnValueOnce(clean);
    const t = fakeIO();
    expect(await run(["build", "in.html", "-o", "out.html"], t.io)).toBe(0);
    expect(t.written["out.html"]).toBe("<p>ok</p>");
    expect(t.out).toEqual([]);
  });

  it("writes to stdout without -o", async () => {
    vi.mocked(compile).mockReturnValueOnce(clean);
    const t = fakeIO();
    expect(await run(["build", "in.html"], t.io)).toBe(0);
    expect(t.out).toEqual(["<p>ok</p>"]);
  });

  it("passes the full flag set through to compile", async () => {
    vi.mocked(compile).mockReturnValueOnce(clean);
    const t = fakeIO({ "in.html": "<p>x</p>", "a.css": "p{color:red}", "b.css": "p{margin:0}" });
    const code = await run(
      ["build", "in.html", "--width", "480", "--css", "a.css", "--css", "b.css", "--allow-unsupported"],
      t.io,
    );
    expect(code).toBe(0);
    const [html, opts] = vi.mocked(compile).mock.calls[0]!;
    expect(html).toBe("<p>x</p>");
    expect(opts!.width).toBe(480);
    expect(opts!.css).toEqual(["p{color:red}", "p{margin:0}"]);
    expect(opts).not.toHaveProperty("targets");
  });

  it("prints an error with loc and hint, exits 1", async () => {
    vi.mocked(compile).mockReturnValueOnce({
      html: "",
      diagnostics: [{ code: "E999", severity: "error", message: "msg", hint: "h", loc: { line: 2, col: 7 } }] as never,
    });
    const t = fakeIO();
    expect(await run(["build", "in.html"], t.io)).toBe(1);
    expect(t.err.join("")).toBe("in.html:2:7: error E999: msg\n  hint: h\n");
  });

  it("lists the other places of a diagnostic said for several", async () => {
    const locs = [{ line: 2, col: 7 }, { line: 5, col: 1 }, { line: 9, col: 3 }];
    vi.mocked(compile).mockReturnValueOnce({ html: "", diagnostics: [{ code: "W001", severity: "warning", message: "m (3 places)", loc: locs[0], locs }] as never });
    const t = fakeIO();
    expect(await run(["build", "in.html"], t.io)).toBe(0);
    expect(t.err.join("")).toBe("in.html:2:7: warning W001: m (3 places)\n  also at: 5:1, 9:3\n");
  });

  it("passes --lang to compile, and rejects one that isn't a language tag", async () => {
    vi.mocked(compile).mockReturnValueOnce(clean);
    expect(await run(["build", "in.html", "--lang", "de-AT"], fakeIO().io)).toBe(0);
    expect(vi.mocked(compile).mock.calls[0]![1]).toMatchObject({ lang: "de-AT" });
    const t = fakeIO();
    expect(await run(["build", "in.html", "--lang", "de AT"], t.io)).toBe(2);
    expect(t.err.join("")).toContain("--lang");
  });

  it("is strict by default", async () => {
    vi.mocked(compile).mockReturnValueOnce(clean);
    await run(["build", "in.html"], fakeIO().io);
    expect(vi.mocked(compile).mock.calls[0]![1]).toMatchObject({ strict: true });
  });

  it("--allow-unsupported turns strict off, warnings alone exit 0", async () => {
    vi.mocked(compile).mockReturnValueOnce({
      html: "<p/>",
      diagnostics: [{ code: "W1", severity: "warning", message: "meh" }] as never,
    });
    const t = fakeIO();
    expect(await run(["build", "in.html", "--allow-unsupported"], t.io)).toBe(0);
    expect(vi.mocked(compile).mock.calls[0]![1]).toMatchObject({ strict: false });
    expect(t.err.join("")).toBe("in.html: warning W1: meh\n");
  });

  it("--allow-svg sets allowSvg and leaves strict on", async () => {
    vi.mocked(compile).mockReturnValueOnce(clean);
    await run(["build", "in.html", "--allow-svg"], fakeIO().io);
    expect(vi.mocked(compile).mock.calls[0]![1]).toMatchObject({ strict: true, allowSvg: true });
  });

  it("exits 0 with only warnings and info", async () => {
    vi.mocked(compile).mockReturnValueOnce({
      html: "<p/>",
      diagnostics: [
        { code: "W1", severity: "warning", message: "a" },
        { code: "I1", severity: "info", message: "b" },
      ] as never,
    });
    expect(await run(["build", "in.html"], fakeIO().io)).toBe(0);
  });

  it("drops empty --targets so compile uses its default", async () => {
    for (const v of [",", ""]) {
      vi.mocked(compile).mockClear();
      await run(["build", "in.html", "--targets", v], fakeIO().io);
      expect(vi.mocked(compile).mock.calls[0]![1]).not.toHaveProperty("targets");
    }
  });

  it("rejects --width with no value", async () => {
    expect(await run(["build", "in.html", "--width"], fakeIO().io)).toBe(2);
  });

  it("formats file:line:col, honours loc.file, skips missing hints", async () => {
    vi.mocked(compile).mockReturnValueOnce({
      html: "",
      diagnostics: [
        { code: "X", severity: "warning", message: "msg", loc: { line: 3, col: 5 } },
        { code: "Y", severity: "warning", message: "other", loc: { file: "a.css", line: 1, col: 2 } },
        { code: "Z", severity: "warning", message: "nowhere" },
      ] as never,
    });
    const t = fakeIO();
    expect(await run(["build", "in.html"], t.io)).toBe(0);
    expect(t.err.join("")).toBe(
      "in.html:3:5: warning X: msg\na.css:1:2: warning Y: other\nin.html: warning Z: nowhere\n",
    );
  });

  it("splits and trims --targets", async () => {
    const t = fakeIO();
    await run(["build", "in.html", "--targets", "gmail, outlook-2019"], t.io);
    expect(vi.mocked(compile).mock.calls[0]![1]).toMatchObject({ targets: ["gmail", "outlook-2019"] });
  });

  it("lets compile crashes through instead of calling them usage errors", async () => {
    vi.mocked(compile).mockImplementationOnce(() => {
      throw new Error("unknown target nope");
    });
    await expect(run(["build", "in.html", "--targets", "nope"], fakeIO().io)).rejects.toThrow("unknown target");
  });

  it("returns 2 when the -o write fails", async () => {
    const t = fakeIO();
    t.io.writeFile = () => {
      throw new Error("EACCES: out.html");
    };
    expect(await run(["build", "in.html", "-o", "out.html"], t.io)).toBe(2);
    expect(t.err.join("")).toContain("EACCES");
  });

  it("rejects extra positionals", async () => {
    const t = fakeIO({ "a.html": "", "b.html": "" });
    expect(await run(["build", "a.html", "b.html"], t.io)).toBe(2);
  });
});

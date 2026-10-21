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

const clean = (n = 0) => ({ html: `<p>${n}</p>`, diagnostics: [] }) as never;

// files a test can change, and the change the CLI's watcher would see
const watched = (files: Record<string, string>, dirs: string[] = []) => {
  const err: string[] = [];
  const written: Record<string, string> = {};
  let onChange: (() => void) | undefined;
  const io: CliIO = {
    stdout: () => {},
    stderr: (s) => void err.push(s),
    readFile: (p) => {
      if (!(p in files)) throw new Error(`ENOENT: ${p}`);
      return files[p]!;
    },
    writeFile: (p, s) => void (written[p] = s),
    isDir: (p) => dirs.includes(p),
    watch: vi.fn((_, cb: () => void) => void (onChange = cb)),
  };
  return { io, files, written, err: () => err.join(""), change: () => onChange!() };
};

describe("--watch", () => {
  it("builds, then builds again when the input or a --css file changes", async () => {
    const t = watched({ "in.html": '<html lang="en"><title>T</title><p>one</p></html>', "a.css": "p{color:#111}" });
    expect(await run(["build", "in.html", "--css", "a.css", "-o", "out.html", "--watch"], t.io)).toBe(0);
    expect(t.io.watch).toHaveBeenCalledWith(["in.html", "a.css"], expect.any(Function));
    expect(t.written["out.html"]).toContain("one");
    expect(t.err()).toBe("watching in.html, a.css\nbuilt out.html: 0 errors, 0 warnings\n");

    t.files["in.html"] = '<html lang="en"><title>T</title><p>two</p></html>';
    t.change();
    await vi.waitFor(() => expect(t.written["out.html"]).toContain("two"));
    t.files["a.css"] = "p{color:#222}";
    t.change();
    await vi.waitFor(() => expect(t.written["out.html"]).toContain("#222"));
    expect(t.err().split("\n").filter((l) => l.startsWith("built"))).toHaveLength(3);
  });

  it("says diagnostics and the counts each time, and keeps going after an error", async () => {
    const t = watched({ "in.html": "<p>x</p>" });
    vi.mocked(compile).mockReturnValueOnce({
      html: "",
      diagnostics: [
        { code: "E999", severity: "error", message: "bad" },
        { code: "W001", severity: "warning", message: "meh" },
      ],
    } as never);
    expect(await run(["check", "in.html", "--watch"], t.io)).toBe(0);
    expect(t.err()).toBe("watching in.html\nin.html: error E999: bad\nin.html: warning W001: meh\nchecked in.html: 1 error, 1 warning\n");
    vi.mocked(compile).mockReturnValueOnce(clean());
    t.change();
    await vi.waitFor(() => expect(t.err()).toContain("checked in.html: 0 errors, 0 warnings\n"));
    expect(t.written).toEqual({});
  });

  it("waits out an input it can't read and a compile that throws", async () => {
    const t = watched({});
    expect(await run(["build", "in.html", "-o", "out.html", "--watch"], t.io)).toBe(0);
    expect(t.err()).toBe("watching in.html\ntddr: ENOENT: in.html\n");
    t.files["in.html"] = "<p>x</p>";
    vi.mocked(compile).mockImplementationOnce(() => {
      throw new Error("kaboom");
    });
    t.change();
    await vi.waitFor(() => expect(t.err()).toContain("tddr: kaboom\n"));
    vi.mocked(compile).mockReturnValueOnce(clean(1));
    t.change();
    await vi.waitFor(() => expect(t.written["out.html"]).toBe("<p>1</p>"));
  });

  it("settles a burst of changes into one build", async () => {
    const t = watched({ "in.html": "<p>x</p>" });
    await run(["build", "in.html", "-o", "out.html", "--watch"], t.io);
    for (let i = 0; i < 5; i++) t.change();
    await vi.waitFor(() => expect(compile).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 100));
    expect(compile).toHaveBeenCalledTimes(2);
  });

  it("takes one file, needs -o to build it, and isn't for dev", async () => {
    const dir = watched({}, ["emails"]);
    expect(await run(["build", "emails", "--watch"], dir.io)).toBe(2);
    expect(dir.err()).toBe("tddr: --watch takes one file, not a folder; tddr dev rebuilds a folder's emails on save\n");
    expect(await run(["check", "emails", "--watch"], dir.io)).toBe(2);
    const noOut = watched({ "in.html": "<p>x</p>" });
    expect(await run(["build", "in.html", "--watch"], noOut.io)).toBe(2);
    expect(noOut.err()).toBe("tddr: --watch writes the HTML on every change; give -o for it\n");
    const dev = watched({});
    expect(await run(["dev", "--watch"], dev.io)).toBe(2);
    expect(dev.err()).toBe('tddr: --watch doesn\'t apply to "dev"\n');
    expect(dir.io.watch).not.toHaveBeenCalled();
    expect(noOut.io.watch).not.toHaveBeenCalled();
  });
});

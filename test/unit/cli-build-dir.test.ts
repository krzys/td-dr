import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildEmails, type BuildResult } from "../../adapters/vite/index.ts";
import { run, type CliIO } from "../../src/cli.ts";

vi.mock("../../adapters/vite/index.ts", () => ({ buildEmails: vi.fn() }));

const ok: BuildResult[] = [
  { email: "badge", dialect: "handlebars", file: "/p/dist/emails/badge.handlebars.html", assets: ["logo-1234abcd.png"], diagnostics: [] },
  { email: "plain", skipped: "not a template", diagnostics: [] },
];

beforeEach(() => {
  vi.mocked(buildEmails).mockReset();
  vi.mocked(buildEmails).mockResolvedValue(ok);
});

const io = (dirs = ["emails"]) => {
  const out: string[] = [];
  const err: string[] = [];
  const io: CliIO = {
    stdout: (s) => void out.push(s),
    stderr: (s) => void err.push(s),
    readFile: () => "",
    writeFile: () => {},
    isDir: (p) => dirs.includes(p),
  };
  return { io, out: () => out.join(""), err: () => err.join("") };
};

describe("tddr build <folder>", () => {
  it("builds the folder's templates into dist/emails, strict by default", async () => {
    const t = io();
    expect(await run(["build", "emails"], t.io)).toBe(0);
    expect(vi.mocked(buildEmails).mock.calls[0]![0]).toEqual({ dir: "emails", out: "dist/emails", compile: { strict: true } });
    expect(t.out()).toBe(["wrote /p/dist/emails/badge.handlebars.html", "skipped plain: not a template", ""].join("\n"));
  });

  it("passes -o, --base-url, --targets, --width and --allow-unsupported through", async () => {
    const args = ["build", "emails", "-o", "out", "--base-url", "https://cdn.example.com/e", "--targets", "gmail, apple-mail", "--width", "640", "--allow-unsupported"];
    const t = io();
    expect(await run(args, t.io)).toBe(0);
    expect(vi.mocked(buildEmails).mock.calls[0]![0]).toEqual({
      dir: "emails",
      out: "out",
      baseUrl: "https://cdn.example.com/e",
      compile: { strict: false, targets: ["gmail", "apple-mail"], width: 640 },
    });
    expect(t.out()).toContain("images in out/assets go to https://cdn.example.com/e\n");
  });

  it("--lang reaches the folder build's compile options", async () => {
    await run(["build", "emails", "--lang", "pl"], io().io);
    expect(vi.mocked(buildEmails).mock.calls.at(-1)![0]).toEqual({ dir: "emails", out: "dist/emails", compile: { strict: true, lang: "pl" } });
  });

  it("--allow-svg reaches the folder build's compile options", async () => {
    await run(["build", "emails", "--allow-svg"], io().io);
    expect(vi.mocked(buildEmails).mock.calls.at(-1)![0]).toEqual({ dir: "emails", out: "dist/emails", compile: { strict: true, allowSvg: true } });
  });

  it("prints diagnostics and render failures, and exits 1 on any error", async () => {
    vi.mocked(buildEmails).mockResolvedValue([
      {
        email: "badge",
        entry: `${process.cwd()}/emails/badge/index.jsx`,
        dialect: "liquid",
        file: "/p/dist/emails/badge.liquid.html",
        diagnostics: [{ code: "E015", severity: "error", message: "/badge/logo.png needs a hosted URL", hint: "Pass --base-url" }],
      },
      { email: "boom", dialect: "handlebars", error: "boom: rendering with react failed: nope", diagnostics: [] },
    ]);
    const t = io();
    expect(await run(["build", "emails"], t.io)).toBe(1);
    expect(t.err()).toBe(
      [
        // the file the email starts in, and the email's name said once
        "emails/badge/index.jsx (liquid): error E015: /badge/logo.png needs a hosted URL",
        "  hint: Pass --base-url",
        "boom (handlebars): rendering with react failed: nope",
        "",
      ].join("\n"),
    );
  });

  it("exits 0 with warnings only", async () => {
    vi.mocked(buildEmails).mockResolvedValue([
      { email: "badge", dialect: "liquid", file: "/x.html", diagnostics: [{ code: "W008", severity: "warning", message: "big" }] },
    ]);
    expect(await run(["build", "emails"], io().io)).toBe(0);
  });

  it("passes --file-name through and reports a bad one", async () => {
    const t = io();
    expect(await run(["build", "emails", "--file-name", "[dialect]/[name].html"], t.io)).toBe(0);
    expect(vi.mocked(buildEmails).mock.calls[0]![0]).toMatchObject({ fileName: "[dialect]/[name].html" });
    vi.mocked(buildEmails).mockRejectedValue(new Error('file name "[name].html" gives a.html for both a (handlebars) and a (liquid)'));
    const bad = io();
    expect(await run(["build", "emails", "--file-name", "[name].html"], bad.io)).toBe(2);
    expect(bad.err()).toBe('tddr: file name "[name].html" gives a.html for both a (handlebars) and a (liquid)\n');
  });

  it("passes --no-verify through, and only for a folder", async () => {
    const t = io();
    expect(await run(["build", "emails"], t.io)).toBe(0);
    expect(vi.mocked(buildEmails).mock.calls[0]![0]).not.toHaveProperty("verify");
    expect(await run(["build", "emails", "--no-verify"], io().io)).toBe(0);
    expect(vi.mocked(buildEmails).mock.calls[1]![0]).toMatchObject({ verify: false });
    const file = io([]);
    expect(await run(["build", "in.html", "--no-verify"], file.io)).toBe(2);
    expect(file.err()).toContain("--no-verify applies to a folder build");
  });

  it("rejects flags that don't fit the input", async () => {
    const dir = io();
    expect(await run(["build", "emails", "--css", "x.css"], dir.io)).toBe(2);
    expect(dir.err()).toContain("--css doesn't apply to a folder build");
    const file = io([]);
    expect(await run(["build", "in.html", "--base-url", "https://x"], file.io)).toBe(2);
    expect(file.err()).toContain("--base-url applies to a folder build or dev");
    expect(await run(["build", "in.html", "--file-name", "[name].html"], file.io)).toBe(2);
    expect(file.err()).toContain("--file-name applies to a folder build");
    expect(buildEmails).not.toHaveBeenCalled();
  });
});

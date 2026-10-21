import { beforeEach, describe, expect, it, vi } from "vitest";
import { startDevServer } from "../../adapters/dev/index.ts";
import { run, type CliIO } from "../../src/cli.ts";

vi.mock("../../adapters/dev/index.ts", () => ({
  startDevServer: vi.fn(async (o: { port?: number }) => ({ url: `http://localhost:${o.port}/`, port: o.port, close: async () => {} })),
}));

beforeEach(() => {
  vi.mocked(startDevServer).mockClear();
});

const io = () => {
  const out: string[] = [];
  const err: string[] = [];
  const io: CliIO = {
    stdout: (s) => void out.push(s),
    stderr: (s) => void err.push(s),
    readFile: () => "",
    writeFile: () => {},
  };
  return { io, out, err };
};

describe("tddr dev", () => {
  it("defaults to ./emails on port 3100 and prints the URL", async () => {
    const t = io();
    expect(await run(["dev"], t.io)).toBe(0);
    expect(vi.mocked(startDevServer).mock.calls[0]![0]).toEqual({ dir: "emails", port: 3100 });
    expect(t.out.join("")).toContain("http://localhost:3100/");
  });

  it("takes a dir, --port, --host and --base-url", async () => {
    expect(await run(["dev", "mail", "--port", "4000", "--host", "0.0.0.0", "--base-url", "https://cdn.example.com"], io().io)).toBe(0);
    expect(vi.mocked(startDevServer).mock.calls[0]![0]).toEqual({ dir: "mail", port: 4000, host: "0.0.0.0", baseUrl: "https://cdn.example.com" });
  });

  it("rejects bad ports, extra args and build flags", async () => {
    for (const args of [
      ["dev", "--port", "x"],
      ["dev", "--port", "70000"],
      ["dev", "--port", "-1"],
      ["dev", "a", "b"],
      ["dev", "--width", "600"],
      ["dev", "--host", ""],
      ["build", "in.html", "--port", "1"],
    ]) {
      const t = io();
      expect(await run(args, t.io), args.join(" ")).toBe(2);
      expect(t.err.join("")).not.toBe("");
    }
    expect(startDevServer).not.toHaveBeenCalled();
  });

  it("reports a busy port and other start failures", async () => {
    vi.mocked(startDevServer).mockRejectedValueOnce(Object.assign(new Error("listen EADDRINUSE"), { code: "EADDRINUSE" }));
    const a = io();
    expect(await run(["dev"], a.io)).toBe(1);
    expect(a.err.join("")).toContain("port 3100 is in use");

    vi.mocked(startDevServer).mockRejectedValueOnce(new Error("no emails folder at /x"));
    const b = io();
    expect(await run(["dev", "/x"], b.io)).toBe(1);
    expect(b.err.join("")).toContain("no emails folder");
  });

  it("is in the help", async () => {
    const t = io();
    await run(["--help"], t.io);
    expect(t.out.join("")).toMatch(/tddr dev \[dir\]/);
    expect(t.out.join("")).toContain("--port");
  });
});

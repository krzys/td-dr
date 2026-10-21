import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildEmails } from "../../adapters/vite/index.ts";
import { run, type CliIO } from "../../src/cli.ts";
import { codes } from "../../src/diagnostics/codes.ts";

vi.mock("../../adapters/vite/index.ts", () => ({ buildEmails: vi.fn() }));

beforeEach(() => vi.mocked(buildEmails).mockReset());

const fakeIO = (files: Record<string, string>, dirs: string[] = []) => {
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
    isDir: (p) => dirs.includes(p),
  };
  return { io, out: () => out.join(""), err: () => err.join(""), written };
};

// an absolutely positioned <p> (E002, at its line) said twice, and no lang (I009, nowhere)
const html = `<title>t</title>
<p style="position:absolute">a</p>
<p style="position:absolute">b</p>
`;

type Json = Record<string, unknown> & { [k: string]: any };

// What SARIF 2.1.0 requires of the parts tddr writes (sarif-schema-2.1.0.json): a problem per breach.
const sarifProblems = (log: Json): string[] => {
  const bad: string[] = [];
  const check = (ok: unknown, what: string) => void (ok || bad.push(what));
  const int = (n: unknown, min: number) => Number.isInteger(n) && (n as number) >= min;
  const LEVELS = ["none", "note", "warning", "error"];
  check(log.version === "2.1.0", "version is 2.1.0");
  check(log.$schema === undefined || typeof log.$schema === "string", "$schema is a URI");
  check(Array.isArray(log.runs) && log.runs.length === 1, "one run");
  for (const run of log.runs ?? []) {
    const driver = run.tool?.driver;
    check(typeof driver?.name === "string", "tool.driver.name");
    check(driver?.version === undefined || typeof driver.version === "string", "driver.version is a string");
    const rules: Json[] = driver?.rules ?? [];
    check(Array.isArray(rules), "driver.rules is an array");
    check(new Set(rules.map((r) => r.id)).size === rules.length, "rule ids are unique");
    for (const r of rules) {
      check(typeof r.id === "string", "rule.id");
      for (const k of ["shortDescription", "fullDescription", "help"]) check(r[k] === undefined || typeof r[k].text === "string", `rule.${k}.text`);
      check(r.defaultConfiguration === undefined || LEVELS.includes(r.defaultConfiguration.level), "rule level");
    }
    check(Array.isArray(run.results), "run.results is an array");
    for (const res of run.results ?? []) {
      check(typeof res.message?.text === "string", "result.message.text");
      check(res.ruleId === undefined || typeof res.ruleId === "string", "result.ruleId");
      check(res.ruleIndex === undefined || (int(res.ruleIndex, -1) && rules[res.ruleIndex]?.id === res.ruleId), "result.ruleIndex names its rule");
      check(res.level === undefined || LEVELS.includes(res.level), "result.level");
      check(res.properties === undefined || (typeof res.properties === "object" && !Array.isArray(res.properties)), "result.properties");
      for (const loc of res.locations ?? []) {
        const p = loc.physicalLocation;
        if (p === undefined) continue;
        check(typeof p.artifactLocation?.uri === "string", "physicalLocation.artifactLocation.uri");
        check(!/[\s\\]/.test(p.artifactLocation?.uri ?? ""), "uri is a URI reference");
        if (p.region) check(int(p.region.startLine, 1) && (p.region.startColumn === undefined || int(p.region.startColumn, 1)), "region starts at line and column 1 or later");
      }
    }
  }
  return bad;
};

describe("--format", () => {
  it("text is the default, json and sarif need -o for a file build, and nothing else is valid", async () => {
    const t = fakeIO({ "in.html": html });
    expect(await run(["build", "in.html", "--format", "xml"], t.io)).toBe(2);
    expect(t.err()).toBe('tddr: --format must be text, json or sarif, got "xml"\n');
    const j = fakeIO({ "in.html": html });
    expect(await run(["build", "in.html", "--format", "json"], j.io)).toBe(2);
    expect(j.err()).toBe("tddr: --format json writes the report to stdout; give -o for the HTML\n");
    const d = fakeIO({});
    expect(await run(["dev", "--format", "json"], d.io)).toBe(2);
    expect(d.err()).toBe('tddr: --format doesn\'t apply to "dev"\n');
    const plain = fakeIO({ "in.html": html });
    const textual = fakeIO({ "in.html": html });
    expect(await run(["build", "in.html", "-o", "out.html"], plain.io)).toBe(1);
    expect(await run(["build", "in.html", "-o", "out.html", "--format", "text"], textual.io)).toBe(1);
    expect(textual.err()).toBe(plain.err());
    expect(plain.err()).toContain("in.html:2:1: error E002:");
  });

  it("json lists each diagnostic with its place, count and places on stdout only", async () => {
    const t = fakeIO({ "in.html": html });
    expect(await run(["build", "in.html", "-o", "out.html", "--format", "json"], t.io)).toBe(1);
    expect(t.err()).toBe("");
    expect(t.written["out.html"]).toContain("<!DOCTYPE html>");
    const list = JSON.parse(t.out()) as Json[];
    const e002 = list.find((d) => d.code === "E002")!;
    expect(e002).toEqual({
      file: "in.html",
      line: 2,
      column: 1,
      code: "E002",
      severity: "error",
      message: expect.stringContaining("(2 places)"),
      hint: codes.E002.hint,
      count: 2,
      places: [
        { file: "in.html", line: 2, column: 1 },
        { file: "in.html", line: 3, column: 1 },
      ],
    });
    // a diagnostic with no place is at the file
    expect(list.find((d) => d.code === "I009")).toMatchObject({ file: "in.html", count: 1, places: [] });
    expect(list.find((d) => d.code === "I009")).not.toHaveProperty("line");
  });

  it("sarif is a valid 2.1.0 log: one run, the codes as rules, results at their places", async () => {
    const t = fakeIO({ "in.html": html });
    expect(await run(["build", "in.html", "-o", "out.html", "--format", "sarif"], t.io)).toBe(1);
    expect(t.err()).toBe("");
    const log = JSON.parse(t.out()) as Json;
    expect(sarifProblems(log)).toEqual([]);
    const { driver } = log.runs[0].tool;
    expect(driver.name).toBe("tddr");
    expect(driver.rules.map((r: Json) => r.id)).toEqual(Object.keys(codes).sort());
    expect(driver.rules.find((r: Json) => r.id === "W001")).toEqual({
      id: "W001",
      shortDescription: { text: codes.W001.title },
      help: { text: codes.W001.hint },
      defaultConfiguration: { level: "warning" },
    });
    const results: Json[] = log.runs[0].results;
    const e002 = results.find((r) => r.ruleId === "E002")!;
    expect(e002.level).toBe("error");
    expect(e002.locations).toEqual([
      { physicalLocation: { artifactLocation: { uri: "in.html" }, region: { startLine: 2, startColumn: 1 } } },
      { physicalLocation: { artifactLocation: { uri: "in.html" }, region: { startLine: 3, startColumn: 1 } } },
    ]);
    const i009 = results.find((r) => r.ruleId === "I009")!;
    expect(i009.level).toBe("note");
    expect(i009.locations).toEqual([{ physicalLocation: { artifactLocation: { uri: "in.html" } } }]);
  });

  it("a folder build says progress on stderr and the report, with dialects, on stdout", async () => {
    vi.mocked(buildEmails).mockResolvedValue([
      {
        email: "badge",
        entry: `${process.cwd()}/emails/badge/index.jsx`,
        dialect: "liquid",
        file: "/p/dist/emails/badge.liquid.html",
        diagnostics: [{ code: "W001", severity: "warning", message: "m", hint: "h", loc: { file: `${process.cwd()}/emails/my badge/style.css`, line: 2, col: 3 } }],
      },
      { email: "plain", skipped: "not a template", diagnostics: [] },
    ]);
    const t = fakeIO({}, ["emails"]);
    expect(await run(["build", "emails", "--format", "json"], t.io)).toBe(0);
    expect(t.out()).not.toContain("wrote");
    expect(t.err()).toBe("wrote /p/dist/emails/badge.liquid.html\nskipped plain: not a template\n");
    expect(JSON.parse(t.out())).toEqual([
      {
        file: "emails/my badge/style.css",
        line: 2,
        column: 3,
        code: "W001",
        severity: "warning",
        message: "m",
        hint: "h",
        count: 1,
        places: [{ file: "emails/my badge/style.css", line: 2, column: 3 }],
        dialect: "liquid",
      },
    ]);
    const s = fakeIO({}, ["emails"]);
    expect(await run(["build", "emails", "--format", "sarif"], s.io)).toBe(0);
    const log = JSON.parse(s.out()) as Json;
    expect(sarifProblems(log)).toEqual([]);
    // the path a URI reference, relative to where tddr ran
    expect(log.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri).toBe("emails/my%20badge/style.css");
    expect(log.runs[0].results[0].properties).toEqual({ hint: "h", dialect: "liquid" });
  });

  it("a folder build's email that wrote nothing is an E019 at its file in the report, and exits 1", async () => {
    vi.mocked(buildEmails).mockResolvedValue([
      { email: "boom", entry: `${process.cwd()}/emails/boom/index.jsx`, dialect: "handlebars", error: "boom: rendering with react failed: nope", diagnostics: [] },
      { email: "badge", file: "/p/dist/emails/badge.html", diagnostics: [] },
    ]);
    const t = fakeIO({}, ["emails"]);
    expect(await run(["build", "emails", "--format", "json"], t.io)).toBe(1);
    expect(t.err()).toBe("emails/boom/index.jsx (handlebars): rendering with react failed: nope\nwrote /p/dist/emails/badge.html\n");
    expect(JSON.parse(t.out())).toEqual([
      { file: "emails/boom/index.jsx", code: "E019", severity: "error", message: "rendering with react failed: nope", hint: codes.E019.hint, count: 1, places: [], dialect: "handlebars" },
    ]);
    const s = fakeIO({}, ["emails"]);
    expect(await run(["build", "emails", "--format", "sarif"], s.io)).toBe(1);
    const log = JSON.parse(s.out()) as Json;
    expect(sarifProblems(log)).toEqual([]);
    const [result] = log.runs[0].results;
    expect([result.ruleId, result.level, result.message.text]).toEqual(["E019", "error", "rendering with react failed: nope"]);
    expect(result.locations[0].physicalLocation.artifactLocation.uri).toBe("emails/boom/index.jsx");
  });
});

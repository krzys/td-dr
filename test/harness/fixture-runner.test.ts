import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { isActive, loadFixtures, parseIntent } from "./fixture-runner.ts";

describe("parseIntent", () => {
  test("reads scalars, arrays and the description", () => {
    const i = parseIntent(
      [
        "---",
        "feature: image",
        "status: active",
        "viewports: [600, 375]",
        "maxDiffRatio: 0.002",
        "strict: true",
        "codes: []",
        "title: 'hello # world'",
        "---",
        "First line.",
        "",
        "Second line.",
      ].join("\n"),
    );
    expect(i).toEqual({
      feature: "image",
      status: "active",
      viewports: [600, 375],
      maxDiffRatio: 0.002,
      strict: true,
      codes: [],
      title: "hello # world",
      description: "First line.\n\nSecond line.",
    });
  });

  test("ignores comments and blank lines", () => {
    const i = parseIntent("---\n# whole line\nexpect: diagnostic # trailing\n\ncodes: [A, B]\n---\nx");
    expect(i.expect).toBe("diagnostic");
    expect(i.codes).toEqual(["A", "B"]);
  });

  test("no frontmatter means everything is description", () => {
    expect(parseIntent("just text\n")).toEqual({ description: "just text" });
  });

  test("handles CRLF and a closing fence with trailing spaces", () => {
    const i = parseIntent("---\r\nfeature: x\r\nstatus: active\r\n--- \r\nbody\r\n");
    expect(i).toEqual({ feature: "x", status: "active", description: "body" });
  });

  test("numbers, quoted booleans and empty values", () => {
    const i = parseIntent("---\na: -3\nb: 0.25\nc: 'true'\nd:\n---\n");
    expect(i.a).toBe(-3);
    expect(i.b).toBe(0.25);
    expect(i.c).toBe("true");
    expect(i.d).toBe("");
  });

  test("unclosed frontmatter throws", () => {
    expect(() => parseIntent("---\nfeature: x\n")).toThrow(/never closed/);
  });
});

describe("skipEngines", () => {
  const intent = (line: string) => parseIntent(`---\nstatus: active\n${line}\n---\n`);

  test("lists engines, the comment stays out of the data", () => {
    expect(intent("skipEngines: [webkit] # WebKit supports margin-trim, the source renders differently").skipEngines).toEqual(["webkit"]);
    expect(intent("skipEngines: [firefox, webkit] # a reason").skipEngines).toEqual(["firefox", "webkit"]);
  });

  test("without a reason it throws", () => {
    expect(() => intent("skipEngines: [webkit]")).toThrow(/needs a "# reason"/);
    expect(() => intent("skipEngines: [webkit] #  ")).toThrow(/needs a "# reason"/);
  });

  test("a reason is a comment, not a hash inside quotes", () => {
    expect(() => intent("skipEngines: ['webkit#x']")).toThrow(/must be a list/);
  });

  test("unknown engines, a bare word and an empty list throw", () => {
    expect(() => intent("skipEngines: [safari] # no such engine")).toThrow(/must be a list of chromium, firefox, webkit/);
    expect(() => intent("skipEngines: webkit # not a list")).toThrow(/must be a list/);
    expect(() => intent("skipEngines: [] # nothing")).toThrow(/must be a list/);
  });

  test("a fixture without it skips nothing", () => {
    expect(intent("viewports: [600]").skipEngines).toBeUndefined();
  });
});

describe("loadFixtures", () => {
  const root = mkdtempSync(join(tmpdir(), "tddr-fx-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const add = (feature: string, name: string, intent?: string) => {
    const dir = join(root, feature, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "input.html"), `<p>${name}</p>`);
    if (intent) writeFileSync(join(dir, "intent.md"), intent);
  };
  add("b", "two", "---\nstatus: active\nexpect: compile\n---\nsecond");
  add("a", "one", "---\nexpect: compile\n---\nfirst");

  test("returns sorted fixtures", () => {
    const fx = loadFixtures(root);
    expect(fx.map((f) => `${f.feature}/${f.name}`)).toEqual(["a/one", "b/two"]);
    expect(fx[1]!.input).toBe("<p>two</p>");
    expect(fx[1]!.dir).toBe(join(root, "b", "two"));
    expect(fx.map(isActive)).toEqual([false, true]);
  });

  test("dir is absolute even for a relative root", () => {
    const fx = loadFixtures(relative(process.cwd(), root));
    expect(isAbsolute(fx[0]!.dir)).toBe(true);
    expect(fx[0]!.dir).toBe(join(root, "a", "one"));
  });

  const bad = (name: string, intent?: string) => {
    const r = mkdtempSync(join(tmpdir(), "tddr-bad-"));
    const dir = join(r, "f", name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "input.html"), "<p>x</p>");
    if (intent !== undefined) writeFileSync(join(dir, "intent.md"), intent);
    return r;
  };

  test("a half-made fixture throws", () => {
    expect(() => loadFixtures(bad("half"))).toThrow(/needs both/);
  });

  test("unknown expect throws", () => {
    expect(() => loadFixtures(bad("x", "---\nexpect: diagnostics\n---\n"))).toThrow(/expect must be/);
  });

  test("skipEngines is read from the file", () => {
    const fx = loadFixtures(bad("z", "---\nexpect: compile\nskipEngines: [webkit] # engine property\n---\n"));
    expect(fx[0]!.intent.skipEngines).toEqual(["webkit"]);
  });

  test("active without expect throws", () => {
    expect(() => loadFixtures(bad("y", "---\nstatus: active\n---\n"))).toThrow(/need an expect/);
  });
});

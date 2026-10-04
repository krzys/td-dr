import { describe, expect, test } from "vitest";
import * as T from "../../adapters/template/index.ts";
import { compile, preview } from "../../src/index.ts";
import type { Cond } from "../../src/ir/index.ts";
import { condText, isProblem, parseCond } from "../../src/template/cond.ts";
import { equalsHelper, type DialectName } from "../../src/template/dialects.ts";
import { fills } from "../harness/template-fixture.ts";

// The template condition language: every operation, on every kind of JSON value, means in each
// dialect's real engine and in preview() what it means in JS (the html render), or the data set
// is refused because it doesn't meet a need the dialect states for that operation.

const MISSING = Symbol("missing");
const VALUES: Array<[name: string, v: unknown]> = [
  ["missing", MISSING],
  ["null", null],
  ["false", false],
  ["true", true],
  ["0", 0],
  ["1", 1],
  ["-1", -1],
  ["0.5", 0.5],
  ['""', ""],
  ['"0"', "0"],
  ['"1"', "1"],
  ['"a"', "a"],
  ['" "', " "],
  ['"false"', "false"],
  ["[]", []],
  ["[0]", [0]],
  ["[1]", [1]],
  ["{}", {}],
  ["{a:1}", { a: 1 }],
];
const DIALECTS = ["handlebars", "liquid"] as const;

const page = (test: string) => `<div><p data-email-if="${test}" style="margin:0">YES</p><p data-email-else style="margin:0">NO</p></div>`;
const compiled = new Map<string, string>();
const template = (test: string, d: DialectName): string => {
  const key = `${d}\0${test}`;
  if (!compiled.has(key)) {
    const r = compile(page(test), { template: d, strict: true });
    expect(r.diagnostics.filter((x) => x.severity === "error"), test).toEqual([]);
    compiled.set(key, r.html);
  }
  return compiled.get(key)!;
};
const verdict = (html: string): boolean => html.includes("YES");
const data = (vars: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(Object.entries(vars).filter(([, v]) => v !== MISSING));
const plain = (v: unknown): unknown => (v === MISSING ? undefined : v);

// preview() for one dialect: the JS verdict, or "refused" when the data doesn't meet a need
const pv = (test: string, vars: Record<string, unknown>, dialects: readonly DialectName[]): boolean | "refused" => {
  try {
    return verdict(preview(page(test), data(vars), { dialects }));
  } catch (e) {
    if ((e as Error).name !== "TemplateDataError") throw e;
    return "refused";
  }
};

const engines = (test: string, d: DialectName, vars: Record<string, unknown>): boolean[] => fills(template(test, d), d, data(vars)).map(verdict);

type Op = { test: string; js: (x: unknown, y?: unknown) => unknown; fields?: 2 };
// the same operation three ways: the condition the template writes, and the JS the html render
// runs through ops.ts on plain values
const OPS: Op[] = [
  { test: "x", js: (x) => T.cond(x, () => true, () => false) },
  { test: "!x", js: (x) => T.not(x) },
  { test: "x == null", js: (x) => T.looseEq(x, null) },
  { test: "x != null", js: (x) => T.looseNe(x, undefined) },
  { test: "x.length != 0", js: (x) => T.gt((x as unknown[]).length, 0) },
  { test: "x.length == 0", js: (x) => T.eq((x as unknown[]).length, 0) },
  { test: "x == 'a'", js: (x) => T.eq(x, "a") },
  { test: "x != 'a'", js: (x) => T.ne(x, "a") },
  { test: "x == '1'", js: (x) => T.eq(x, "1") },
  { test: "x == ''", js: (x) => T.eq(x, "") },
  { test: "x != ''", js: (x) => T.ne(x, "") },
  { test: "x == 1", js: (x) => T.eq(x, 1) },
  { test: "x != 1", js: (x) => T.ne(x, 1) },
  { test: "x == 0", js: (x) => T.eq(x, 0) },
  { test: "x == -1", js: (x) => T.eq(x, -1) },
  { test: "x == 0.5", js: (x) => T.eq(x, 0.5) },
  { test: "x == ' '", js: (x) => T.eq(x, " ") },
  { test: "x == 'false'", js: (x) => T.eq(x, "false") },
  { test: "x.a", js: (x) => T.cond((x as Record<string, unknown> | null)?.a, () => true, () => false) },
  { test: "x.a == null", js: (x) => T.looseEq((x as Record<string, unknown> | null)?.a, null) },
  { test: "x == true", js: (x) => T.eq(x, true) },
  { test: "x != true", js: (x) => T.ne(x, true) },
  { test: "x == false", js: (x) => T.eq(x, false) },
  { test: "x != false", js: (x) => T.ne(x, false) },
  { test: "x == y", js: (x, y) => T.eq(x, y), fields: 2 },
  { test: "x != y", js: (x, y) => T.ne(x, y), fields: 2 },
  { test: "x && y", js: (x, y) => T.cond(T.and(x, () => y), () => true, () => false), fields: 2 },
  { test: "!(x || y)", js: (x, y) => T.not(T.or(x, () => y)), fields: 2 },
  { test: "x == null || y == 'a'", js: (x, y) => T.cond(T.or(T.looseEq(x, null), () => T.eq(y, "a")), () => true, () => false), fields: 2 },
];

// The values each operation can't take in each dialect (`all`: none can; the html render itself
// reads .length), by kind of value. Everything else must agree exactly.
const where = (ok: (v: unknown) => boolean): string[] => VALUES.filter(([, v]) => ok(plain(v))).map(([n]) => n);
const unset = (v: unknown) => v == null;
const kind = (k: string) => (v: unknown) => typeof v === k && v !== null;
const emptyList = (v: unknown) => Array.isArray(v) && v.length === 0;
const notStringOrUnset = where((v) => !kind("string")(v) && !unset(v));
const notNumberOrUnset = where((v) => !kind("number")(v) && !unset(v));
const NEEDS: Record<string, { all?: string[]; handlebars?: string[]; liquid?: string[] }> = {
  x: { handlebars: where(emptyList) },
  "!x": { handlebars: where(emptyList) },
  "x == null": { handlebars: where((v) => v === false || v === 0 || v === "" || emptyList(v)) },
  "x != null": { handlebars: where((v) => v === false || v === 0 || v === "" || emptyList(v)) },
  "x.length != 0": { all: where((v) => !Array.isArray(v) && !kind("string")(v)) },
  "x.length == 0": { all: where((v) => !Array.isArray(v) && !kind("string")(v)) },
  "x == 'a'": { handlebars: notStringOrUnset },
  "x != 'a'": { handlebars: notStringOrUnset },
  "x == '1'": { handlebars: notStringOrUnset },
  "x == ' '": { handlebars: notStringOrUnset },
  "x == 'false'": { handlebars: notStringOrUnset },
  "x == ''": { handlebars: where((v) => !kind("string")(v)) },
  "x != ''": { handlebars: where((v) => !kind("string")(v)) },
  "x == 1": { handlebars: notNumberOrUnset },
  "x != 1": { handlebars: notNumberOrUnset },
  "x == 0": { handlebars: notNumberOrUnset },
  "x == -1": { handlebars: notNumberOrUnset },
  "x == 0.5": { handlebars: notNumberOrUnset },
  "x == true": { handlebars: where((v) => !kind("boolean")(v) && !unset(v)) },
  "x != true": { handlebars: where((v) => !kind("boolean")(v) && !unset(v)) },
  "x == false": { handlebars: where((v) => !kind("boolean")(v)) },
  "x != false": { handlebars: where((v) => !kind("boolean")(v)) },
  // x.a reads nothing off a list or a string, in JS and in both engines
  "x.a == null": { handlebars: where((v) => (v as { a?: unknown } | null)?.a === 0) },
};

const jsVerdict = (op: Op, x: unknown, y?: unknown): boolean | "throws" => {
  try {
    return !!op.js(plain(x), plain(y));
  } catch {
    return "throws";
  }
};

describe("every operation on every value: real engines, preview() and JS agree, or the data is refused", () => {
  for (const op of OPS.filter((o) => !o.fields)) {
    test(op.test, { timeout: 60_000 }, () => {
      const refused: Record<string, string[]> = { all: [], handlebars: [], liquid: [] };
      for (const [name, x] of VALUES) {
        const vars = { x };
        const js = jsVerdict(op, x);
        // no dialect: the language's own needs only
        const bare = pv(op.test, vars, []);
        if (bare === "refused") {
          refused.all!.push(name);
          for (const d of DIALECTS) expect(pv(op.test, vars, [d]), `${d} ${name}`).toBe("refused");
          continue;
        }
        expect(bare, name).toBe(js);
        for (const d of DIALECTS) {
          const got = pv(op.test, vars, [d]);
          if (got === "refused") {
            refused[d]!.push(name);
            continue;
          }
          expect(got, `${d} preview ${name}`).toBe(js);
          for (const e of engines(op.test, d, vars)) expect(e, `${d} engine ${name}\n${template(op.test, d)}`).toBe(js);
        }
      }
      const want = NEEDS[op.test] ?? {};
      expect(refused).toEqual({ all: want.all ?? [], handlebars: want.handlebars ?? [], liquid: want.liquid ?? [] });
    });
  }

  // two fields: every pair of values
  for (const op of OPS.filter((o) => o.fields)) {
    test(op.test, { timeout: 120_000 }, () => {
      const refused: Record<string, number> = { handlebars: 0, liquid: 0 };
      for (const [xn, x] of VALUES) {
        for (const [yn, y] of VALUES) {
          const vars = { x, y };
          const js = jsVerdict(op, x, y);
          expect(pv(op.test, vars, []), `${xn} ${yn}`).toBe(js);
          for (const d of DIALECTS) {
            const got = pv(op.test, vars, [d]);
            if (got === "refused") {
              refused[d]!++;
              continue;
            }
            expect(got, `${d} preview ${xn} ${yn}`).toBe(js);
            for (const e of engines(op.test, d, vars)) expect(e, `${d} engine ${xn} ${yn}\n${template(op.test, d)}`).toBe(js);
          }
        }
      }
      if (op.test === "x == y" || op.test === "x != y") {
        // Handlebars: two strings or two numbers only; Liquid: not two lists
        const n = VALUES.length;
        const [strings, numbers, lists] = [where(kind("string")).length, where(kind("number")).length, where(Array.isArray).length];
        expect(refused).toEqual({ handlebars: n * n - (strings * strings + numbers * numbers), liquid: lists * lists });
      }
    });
  }

  test("field to field: types must match for Handlebars, lists compare by identity in JS", () => {
    expect(pv("x == y", { x: "1", y: 1 }, ["liquid"])).toBe(false);
    expect(pv("x == y", { x: "1", y: 1 }, ["handlebars"])).toBe("refused");
    expect(pv("x == y", { x: [1], y: [1] }, ["liquid"])).toBe("refused");
    expect(pv("x == y", { x: [1], y: [1] }, ["handlebars"])).toBe("refused");
    expect(pv("x == y", { x: "a", y: "a" }, ["handlebars", "liquid"])).toBe(true);
    expect(pv("x == y", { x: null, y: MISSING }, ["liquid"])).toBe(false);
  });

  test("a refused data set says which value, what the dialect needs and why", () => {
    expect(() => preview(page("x == 1"), { x: "1" })).toThrow(
      'template data: in "x == 1", x is "1"; the handlebars template needs a number, null or missing there (the comparison helper is only relied on for two strings or two numbers).\nHint: send x as a number, or compare with a quoted string (\'1\') if the data holds text',
    );
    expect(() => preview(page("items.length != 0"), {})).toThrow(/items is missing; the test needs a list or a string there/);
    // a test JS doesn't evaluate isn't checked: the && stops at a missing list
    expect(preview(page("items && items.length != 0"), {})).toContain("NO");
  });
});

describe("the equals helper requirement", () => {
  test("strict and coercing helpers both meet it; anything else is undefined", () => {
    const vals = VALUES.map(([, v]) => plain(v));
    for (const a of vals) {
      for (const b of vals) {
        const r = equalsHelper(a, b);
        if (r === undefined) continue;
        expect(r, `${String(a)} ${String(b)}`).toBe(a === b);
        expect(r, `${String(a)} ${String(b)}`).toBe(String(a ?? "") === String(b ?? ""));
      }
    }
    expect(equalsHelper("1", 1)).toBeUndefined();
    expect(equalsHelper(undefined, "")).toBeUndefined();
    expect(equalsHelper(null, "a")).toBe(false);
    expect(equalsHelper(undefined, 0)).toBe(false);
  });
});

describe("what a component's JS records", () => {
  const props = () => T.rootProps({ roots: new Set(), aliases: new Set(), reserved: new Set() }).props as Record<string, any>;
  const text = (v: unknown) => T.condText(T.condOf(v));

  test("each operation records the condition the matrix checks", () => {
    const p = props();
    for (const op of OPS) {
      const v = op.js(p.x, p.y);
      expect(text(v), op.test).toBe(condText(parseCond(op.test, "t") as Cond));
    }
  });

  test("?? falls back for null or missing only", () => {
    const p = props();
    const parts = T.blockParts(T.nullish(p.x, () => "F"), (v) => v == null)!;
    expect(parts.map((x) => [x.tag, x.attrs])).toEqual([
      ["tddr-if", { test: "x != null" }],
      ["tddr-else", {}],
    ]);
    // as a test: x when it is set, else the fallback
    expect(text(T.nullish(p.x, () => p.y))).toBe("x != null && x || x == null && y");
    // a list's length is a number, never null
    const length = p.items.length;
    expect(T.nullish(length, () => 0)).toBe(length);
  });

  test("what has no exact template form is a TemplateError with a hint", () => {
    const p = props();
    const cases: Array<[() => unknown, RegExp]> = [
      [() => T.eq(p.x, null), /x: is compared with === to null.*\nHint: write x == null/s],
      [() => T.ne(p.x, undefined), /=== to undefined.*\nHint: write x == null/s],
      [() => T.looseEq(p.x, "a"), /is compared with == to "a".*\nHint: compare with === \(x === 'a'\)/s],
      [() => T.looseNe(p.x, 1), /== to 1.*\nHint: compare with === \(x === 1\)/s],
      [() => T.looseEq(p.x, false), /== to false/],
      [() => T.looseEq(p.x, p.y), /x == y: compares two fields with ==/],
      [() => T.eq(p.x.length, 2), /x\.length: is compared with 2/],
      [() => T.lt(p.x, 3), /is compared with </],
      [() => T.eq(p.x, "a--b"), /--/],
      [() => T.eq(p.x, "a%}"), /holds "%}"/],
      [() => T.eq(p.x, "}}"), /holds "}}"/],
      [() => T.eq(p.x, "a\\b"), /holds "\\\\"/],
      [() => T.eq(p.x, "a\nb"), /holds "\\n"/],
      [() => T.eq(p.y, p.x.length), /x\.length: is compared with y; a template only knows whether a list is empty/],
      [() => T.and(p.x.valueOf, () => 1), /x\.valueOf: is not a data path an ESP can read: "valueOf" reads as a built-in member/],
      [() => T.and(p.x.true, () => 1), /"true" reads as a literal/],
      [() => String(p.log), /log: is not a data path an ESP can read: "log" is a keyword or helper/],
    ];
    for (const [fn, re] of cases) {
      let err: unknown;
      try {
        fn();
      } catch (e) {
        err = e;
      }
      expect((err as Error)?.name, String(re)).toBe("TemplateError");
      expect((err as Error).message).toMatch(re);
    }
  });
});

describe("the marker grammar spells every condition and reads it back exactly", () => {
  const leaves: Cond[] = [
    { op: "truthy", path: "a.b" },
    { op: "nullish", path: "a" },
    { op: "nonEmpty", path: "items" },
    { op: "==", left: { path: "s" }, right: { literal: "x y" } },
    { op: "!=", left: { path: "s" }, right: { literal: "" } },
    { op: "==", left: { path: "n" }, right: { num: -2.5 } },
    { op: "!=", left: { path: "n" }, right: { num: 0 } },
    { op: "==", left: { path: "f" }, right: { bool: true } },
    { op: "!=", left: { path: "f" }, right: { bool: false } },
    { op: "==", left: { path: "a.id" }, right: { path: "b.id" } },
  ];
  const all: Cond[] = [...leaves];
  for (const l of leaves) all.push({ op: "not", cond: l }, { op: "not", cond: { op: "not", cond: l } });
  for (let i = 0; i < leaves.length; i++) {
    const a = leaves[i]!;
    const b = leaves[(i + 3) % leaves.length]!;
    const c = leaves[(i + 5) % leaves.length]!;
    all.push(
      { op: "and", conds: [a, b] },
      { op: "or", conds: [a, b, c] },
      { op: "and", conds: [{ op: "or", conds: [a, b] }, c] },
      { op: "or", conds: [{ op: "and", conds: [a, { op: "not", cond: b }] }, c] },
      { op: "not", cond: { op: "and", conds: [a, { op: "or", conds: [b, c] }] } },
    );
  }

  test.each(all.map((c) => [condText(c), c] as const))("%s", (_text, c) => {
    const back = parseCond(condText(c), "t");
    expect(isProblem(back) ? back.message : back).toEqual(c);
  });

  test("the hint spellings read as the same conditions", () => {
    const same = (a: string, b: string) => expect(parseCond(a, "t"), a).toEqual(parseCond(b, "t"));
    same("items.length > 0", "items.length != 0");
    same("items.length >= 1", "items.length != 0");
    same("!(a == null)", "a != null");
    same('s == "x"', "s == 'x'");
    expect(condText(parseCond("items.length == 0", "t") as Cond)).toBe("items.length == 0");
  });
});

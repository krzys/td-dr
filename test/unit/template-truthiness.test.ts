import Handlebars from "handlebars";
import { Liquid } from "liquidjs";
import { describe, expect, test } from "vitest";
import { compile, preview } from "../../src/index.ts";
import * as T from "../../adapters/template/index.ts";
import { condText, parseCond } from "../../src/template/cond.ts";
import type { Cond } from "../../src/ir/index.ts";

const liquid = new Liquid();
// Some ESP helpers coerce both sides to strings; a plain === helper is the other end
const engineWith = (same: (a: unknown, b: unknown) => boolean) => {
  const e = Handlebars.create();
  for (const [name, yes] of [["equals", true], ["notEquals", false]] as const) {
    e.registerHelper(name, function (this: unknown, a: unknown, b: unknown, o: Handlebars.HelperOptions) {
      return same(a, b) === yes ? o.fn(this) : o.inverse(this);
    });
  }
  return e;
};
const strict = engineWith((a, b) => a === b);
const coercing = engineWith((a, b) => String(a) === String(b));

const page = (test: string) => `<div><p data-email-if="${test}" style="margin:0">YES</p><p data-email-else style="margin:0">NO</p></div>`;
const template = (test: string, d: "handlebars" | "liquid") => {
  const r = compile(page(test), { template: d, strict: true });
  expect(r.diagnostics.filter((x) => x.severity === "error")).toEqual([]);
  return r.html;
};
const verdict = (html: string) => (html.includes("YES") ? "YES" : "NO");
const hb = (test: string, data: object, engine = strict) => verdict(engine.compile(template(test, "handlebars"))(data));
const lq = (test: string, data: object) => verdict(liquid.parseAndRenderSync(template(test, "liquid"), data));
const pv = (test: string, data: Record<string, unknown>, dialects?: readonly ("handlebars" | "liquid")[]) => verdict(preview(page(test), data, dialects ? { dialects } : {}));

describe("a path test follows JS truthiness", () => {
  test.each([
    [0, "NO"],
    [1, "YES"],
    ["", "NO"],
    ["0", "YES"],
    [false, "NO"],
    [true, "YES"],
  ])("order.qty = %j is %s", (qty, want) => {
    const data = { order: { qty } };
    expect(lq("order.qty", data)).toBe(want);
    expect(hb("order.qty", data)).toBe(want);
    expect(pv("order.qty", data)).toBe(want);
  });

  // an empty list is true in JS and in Liquid; Handlebars counts it false, so it is a data need there
  test("an empty list is true, as in JS; for Handlebars it is a data error", () => {
    const data = { order: { qty: [] } };
    expect(lq("order.qty", data)).toBe("YES");
    expect(pv("order.qty", data, ["liquid"])).toBe("YES");
    expect(hb("order.qty", data)).toBe("NO");
    expect(() => pv("order.qty", data, ["handlebars"])).toThrow(/order\.qty is \[\]; the handlebars template needs anything but an empty list/);
  });

  // inside an or the test becomes a tddr-N flag; zero in any spelling must stay false there
  test.each([
    [0, "NO"],
    [0.0, "NO"],
    ["0", "YES"],
    ["0.0", "YES"],
    [1, "YES"],
    ["", "NO"],
  ])("order.qty = %j through an or chain is %s", (qty, want) => {
    const data = { order: { qty, other: false } };
    const html = template("order.qty || order.other", "liquid");
    expect(html).toContain("tddr-");
    expect(verdict(liquid.parseAndRenderSync(html, data))).toBe(want);
    expect(hb("order.qty || order.other", data)).toBe(want);
    expect(pv("order.qty || order.other", data)).toBe(want);
  });

  test("Liquid writes 0 and the empty string into the test", () => {
    expect(template("order.qty", "liquid")).toContain('order.qty and order.qty != 0 and order.qty != ""');
  });

  test("a missing field is false", () => {
    expect(lq("order.qty", {})).toBe("NO");
    expect(hb("order.qty", {})).toBe("NO");
  });
});

describe("a number literal compares as a number", () => {
  test("it is written unquoted", () => {
    expect(template("order.n == 1", "liquid")).toContain("{% if order.n == 1 %}");
    expect(template("order.n == 1", "handlebars")).toContain("{{#equals order.n 1}}");
    expect(template("order.n != 2.5", "liquid")).toContain("order.n != 2.5");
    expect(template("order.n == -1", "handlebars")).toContain("{{#equals order.n -1}}");
  });

  test.each([
    [1, "YES"],
    [2, "NO"],
    [0, "NO"],
  ])("number data %j", (n, want) => {
    const data = { order: { n } };
    expect(lq("order.n == 1", data)).toBe(want);
    expect(hb("order.n == 1", data)).toBe(want);
    expect(hb("order.n == 1", data, coercing)).toBe(want);
    expect(pv("order.n == 1", data)).toBe(want);
  });

  test("zero is a number too", () => {
    expect(lq("order.n == 0", { order: { n: 0 } })).toBe("YES");
    expect(hb("order.n == 0", { order: { n: 0 } })).toBe("YES");
  });

  // the helpers differ there, so the Handlebars template needs a number in the data
  test("the string '1' is not the number 1 in JS and Liquid; for Handlebars it is a data error", () => {
    const data = { order: { n: "1" } };
    expect(lq("order.n == 1", data)).toBe("NO");
    expect(pv("order.n == 1", data, ["liquid"])).toBe("NO");
    expect(hb("order.n == 1", data)).toBe("NO");
    expect(hb("order.n == 1", data, coercing)).toBe("YES");
    expect(() => pv("order.n == 1", data)).toThrow(/order\.n is "1"; the handlebars template needs a number, null or missing/);
  });

  test("a quoted number stays a string", () => {
    expect(lq("order.n == '1'", { order: { n: "1" } })).toBe("YES");
    expect(lq("order.n == '1'", { order: { n: 1 } })).toBe("NO");
  });

  test("the condition text round-trips", () => {
    for (const s of ["n == 1", "n != -2.5", "n == 0"]) expect(condText(parseCond(s, "t") as Cond)).toBe(s);
  });

  test("a number that would lose digits is not written", () => {
    for (const n of ["12345678901234567890", "9007199254740993", "0.12345678901234567890"]) {
      const c = parseCond(`order.id == ${n}`, "t") as { message: string; hint: string };
      expect(c.message, n).toMatch(/too large|exactly/);
      expect(c.hint, n).toMatch(/quoted string/);
    }
    expect(parseCond("order.id == 9007199254740991", "t")).toMatchObject({ op: "==" });
    expect(condText(parseCond("n == 2.50", "t") as Cond)).toBe("n == 2.5");
  });

  test("a number on the left or alone is not a condition", () => {
    expect((parseCond("1 == n", "t") as { message: string }).message).toMatch(/left/);
    expect((parseCond("1", "t") as { message: string }).message).toMatch(/data path/);
  });
});

describe("authoring operators", () => {
  const r = { roots: new Set<string>(), aliases: new Set<string>(), reserved: new Set<string>() };
  const p = T.rootProps(r).props as Record<string, any>;
  const text = (v: unknown) => T.condText(T.condOf(v));

  test("=== 1 records a number, === '1' a string", () => {
    expect(text(T.eq(p.order.n, 1))).toBe("order.n == 1");
    expect(text(T.eq(p.order.n, "1"))).toBe("order.n == '1'");
    expect(text(T.ne(p.order.n, 1))).toBe("order.n != 1");
  });

  test("a number the markup can't hold is an error", () => {
    expect(() => T.eq(p.order.n, 1e21)).toThrow(/plain number/);
    expect(() => T.eq(p.order.n, NaN)).toThrow(/plain number/);
  });

  test("an integer past 2^53 is an error: it would be written rounded", () => {
    expect(() => T.eq(p.order.n, 12345678901234567890)).toThrow(/too large/);
    expect(() => T.ne(p.order.n, 2 ** 53)).toThrow(/quoted string/);
    expect(text(T.eq(p.order.n, Number.MAX_SAFE_INTEGER))).toBe("order.n == 9007199254740991");
  });

  test("=== true / false compares with the boolean", () => {
    expect(text(T.eq(p.order.paid, true))).toBe("order.paid == true");
    expect(text(T.eq(p.order.paid, false))).toBe("order.paid == false");
    expect(text(T.ne(p.order.paid, true))).toBe("order.paid != true");
  });

  test("true == field on the left is an error too; loose == with a boolean is one", () => {
    expect(() => T.looseEq(true, p.order.paid)).toThrow(/if \(order\.paid\)/);
    expect(() => T.looseNe(false, p.order.paid)).toThrow(/switch/);
    expect(() => T.looseEq(p.order.paid, true)).toThrow(/compare with === \(order\.paid === true\)/);
  });

  test("switch (true) { case field } is an error with a hint", () => {
    expect(() => T.eq(true, p.order.paid)).toThrow(/if \(order\.paid\)/);
    expect(() => T.ne(false, p.order.paid)).toThrow(/switch/);
  });
});

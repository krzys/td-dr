import { describe, expect, test } from "vitest";
import type { Cond } from "../../src/ir/index.ts";
import { condText, isProblem, normalize, parseCond } from "../../src/template/cond.ts";

const parsed = (src: string): Cond => {
  const c = parseCond(src, "x");
  if (isProblem(c)) throw new Error(c.message);
  return c;
};
const problem = (src: string) => {
  const c = parseCond(src, `data-email-if="${src}"`);
  if (!isProblem(c)) throw new Error(`parsed: ${condText(c)}`);
  return c;
};

describe("condition grammar", () => {
  test("paths and comparisons", () => {
    expect(parsed("order.paid")).toEqual({ op: "truthy", path: "order.paid" });
    expect(parsed("status == 'paid'")).toEqual({ op: "==", left: { path: "status" }, right: { literal: "paid" } });
    expect(parsed('status != "paid"')).toEqual({ op: "!=", left: { path: "status" }, right: { literal: "paid" } });
    expect(parsed("a.id == b.id")).toEqual({ op: "==", left: { path: "a.id" }, right: { path: "b.id" } });
  });

  test("! binds tighter than &&, && tighter than ||", () => {
    expect(condText(parsed("a || b && !c"))).toBe("a || b && !c");
    expect(parsed("a || b && !c")).toEqual({ op: "or", conds: [{ op: "truthy", path: "a" }, { op: "and", conds: [{ op: "truthy", path: "b" }, { op: "not", cond: { op: "truthy", path: "c" } }] }] });
    expect(condText(parsed("(a || b) && c"))).toBe("(a || b) && c");
    expect(condText(parsed("!(a && s == 'x')"))).toBe("!(a && s == 'x')");
  });

  test("the canonical text reads back to the same condition", () => {
    for (const src of ["a", "!a", "a && b && c", "(a || b) && (c || !d)", "!(a == 'x') || b != c.d", "((a))", "!!a"]) {
      const c = parsed(src);
      expect(parsed(condText(c)), src).toEqual(c);
    }
  });

  test("normalize pushes not down to paths and flattens", () => {
    expect(condText(normalize(parsed("!(a && (b || s == 'x'))")))).toBe("!a || !b && s != 'x'");
    expect(condText(normalize(parsed("(a && b) && c")))).toBe("a && b && c");
  });

  test("an invalid path keeps its old message, other mistakes say what is wrong", () => {
    expect(problem("order.items[0]").message).toBe(`data-email-if="order.items[0]" is not a data path`);
    expect(problem("a b").message).toMatch(/is not a data path/);
    expect(problem("a == nil").hint).toMatch(/p == null/);
    expect(problem("a == empty").hint).toMatch(/true, false, null/);
    expect(problem("true").message).toMatch(/not a data path/);
    expect(problem("items.length").hint).toMatch(/items.length != 0/);
    expect(problem("items.length == 2").message).toMatch(/compared with "2"/);
    expect(problem("a == items.length").hint).toMatch(/only tells whether it is empty/);
    expect(problem("a > 1").hint).toMatch(/only with == and !=/);
    expect(problem("a == 'x--y'").hint).toMatch(/can't hold quotes/);
    expect(problem("a === 'x'").hint).toMatch(/==/);
    expect(problem("a &&").message).toMatch(/ends too early/);
    expect(problem("(a || b").message).toMatch(/isn't closed/);
    expect(problem("'x'").message).toMatch(/string or number alone/);
    expect(problem("'x' == a").message).toMatch(/left/);
    expect(problem("a & b").hint).toMatch(/&&/);
    expect(problem("").message).toMatch(/empty/);
  });
});

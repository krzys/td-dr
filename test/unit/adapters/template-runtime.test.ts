import { describe, expect, it, vi } from "vitest";
import * as T from "../../../adapters/template/index.ts";
import { FIELD_CLOSE, FIELD_OPEN } from "../../../src/template/tokens.ts";

const fresh = () => {
  const r = { roots: new Set<string>(), aliases: new Set<string>(), reserved: new Set<string>() };
  return { r, p: T.rootProps(r).props as Record<string, any> };
};
const f = (path: string) => `${FIELD_OPEN}${path}${FIELD_CLOSE}`;
// a branch or loop as the elements it renders, nothing rendered for what React renders as nothing
const REACT = (x: unknown) => x == null || typeof x === "boolean" || x === "";
// and for what Vue's text renders as nothing (it prints false and 0)
const VUE = (x: unknown) => x == null || x === "";
const shape = (v: unknown, empty = REACT): unknown => {
  const info = T.infoOf(v);
  if (info) return `{${info.path}}`;
  const parts = T.blockParts(v, empty);
  if (!parts) return v;
  return parts.map((x) => [x.tag, x.attrs, shape(x.value, empty)]);
};
const message = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error("did not throw");
};

const PLAIN = [0, 1, -1, "", "a", null, undefined, NaN, true, false, [], {}, 2n];

describe("branch values collapse and refuse", () => {
  it("plain equal arms are the value itself", () => {
    const { p } = fresh();
    expect(T.cond(p.order.paid, () => "a", () => "a")).toBe("a");
    expect(T.isBranch(T.cond(p.order.paid, () => "a", () => "b"))).toBe(true);
  });
  it("in / hasOwn on a branch are errors, probes stay quiet", () => {
    const { p } = fresh();
    const b = T.cond(p.order.paid, () => ({ x: 1 }), () => ({ x: 2 }));
    expect(message(() => "x" in (b as object))).toMatch(/is tested for a key/);
    expect(message(() => Object.hasOwn(b as object, "x"))).toMatch(/is tested for a key/);
    expect("$$typeof" in (b as object)).toBe(false);
    expect(T.isBranch(b)).toBe(true);
  });
  it("calling a branch of functions is a TemplateError", () => {
    const { p } = fresh();
    const b = T.cond(p.order.paid, () => (n: number) => n, () => (n: number) => n + 1) as unknown as (n: number) => number;
    expect(T.isBranch(b)).toBe(true);
    expect(message(() => b(1))).toMatch(/a value that depends on order\.paid: is called as a function/);
  });
});

describe("operators on plain values are the JS operators", () => {
  it.each(PLAIN.flatMap((a) => PLAIN.map((b) => [a, b])))("%o, %o", (a, b) => {
    const x = a as any;
    const y = b as any;
    const thunk = vi.fn(() => y);
    expect(T.and(x, thunk)).toBe(x && y);
    expect(thunk).toHaveBeenCalledTimes(x ? 1 : 0);
    const orThunk = vi.fn(() => y);
    expect(T.or(x, orThunk)).toBe(x || y);
    expect(orThunk).toHaveBeenCalledTimes(x ? 0 : 1);
    const nullThunk = vi.fn(() => y);
    expect(T.nullish(x, nullThunk)).toBe(x ?? y);
    expect(nullThunk).toHaveBeenCalledTimes(x == null ? 1 : 0);
    const other = vi.fn(() => "other");
    const then = vi.fn(() => y);
    expect(T.cond(x, then, other)).toBe(x ? y : "other");
    expect([then.mock.calls.length, other.mock.calls.length]).toEqual(x ? [1, 0] : [0, 1]);
    expect(T.condAll(x, () => [y, 1], () => ["other", 2])).toEqual(x ? [y, 1] : ["other", 2]);
    expect(T.not(x)).toBe(!x);
    expect(T.eq(x, y)).toBe(x === y);
    expect(T.ne(x, y)).toBe(x !== y);
    expect(T.looseEq(x, y)).toBe(x == y);
    expect(T.looseNe(x, y)).toBe(x != y);
    const mixed = typeof x === "bigint" || typeof y === "bigint";
    if (!mixed || (typeof x === "bigint" && typeof y === "bigint")) {
      expect(T.add(x, y)).toEqual(x + y);
    }
    if (!(typeof x === "bigint" && typeof y === "symbol")) {
      expect(T.lt(x, y)).toBe(x < y);
      expect(T.gt(x, y)).toBe(x > y);
      expect(T.le(x, y)).toBe(x <= y);
      expect(T.ge(x, y)).toBe(x >= y);
    }
    expect(T.test(x)).toBe(x);
    expect(T.switchOn(x)).toBe(x);
    expect(T.typeOf(x)).toBe(typeof x);
  });

  it("throws what the operator throws", () => {
    expect(() => T.add(1n, 1)).toThrow(TypeError);
  });
});

describe("symbolic values", () => {
  it("print as fields, as text, in template strings and as deeper paths", () => {
    const { p, r } = fresh();
    expect(String(p.order.total)).toBe(f("order.total"));
    expect(`Total: ${p.order.total}`).toBe(`Total: ${f("order.total")}`);
    expect(T.add("#", p.order.id)).toBe(`#${f("order.id")}`);
    expect(T.add(p.order.id, "!")).toBe(`${f("order.id")}!`);
    expect([...r.roots]).toEqual(["order"]);
  });

  it("read as missing where frameworks probe objects", () => {
    const { p } = fresh();
    expect(p.order.then).toBeUndefined();
    expect(p.order.$$typeof).toBeUndefined();
    expect(p.order.__v_isRef).toBeUndefined();
    expect(p.children).toBeUndefined();
    expect(p.key).toBeUndefined();
    expect(T.isSymbolic(p.order)).toBe(true);
    expect(T.isSymbolic({})).toBe(false);
  });

  it("record ?: as an if / else, and a nested ?: as else-if", () => {
    const { p } = fresh();
    const v = T.cond(T.eq(p.order.status, "paid"), () => "Paid", () => T.cond(p.order.due, () => "Due", () => "Open"));
    expect(shape(v)).toEqual([
      ["tddr-if", { test: "order.status == 'paid'" }, "Paid"],
      ["tddr-else-if", { test: "order.due" }, "Due"],
      ["tddr-else", {}, "Open"],
    ]);
  });

  it("record a && b as an if alone, a || b as the field or the fallback", () => {
    const { p } = fresh();
    // a falsy note is the value: React shows nothing for it but "0" for 0, a data need; Vue prints it
    expect(shape(T.and(p.note, () => "x"))).toEqual([["tddr-if", { test: "note", "prints-zero": "note" }, "x"]]);
    expect(shape(T.and(p.note, () => "x"), VUE)).toEqual([
      ["tddr-if", { test: "note" }, "x"],
      ["tddr-else", {}, "{note}"],
    ]);
    expect(shape(T.and(p.note, () => null))).toEqual([["tddr-if", { test: "note", "prints-zero": "note" }, undefined]]);
    expect(shape(T.or(p.note, () => "none"))).toEqual([
      ["tddr-if", { test: "note" }, "{note}"],
      ["tddr-else", {}, "none"],
    ]);
    // ?? falls back for null or missing only, as in JS (|| also for "", 0 and false)
    expect(shape(T.nullish(p.note, () => "none"))).toEqual([
      ["tddr-if", { test: "note != null" }, "{note}"],
      ["tddr-else", {}, "none"],
    ]);
  });

  it("leave out arms that render nothing, guarding the ones after them", () => {
    const { p } = fresh();
    expect(shape(T.cond(p.a, () => null, () => "x"))).toEqual([["tddr-if", { test: "!a" }, "x"]]);
    expect(shape(T.cond(p.a, () => "x", () => T.cond(p.b, () => null, () => "y")))).toEqual([
      ["tddr-if", { test: "a" }, "x"],
      ["tddr-else-if", { test: "!b" }, "y"],
    ]);
    expect(T.cond(p.a, () => null, () => null)).toBeNull();
  });

  it("evaluate both arms and take the JS path once a test is constant", () => {
    const { p } = fresh();
    const named = T.or(p.name, () => "Customer"); // always truthy
    expect(T.cond(named, () => "yes", () => "no")).toBe("yes");
    expect(T.not(named)).toBe(false);
    expect(T.and(T.and(p.a, () => 0), () => "never")).not.toBe("never");
  });

  it("write conditions in the condition grammar", () => {
    const { p } = fresh();
    const text = (v: unknown) => T.condText(T.condOf(v));
    expect(text(T.and(T.not(p.a), () => T.or(p.b, () => T.ne(p.c, p.d))))).toBe("!a && (b || c != d)");
    expect(text(T.or(T.and(p.a, () => p.b), () => p.c))).toBe("a && b || c");
    expect(text(T.not(T.and(p.a, () => p.b)))).toBe("!(a && b)");
    expect(text(T.ne(p.status, "x"))).toBe("status != 'x'");
    expect(text(T.not(T.eq(p.status, "x")))).toBe("status != 'x'");
    expect(text(T.eq("x", p.status))).toBe("status == 'x'");
    expect(text(T.eq(p.count, 3))).toBe("count == 3");
    expect(text(T.eq(p.a.b, p.c))).toBe("a.b == c");
    expect(text(T.eq(p.flag, true))).toBe("flag == true");
    expect(text(T.ne(p.flag, false))).toBe("flag != false");
    expect(text(T.looseNe(p.discount, null))).toBe("discount != null");
    expect(text(T.looseEq(p.discount, undefined))).toBe("discount == null");
    expect(text(T.not(T.not(p.a)))).toBe("a");
  });

  it("test a list's length only for emptiness", () => {
    const { p } = fresh();
    const text = (v: unknown) => T.condText(T.condOf(v));
    expect(text(T.gt(p.items.length, 0))).toBe("items.length != 0");
    expect(text(T.ge(p.items.length, 1))).toBe("items.length != 0");
    expect(text(T.lt(0, p.items.length))).toBe("items.length != 0");
    expect(text(T.le(1, p.items.length))).toBe("items.length != 0");
    expect(text(T.eq(p.items.length, 0))).toBe("items.length == 0");
    expect(text(T.looseEq(p.items.length, 0))).toBe("items.length == 0");
    expect(text(T.lt(p.items.length, 1))).toBe("items.length == 0");
    expect(text(T.le(p.items.length, 0))).toBe("items.length == 0");
    expect(text(T.ne(p.items.length, 0))).toBe("items.length != 0");
    expect(text(p.items.length)).toBe("items.length != 0");
    expect(text(T.not(p.items.length))).toBe("items.length == 0");
    expect(() => T.eq(p.items.length, 2)).toThrow(/only knows whether a list is empty/);
    expect(() => T.gt(p.items.length, 1)).toThrow(/compared with >/);
  });

  it("map a list into an each block named after the callback's parameter", () => {
    const { p } = fresh();
    const each = p.order.items.map((line: any) => T.and(line.discount, () => `-${line.discount}`)) as T.Each;
    expect(shape(each)).toEqual([["tddr-each", { of: "order.items", as: "line" }, [["tddr-if", { test: "line.discount", "prints-zero": "line.discount" }, `-${f("line.discount")}`]]]]);
  });

  it("names loops clear of the loops around them, and `item` when the parameter has no name", () => {
    const { p } = fresh();
    const outer = p.groups.map((item: any) => item.items.map((item: any) => item.name)) as T.Each;
    const inner = outer.body as T.Each;
    expect([outer.as, inner.as, inner.of]).toEqual(["item", "item2", "item.items"]);
    expect(String(inner.body)).toBe(f("item2.name"));
    const destructured = p.items.map(({ name }: any) => name) as T.Each;
    expect([destructured.as, String(destructured.body)]).toEqual(["item", f("item.name")]);
  });

  it("maps a filtered list as an each with an if inside", () => {
    const { p } = fresh();
    const each = p.items.filter((i: any) => i.shipped).map((line: any) => line.name);
    expect(shape(each)).toEqual([["tddr-each", { of: "items", as: "line" }, [["tddr-if", { test: "line.shipped" }, "{line.name}"]]]]);
  });

  it("renders again when a loop variable would hide a root field", async () => {
    const runs: string[] = [];
    const out = await T.renderSymbolic((r) => {
      const p = T.rootProps(r).props as any;
      const each = p.orders.map((order: any) => order.id) as T.Each;
      const text = `${p.order.title} ${each.as}`;
      runs.push(text);
      return text;
    });
    expect(runs).toHaveLength(2);
    expect(out).toBe(`${f("order.title")} order2`);
  });

  it("chains If / ElseIf / Else arms like a nested ?:", () => {
    const { p } = fresh();
    expect(shape(T.chain([[p.a, () => "A"], [p.b, () => "B"]], () => "C"))).toEqual([
      ["tddr-if", { test: "a" }, "A"],
      ["tddr-else-if", { test: "b" }, "B"],
      ["tddr-else", {}, "C"],
    ]);
    expect(T.chain([[false, () => "A"], [1, () => "B"]], () => "C")).toBe("B");
    expect(T.chain([[0, () => "A"]])).toBeUndefined();
  });

  it("writes a statement if's arms to a stream as blocks", () => {
    const { p } = fresh();
    const run = (arms: Array<[() => unknown, string]>, otherwise?: string, placeholder = false) => {
      const out: string[] = [];
      const push = (s: string) => out.push(s);
      T.pushIf(push, arms.map(([t, s]) => [t, () => push(s)]), otherwise === undefined ? null : () => push(otherwise), placeholder);
      return out.join("");
    };
    expect(run([[() => p.a, "A"], [() => T.eq(p.s, "x"), "X"]], "Z")).toBe(
      `<tddr-if test="a">A</tddr-if><tddr-else-if test="s == 'x'">X</tddr-else-if><tddr-else>Z</tddr-else>`,
    );
    expect(run([[() => p.a, "A"]], "<!--v-if-->", true)).toBe(`<tddr-if test="a">A</tddr-if>`);
    expect(run([[() => p.a, "A"], [() => true, "T"]], "Z")).toBe(`<tddr-if test="a">A</tddr-if><tddr-else>T</tddr-else>`);
    const later = vi.fn(() => true);
    expect(run([[() => 0, "A"], [() => 1, "B"], [later, "C"]], "Z")).toBe("B");
    expect(later).not.toHaveBeenCalled();
    expect(run([[() => 0, "A"]], "<!--v-if-->", true)).toBe("<!--v-if-->");
  });
});

describe("statement control flow as values", () => {
  it("guards tests in order and only as far as JS would", () => {
    const later = vi.fn(() => true);
    expect(T.guards([[() => 0, () => "A"], [() => 1, () => "B"], [later, () => "C"]], () => "Z")).toBe("B");
    expect(later).not.toHaveBeenCalled();
    expect(T.guards([[() => 0, () => "A"]])).toBeUndefined();
    expect(T.guards([], () => "Z")).toBe("Z");
  });

  it("record guard clauses like a ?: chain", () => {
    const { p } = fresh();
    const v = T.guards([[() => T.not(p.order), () => null], [() => T.eq(p.order.status, "paid"), () => "Paid"]], () => "Open");
    const same = T.cond(T.not(p.order), () => null, () => T.cond(T.eq(p.order.status, "paid"), () => "Paid", () => "Open"));
    expect(shape(v)).toEqual(shape(same));
    expect(shape(v)).toEqual([
      ["tddr-if", { test: "order && order.status == 'paid'" }, "Paid"],
      ["tddr-else-if", { test: "order" }, "Open"],
    ]);
  });

  it("pick is an else-if chain of eq tests; default is the else wherever it stands", () => {
    const { p } = fresh();
    const v = T.pick(p.kind, (d) => [[() => T.or(T.eq(d, "a"), () => T.eq(d, "b")), () => "AB"], [null, () => "other"], [() => T.eq(d, "c"), () => "C"]]);
    expect(shape(v)).toEqual([
      ["tddr-if", { test: "kind == 'a' || kind == 'b'" }, "AB"],
      ["tddr-else-if", { test: "kind == 'c'" }, "C"],
      ["tddr-else", {}, "other"],
    ]);
    expect(T.pick("c", (d) => [[() => T.eq(d, "a"), () => 1], [() => T.eq(d, "c"), () => 3]], () => 9)).toBe(3);
    expect(T.pick("z", (d) => [[() => T.eq(d, "a"), () => 1]], () => 9)).toBe(9);
  });

  it("guardsAll gives each variable its own branch, keeping the old value where an arm leaves it", () => {
    const { p } = fresh();
    const [x, y] = T.guardsAll([[() => p.a, () => ["x1", "y1"]], [() => p.b, () => ["x2", "y"]]], () => ["x0", "y"]) as unknown[];
    expect(shape(x)).toEqual([
      ["tddr-if", { test: "a" }, "x1"],
      ["tddr-else-if", { test: "b" }, "x2"],
      ["tddr-else", {}, "x0"],
    ]);
    expect(shape(y)).toEqual([
      ["tddr-if", { test: "a" }, "y1"],
      ["tddr-else", {}, "y"],
    ]);
    expect(T.guardsAll([[() => 1, () => [1, 2]]], () => [3, 4])).toEqual([1, 2]);
  });
});

describe("what a template can't do with a field", () => {
  const { p } = fresh();
  const cases: Array<[string, () => unknown, RegExp]> = [
    ["arithmetic", () => p.order.total * 2, /^order\.total: is used as a number.*\nHint: send the value ready/s],
    ["+ with a number", () => T.add(p.order.total, 1), /^order\.total: is used in arithmetic \(\+\)/],
    ["+ of two fields", () => T.add(p.a, p.b), /^a \+ b: adds two template fields/],
    ["number formatting", () => new Intl.NumberFormat("en-US").format(p.order.total), /^order\.total: is used as a number/],
    ["a number method", () => p.order.total.toFixed(2), /^order\.total\.toFixed\(\): calls a method on a template field/],
    ["a string method", () => p.name.toUpperCase(), /^name\.toUpperCase\(\): calls a method/],
    ["sorting", () => p.items.sort(), /^items\.sort\(\): calls a method/],
    ["reduce", () => p.items.reduce((n: number) => n, 0), /^items\.reduce\(\): calls a method/],
    ["<", () => T.lt(p.order.total, 50), /^order\.total: is compared with <; the dialects compare fields only for equality/],
    ["a length compared with 3", () => T.gt(p.items.length, 3), /^items\.length: is compared with >/],
    ["printing a length", () => String(p.items.length), /^items\.length: a list's length can't be printed/],
    ["a statement if", () => T.test(p.order.paid), /^order\.paid: decides a statement.*\nHint: .*or branch in the markup/s],
    ["a switch", () => T.switchOn(p.order.status), /^order\.status: decides a switch.*\nHint: .*return from every case/s],
    ["a loop test", () => T.test(p.order.paid, "loop"), /^order\.paid: is the test of a loop.*\nHint: loop over a list with \.map/s],
    ["a branch with effects", () => T.test(p.order.paid, "effects"), /^order\.paid: decides a branch that does more than return or assign a variable.*\nHint: return the value from each branch/s],
    ["a break in a branch", () => T.test(p.order.paid, "jump"), /^order\.paid: decides a break or continue/],
    ["a return in a loop", () => T.test(p.order.paid, "loopReturn"), /^order\.paid: decides a return inside a loop.*\nHint: \.map over the list/s],
    ["a return in try", () => T.test(p.order.paid, "tryReturn"), /^order\.paid: decides a return inside try \/ catch/],
    ["a break-terminated case", () => T.switchOn(p.order.status, "break"), /^order\.status: decides a switch whose case ends in break.*\nHint: end every case with return/s],
    ["a fall-through case", () => T.switchOn(p.order.status, "fall"), /^order\.status: decides a switch where a case falls through/],
    ["typeof", () => T.typeOf(p.order.total), /^order\.total: is checked with typeof/],
    ["the loop index", () => p.items.map((line: unknown, i: any) => T.eq(i, 0)), /^the index of line: a loop position isn't available/],
    ["spreading a field", () => ({ ...p.order }), /^order: is spread or its keys are listed/],
    ["iterating a field", () => [...p.items], /^items: is iterated/],
    ["an item by position", () => p.items[0], /^items\[0\]: picks a list item by position/],
    ["a literal with a quote", () => T.eq(p.name, `O'Hara`), /^name: is compared with "O'Hara", which holds "'"/],
    ["a branch in a string", () => `${T.cond(p.paid, () => "a", () => "b") as string}`, /^a value that depends on paid: is turned into text/],
    ["comparing a branch", () => T.eq(T.or(p.a, () => "x"), "x"), /^a value that depends on a: is compared/],
    ["assigning to a field", () => (p.order.total = 1), /^order\.total: is assigned to/],
    ["a filter not mapped", () => p.items.filter(() => true).length, /^items\.filter\(…\)\.length: is not available/],
  ];
  it.each(cases)("%s", (_name, fn, expected) => {
    expect(message(fn)).toMatch(expected);
  });

  it("points at the line that did it", () => {
    expect(message(() => p.order.total * 2)).toMatch(/\n {4}at .*template-runtime\.test\.ts:\d+:\d+$/);
  });

  it("spreading the root props once armed", () => {
    const r = { roots: new Set<string>(), aliases: new Set<string>(), reserved: new Set<string>() };
    const { props, arm } = T.rootProps(r);
    expect({ ...props }).toEqual({});
    arm();
    expect(message(() => ({ ...props }))).toMatch(/^the email's props: are spread/);
  });
});

describe("branch values", () => {
  const paid = () => T.cond(fresh().p.order.paid, () => ({ color: "green", n: 1 }), () => ({ color: "gray", n: 1 }));
  it("a property is a branch of the arms' properties; equal plain ones collapse", () => {
    const b = paid() as any;
    expect(T.isBranch(b.color)).toBe(true);
    expect(b.color.$arms.map((a: any) => a.value)).toEqual(["green"]);
    expect(b.color.$otherwise).toBe("gray");
    expect(b.n).toBe(1);
    expect(b.missing).toBeUndefined();
  });
  it("an arm's own keys named like the branch's parts are properties", () => {
    const b = T.cond(fresh().p.order.paid, () => ({ test: "a", arms: "b" }), () => ({ test: "c", arms: "d" })) as any;
    expect(T.isBranch(b.test)).toBe(true);
    expect(b.arms.$otherwise).toBe("d");
  });
  it("a symbolic field inside an arm stays symbolic", () => {
    const { p } = fresh();
    const b = T.cond(p.order.paid, () => ({ who: p.a }), () => ({ who: "x" })) as any;
    expect(T.infoOf(b.who.$arms[0].value)?.path).toBe("a");
  });
  it("methods, iteration, JSON and numbers throw template errors", () => {
    const b = paid() as any;
    expect(message(() => b.color.toUpperCase())).toMatch(/depends on order\.paid: has \.toUpperCase\(\) called on it/);
    expect(message(() => [...b])).toMatch(/is iterated/);
    expect(message(() => JSON.stringify(b))).toMatch(/serialized \(JSON\)/);
    expect(message(() => b.color * 2)).toMatch(/is used as a number/);
    expect(message(() => `${b.color}`)).toMatch(/is turned into text/);
  });
});

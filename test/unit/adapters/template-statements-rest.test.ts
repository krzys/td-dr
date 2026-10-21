import { describe, expect, it } from "vitest";
import * as runtime from "../../../adapters/template/index.ts";
import { REASONS } from "../../../adapters/template/classify.ts";
import { rewrite } from "../../../adapters/template/transform.ts";

const IMPORT = 'import * as __tddr from "tddr:template";';
const out = (code: string) => {
  const r = rewrite(code, "/m.js");
  return r ? r.code.slice(IMPORT.length) : code;
};
const make = (body: string, rewritten: boolean) => {
  const fn = `(function (a0, a1, a2) {\n${body}\n});`;
  return new Function("__tddr", `return ${rewritten ? out(fn) : fn}`)(runtime) as (...a: unknown[]) => unknown;
};
const same = (body: string, ...args: unknown[]) => {
  const run = (f: (...a: unknown[]) => unknown) => {
    try {
      return JSON.stringify(f(...structuredClone(args)));
    } catch (e) {
      return `throws ${(e as Error).name}`;
    }
  };
  expect(run(make(body, true)), `${body} with ${JSON.stringify(args)}`).toEqual(run(make(body, false)));
};

// the body with a0 a template field, a1 a list and a2 a counter object; what it throws, or how many effects ran
const onField = async (body: string) => {
  const hits = { rows: [] as unknown[], log: 0, o: { count: 0, inc() { hits.log++; } } };
  const f = make(body, true);
  const result = await runtime
    .renderSymbolic((r) => f(runtime.fieldOf(r, "vip"), hits.rows, hits.o))
    .then(() => "ok", (e: Error) => e.message);
  return { result, hits };
};

describe("a rest that does more than declare and return", () => {
  it.each([
    ["push on a param", "if (a0) return; a1.push('row');"],
    ["a dropped call", "if (a0) return 1; a2.inc(); return 2;"],
    ["a member assignment", "if (a0) return 1; a2.count = 1; return 2;"],
    ["+= on a param", "if (a0) return 1; a1 += 1; return 2;"],
    ["a no-default switch", "switch (a0) { case 1: return 'a'; case 2: return 'b'; } a1.push('row'); return 'c';"],
  ])("%s keeps the error", async (_, body) => {
    expect(out(`(function (a0, a1, a2) { ${body} })`)).toMatch(/__tddr\.(test|switchOn)\((__tddr_s0 = )?a0/);
    const { result, hits } = await onField(body);
    expect(result).toMatch(/vip: .*\nHint:/s);
    expect(hits.rows).toEqual([]);
    expect(hits.log).toBe(0);
    expect(hits.o.count).toBe(0);
  });

  it("names the code after the if", () => {
    expect(out("function f(a0, a1) { if (a0) return 1; a1.push(2); return 3; }")).toContain('__tddr.test(a0, "midReturn")');
  });

  it("still moves declarations, functions and a nested branch", () => {
    for (const body of [
      "if (a0) return 1; const t = 2; return t;",
      "if (a0) return 1; return h(); function h() { return 9; }",
      "if (a0) return 1; const f = () => a1.push(1); return typeof f;",
      "if (a0) return 1; if (a1) return 2; return 3;",
    ]) expect(out(`function f(a0, a1) { ${body} }`)).toContain("guards(");
  });

  it("does not move a local list built with a loop (the loop is an effect)", () => {
    const src = "function f(a0, a1) { if (a0) return []; const rows = []; for (const i of a1) rows.push(i); return rows; }";
    expect(out(src)).not.toContain("guards(");
    same("if (a0) return []; const rows = []; for (const i of a1) rows.push(i); return rows;", 0, [1, 2]);
    same("if (a0) return []; const rows = []; for (const i of a1) rows.push(i); return rows;", 1, [1, 2]);
  });
});

describe("branch-assigned variables and closures", () => {
  it("runs as the ifs did when a closure outside the if sees the targets", () => {
    const cases: Array<[string, ...unknown[][]]> = [
      ["let v = 1, w = 0; const get = () => v; if (a0) { v = 2; w = get(); } return [v, w];", [1], [0]],
      ["let v = 1, w = 0; if (a0) { v = 2; w = get(); } function get() { return v; } return [v, w];", [1], [0]],
      ["let v = 1, w = 0; const inc = () => ++v; if (a0) { v = 10; w = inc(); } return [v, w];", [1], [0]],
      ["let v = 1, w = 0; const get = () => v; if (a0) { v = 2; } else { w = get(); } return [v, w];", [1], [0]],
    ];
    for (const [body, ...argSets] of cases) for (const args of argSets) same(body, ...args);
  });

  it("leaves the two-variable form alone when any function in the body mentions a target", () => {
    expect(out("function f(a0) { let v = 1, w = 0; const get = () => v; if (a0) { v = 2; w = get(); } return [v, w]; }")).toContain('"closure"');
    expect(out("function f(a0) { let v = 1, w = 0; if (a0) { v = 2; w = 3; } return [v, w]; }")).toContain("guardsAll(");
  });
});

describe("try with a returning finally", () => {
  it("is a plain try on plain values", () => {
    same("try { if (a0) return 1; } catch (e) {} finally { return 2; }", 1);
  });
});

describe("a switch that cannot be a value says why", () => {
  it("names the loop or the try", () => {
    const sw = "switch (x.a) { case 1: return 1; default: return 2; }";
    expect(out(`function f(a1) { for (const x of a1) { ${sw} } }`)).toContain('__tddr.switchOn(__tddr_s0 = x.a, "loopReturn")');
    expect(out(`function f(a1, x) { try { ${sw.replace("x.a", "x")} } catch (e) {} }`)).toContain('__tddr.switchOn(__tddr_s0 = x, "tryReturn")');
    expect(out(`function f(x) { { ${sw.replace("x.a", "x")} } }`)).toContain('__tddr.switchOn(__tddr_s0 = x, "midReturn")');
  });

  it("gives the loop reason in the message", async () => {
    const f = make("for (const x of a1) { switch (x) { case 1: return 1; default: return 2; } }", true);
    const msg = await runtime.renderSymbolic((r) => {
      try {
        f(0, [runtime.fieldOf(r, "vip")]);
      } catch (e) {
        return (e as Error).message;
      }
      return "";
    });
    expect(msg).toMatch(/decides a return inside a loop/);
  });
});

describe("catch patterns with strings", () => {
  it("keeps a // inside a default string", () => {
    same("try { null.x; } catch ({ message, name: n = 'a //b' }) { return n.length > 0; }");
    same("try { null.x; } catch ({\n message, // note\n name: n = 'a //b'\n}) { return typeof n; }");
  });
});

describe("the reasons the rewrite gives the runtime", () => {
  it("each has its own wording in the error", async () => {
    const message = (fn: (field: unknown) => unknown) =>
      runtime.renderSymbolic((r) => {
        try {
          fn(runtime.fieldOf(r, "vip"));
        } catch (e) {
          return (e as Error).message;
        }
        return "";
      });
    const plain = await message((f) => runtime.test(f));
    const plainSwitch = await message((f) => runtime.switchOn(f));
    for (const why of REASONS) {
      const own = await message((f) => runtime.test(f, why));
      const ownSwitch = await message((f) => runtime.switchOn(f, why));
      expect(own === plain && ownSwitch === plainSwitch, why).toBe(false);
    }
  });

  it("keeps an `await using` where it is: an arrow can't hold it", () => {
    expect(out("async function f(a) { if (a) return 1; await using r = g(); return r.v; }")).toBe('async function f(a) { if (__tddr.test(a, "midReturn")) return 1; await using r = g(); return r.v; }');
  });
});

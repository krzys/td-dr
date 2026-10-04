import { describe, expect, it } from "vitest";
import * as runtime from "../../../adapters/template/index.ts";
import { rewrite } from "../../../adapters/template/transform.ts";

const IMPORT = 'import * as __tddr from "tddr:template";';
const out = (code: string) => {
  const r = rewrite(code, "/m.js");
  return r ? r.code.slice(IMPORT.length) : code;
};
const fn = (body: string) => `(function (a0, a1, a2) {\n${body}\n});`;
const make = (body: string, rewritten: boolean) => new Function("__tddr", `return ${rewritten ? out(fn(body)) : fn(body)}`)(runtime) as (...a: unknown[]) => unknown;
const result = (f: (...a: unknown[]) => unknown, args: unknown[], key: "name" | "message") => {
  try {
    return JSON.stringify(f(...structuredClone(args)));
  } catch (e) {
    return `throws ${(e as Error)[key]}`;
  }
};
// the rewritten body gives what the original gives, or throws what it throws
const same = (body: string, ...args: unknown[]) => expect(result(make(body, true), args, "name"), `${body} with ${JSON.stringify(args)}`).toEqual(result(make(body, false), args, "name"));
const sameMessage = (body: string, ...args: unknown[]) => expect(result(make(body, true), args, "message"), body).toEqual(result(make(body, false), args, "message"));

// the body with a0 a template field, a1 a list and a2 a counter object; what it throws, or how many effects ran
const onField = async (body: string) => {
  const hits = { rows: [] as unknown[], o: { count: 0 } };
  const f = make(body, true);
  const message = await runtime.renderSymbolic((r) => f(runtime.fieldOf(r, "vip"), hits.rows, hits.o)).then(() => "ok", (e: Error) => e.message);
  return { message, hits };
};

describe("an arm that changes something while it computes its value", () => {
  const cases: Array<[string, string]> = [
    ["a nested assignment", `let v = "v0", w = "w0"; if (a0) v = w = "w1"; return [v, w];`],
    ["push in an assigned value", `let v = "x"; if (a0) v = a1.push("r") && "y"; return [v, a1.length];`],
    ["++ in an assigned value", `let n = 0, v = "x"; if (a0) v = (n++, "y"); return [v, n];`],
    ["compound assignment in an assigned value", `let n = 0, v = "x"; if (a0) v = (n += 1, "y"); return [v, n];`],
    ["an assignment in a declaration", `let v = "a"; if (a0) { const z = (v = "q"); v = "b"; } return v;`],
    ["push in an early-return arm", `if (a0) return a1.push(1); return a1.length;`],
    ["splice in the code after an early return", `if (a0) return 1; const n = a1.splice(0, 1); return n;`],
    ["delete in an arm", `let v = 1; if (a0) v = delete a1.x; return [v, a1];`],
    ["-- in a switch arm", `let n = 3; switch (a0) { case "a": return n--; default: return n; }`],
    ["push in a ?: arm", `return a0 ? a1.push(1) : a1.length;`],
    ["push in an && arm", `return a0 && a1.push(1);`],
    ["push in an || arm", `return a0 || a1.push(1);`],
    ["push in an arm of a nested if", `if (a0) { if (a1.length === 0) return a1.push(1); return 2; } return 3;`],
    ["a callback that pushes to an outer list", `if (a0) return a1.forEach((x) => a2.push(x)); return a2.length;`],
    ["a callback that counts on an outer object", `let v = 1; if (a0) v = a1.map((x) => a2.count++); return [v, a2];`],
    ["a function expression callback that assigns an outer variable", `let n = 0; if (a0) return a1.map(function (x) { n += x; return n; }); return n;`],
    ["a callback inside a callback", `if (a0) return a1.map((x) => [x].map((y) => a2.count++)); return 1;`],
    ["a callback that counts on its parameter", `if (a0) return a1.map((x) => x.n++); return 1;`],
    ["a callback that increments before reading", `let v = 1; if (a0) v = a1.map((x) => ++x.n); else v = a1.map((x) => x.n); return v;`],
    ["a callback that sets a member of its parameter", `if (a0) return a1.forEach((x) => { x.seen = true; }); return 1;`],
    ["a callback that pushes to a list of its parameter", `if (a0) return a1.map((x) => x.list.push(1)); return 1;`],
    ["a callback that changes an alias of its parameter", `if (a0) return a1.map((x) => { const r = x; r.n++; return r; }); return 1;`],
    ["push on what .at() returns", `if (a0) return a2.list.at(0).push(1); return 1;`],
    ["push on a member of a copy", `if (a0) return a1.slice()[0].list.push(1); return 1;`],
    ["push on a member of Object.values", `if (a0) return Object.values(a2)[0].push(1); return 1;`],
    ["push on what a plain call returns", `const get = () => a1; if (a0) return get().push(1); return 1;`],
    ["push on a ?: of the same list", `if (a0) return (a1.length ? a1 : a1).push(1); return 1;`],
    ["a reduce seed a var points elsewhere", `if (a0) return a1.reduce((acc, x) => { var acc = a2; acc.n++; return acc; }, {}); return 0;`],
    ["a reduce seed a for-of points elsewhere", `if (a0) return a1.reduce((acc, x) => { for (acc of [a2]) acc.n++; return acc; }, {}); return 0;`],
    ["a fresh let a for-of points elsewhere", `if (a0) return a1.map((x) => { let r = []; for (r of [a2]) r.n++; return 1; }); return 1;`],
    ["a for-of that writes to a member", `if (a0) return a1.map((x) => { for (a2.k of [1]); return 1; }); return 1;`],
    ["a member of a fresh array in a callback", `let v = 1; if (a0) v = a1.map((x) => { const r = [x]; r[0].n++; return 1; }); return [v, a1];`],
    ["an outer name after an inner callback declared the same let", `let total = 0; if (a0) return a1.map((x) => { [0].forEach(() => { let total; }); total++; return 1; }); return total;`],
    ["a reduce that changes an accumulator it was handed", `if (a0) return a1.reduce((acc, x) => { acc.n++; return acc; }, a2); return 1;`],
    ["a reduce that reaches into a literal accumulator", `if (a0) return a1.reduce((acc, x) => { acc[0].n++; return acc; }, [{ n: 0 }]); return 1;`],
    ["a reduce that returns an outer value", `if (a0) return a1.reduce((acc, x) => { acc.push(x); return a2; }, []); return 1;`],
    ["a reduce whose concise body returns an element", `if (a0) return a1.reduce((acc, x) => (acc.push(x), x), []); return 1;`],
    ["a reduce that gives its accumulator an outer value", `if (a0) return a1.reduce((acc, x) => { acc = a2; acc.n++; return acc; }, {}); return 1;`],
    ["a block name that shadows an own fresh name with an outer value", `if (a0) return a1.map((x) => { const r = []; { let r = a2; r.push(1); } return 1; }); return 1;`],
    ["a caught value, which may be shared", `if (a0) return a1.map((x) => { try { return x; } catch (e) { e.k = 1; } return 1; }); return 1;`],
    ["a reduce with no initial value", `if (a0) return a1.reduce((acc, x) => { acc.push(x); return acc; }); return 1;`],
    ["a switch discriminant that changes an outer name a case let shadows", `if (a0) return a1.map((x) => { switch (a2.push(1)) { case 1: let a2 = []; } return 1; }); return 1;`],
    ["an outer name shadowed only in an inner block", `if (a0) return a1.map((x) => { { let a2 = 0; } a2.count++; return 1; }); return 1;`],
  ];

  it.each(cases)("%s is refused for a field, with the reason", async (_, body) => {
    expect(out(fn(body))).toMatch(/__tddr\.(test|switchOn)\((__tddr_s\d+ = )?a0, "armEffect"\)/);
    const { message, hits } = await onField(body);
    expect(message).toMatch(/^vip: decides a branch whose value changes something.*\nHint: compute the value without changing anything/s);
    expect(hits.rows).toEqual([]);
  });

  it.each(cases)("%s runs as written on plain values", (_, body) => {
    for (const args of [[0, [{ n: 1, list: [] }], { x: 1 }], [1, [], { x: 1 }], ["a", [{ n: 3, list: [] }], {}]]) same(body, ...args);
  });

  it("does not mind a copy, a call result or a function that isn't called", () => {
    for (const body of [
      "if (a0) return [...a1].sort(); return a1;",
      "if (a0) return a1.slice().reverse(); return a1;",
      "const f = () => a1.push(1); if (a0) return typeof f; return 2;",
      "let v = 1; if (a0) v = a1.map((x) => x + 1); return v;",
      "let v = 1; if (a0) v = a1.map((x) => { let s = 0; s += x; return s; }); return v;",
      "if (a0) return a1.map((x) => { const r = []; r.push(x); return r; }); return 1;",
      "if (a0) return a1.map((x, i) => { i++; return i; }); return 1;",
      "if (a0) return Object.keys(a2).sort(); return 1;",
      "if (a0) return Array.from(a1).sort(); return 1;",
      "if (a0) return a1.slice().sort().reverse(); return a1;",
      "if (a0) return a1.reduce((acc, x) => { acc[x] = 1; return acc; }, {}); return 0;",
      "if (a0) return new Array(2).fill(0); return 1;",
      "if (a0) return a1.reduce((acc, x) => { acc.push(x); return acc; }, []).length; return 0;",
      "if (a0) return a1.reduce((acc, x) => (acc.push(x), acc), []).length; return 0;",
      "if (a0) return a1.map((x) => { switch (x) { case 1: let q = []; q.push(x); } return 1; }); return 0;",
      "if (a0) return a1.map((x) => { try { return x; } catch (a2) { a2 = 1; } return 1; }); return 0;",
      "if (a0) return a1.reduceRight((acc, x) => { acc[x] = 1; return acc; }, {}); return 0;",
      "if (a0) return a1.map((x) => { if (true) { let q = []; q.push(x); } return 1; }); return 0;",
      "if (a0) return a1.map((x) => { for (const y of [1]) { let t = 0; t++; } return 1; }); return 0;",
      "if (a0) return a1.reduce((best, x) => { if (x.n > best.n) best = x; return best; }, { n: 0 }).n; return 0;",
      "if (a0) return a1.map((x) => { let r = []; if (x) r = x.items; return r.length; }); return 0;",
      "if (a0) return a1.map((x) => { for (let i = 0; i < 2; i++) { const r = {}; r.k = i; } return 1; }); return 0;",
    ]) {
      expect(out(fn(body))).not.toContain('"armEffect"');
      same(body, 1, [2, 1]);
      same(body, 0, [2, 1]);
    }
  });

  it("is not a Vue push or a plain ternary on a plain value", () => {
    same("return a0 ? a1.push(1) : a1.length;", 1, []);
    same("return a0 ? a1.push(1) : a1.length;", 0, [5]);
  });
});

describe("a braced case", () => {
  const guard = `switch (a0) { case "x": { if (a1) return 1; return 2; } default: return 3; }`;

  it("is the unbraced case", async () => {
    expect(out(fn(guard))).toContain("__tddr.pick(a0");
    expect(out(fn(guard))).not.toContain("switchOn");
    for (const args of [["x", 0], ["x", 1], ["y", 1]]) same(guard, ...args);
    expect((await onField(guard)).message).toBe("ok");
  });

  it("with code after the switch", () => {
    const body = `switch (a0) { case "x": { if (a1) return 1; return 2; } } const t = 5; return t;`;
    expect(out(fn(body))).toContain("__tddr.pick(a0");
    for (const args of [["x", 0], ["x", 1], ["y", 0]]) same(body, ...args);
  });

  it("with a const of the same name in each braced case", () => {
    const body = `switch (a0) { case "x": { const t = 1; return t; } case "y": { const t = 2; return t; } default: return 0; }`;
    expect(out(fn(body))).toContain("__tddr.pick(a0");
    for (const a of ["x", "y", "z"]) same(body, a);
  });

  it("with a branch-assigned let inside the braces", () => {
    const body = `switch (a0) { case "x": { let v = "a"; if (a1) v = "b"; return v; } default: return "z"; }`;
    expect(out(fn(body))).toContain("__tddr.pick(a0");
    for (const args of [["x", 0], ["x", 1], ["y", 1]]) same(body, ...args);
  });
});

describe("a case that returns and then breaks", () => {
  it("is fine, braced or not, in the middle or at the end", () => {
    for (const body of [
      `switch (a0) { case "x": return 1; break; default: return 2; }`,
      `switch (a0) { case "x": { return 1; break; } default: return 2; }`,
      `switch (a0) { case "x": return 1; default: return 2; break; }`,
      `switch (a0) { case "x": case "y": return 1; break; case "z": return 3; break; }  return 9;`,
    ]) {
      expect(out(fn(body))).toContain("__tddr.pick(a0");
      expect(out(fn(body))).not.toContain("switchOn");
      for (const a of ["x", "y", "z", "w"]) same(body, a);
    }
  });

  it("is fine with default in the middle", () => {
    const body = `switch (a0) { case "x": return 1; break; default: return 2; break; case "y": return 3; }`;
    expect(out(fn(body))).toContain("__tddr.pick(a0");
    for (const a of ["x", "y", "z"]) same(body, a);
  });

  it("keeps a labelled break after a return as an error", () => {
    const body = `outer: switch (a0) { case "x": return 1; break outer; default: return 2; }`;
    expect(out(fn(body))).toContain('__tddr.switchOn(__tddr_s0 = a0, "break")');
    for (const a of ["x", "z"]) same(body, a);
  });

  it("keeps a break that skips the return as an error", () => {
    expect(out(fn(`switch (a0) { case "x": if (a1) break; return 1; default: return 2; }`))).toContain('__tddr.switchOn(__tddr_s0 = a0, "break")');
  });

  it("keeps lines where they were", () => {
    const src = fn(`switch (a0) {\n case "x":\n return 1;\n break;\n default:\n return 2;\n}`);
    expect(out(src).split("\n")).toHaveLength(src.split("\n").length);
  });
});

describe("a guard clause followed by a branch-assigned let", () => {
  const body = `if (!a0) return null; let tone = "gray"; if (a1) tone = "green"; return tone;`;

  it("moves with the rest and rewrites the assignment", () => {
    const code = out(fn(body));
    expect(code).toContain("__tddr.guards(");
    expect(code).toContain("tone = __tddr.guards(");
    for (const args of [[0, 0], [1, 0], [1, 1]]) same(body, ...args);
  });

  it("works with an else-if chain and two variables", () => {
    const two = `if (!a0) return null; let v = 1, w = 1; if (a1) { v = 2; w = 3; } else w = 4; return [v, w];`;
    expect(out(fn(two))).toContain("guardsAll(");
    for (const args of [[0, 0], [1, 0], [1, 1]]) same(two, ...args);
  });

  it("works inside an arm of the early return", () => {
    const arm = `if (a0) { let v = "a"; if (a1) v = "b"; return v; } return "z";`;
    expect(out(fn(arm))).toContain("v = __tddr.guards(");
    for (const args of [[0, 0], [1, 0], [1, 1]]) same(arm, ...args);
  });

  it("works after a switch without default", () => {
    const sw = `switch (a0) { case 1: return "one"; } let t = "x"; if (a1) t = "y"; return t;`;
    expect(out(fn(sw))).toContain("__tddr.pick(a0");
    for (const args of [[1, 0], [2, 0], [2, 1]]) same(sw, ...args);
  });

  it("leaves a let declared before the guard alone", () => {
    const outer = `let t = "x"; if (a0) return 1; if (a1) t = "y"; return t;`;
    expect(out(fn(outer))).toContain('__tddr.test(a0, "midReturn")');
    for (const args of [[0, 0], [1, 0], [0, 1]]) same(outer, ...args);
  });
});

describe("an assignment arm with a let of its own", () => {
  const body = `let v = 1; if (a0) { let t = 1; if (a1) t = 2; v = t; } return v;`;

  it("is rewritten, the inner if by its own rule", () => {
    const code = out(fn(body));
    expect(code).not.toMatch(/"(assign|effects|shadow)"/);
    expect(code).toContain("guardsAll(");
    for (const args of [[0, 0], [1, 0], [1, 1]]) same(body, ...args);
  });

  it("is no error on a field", async () => {
    expect((await onField(body)).message).toBe("ok");
  });

  it("still sees a let of the same name outside as a shadow", async () => {
    const shadow = `let t = 0; if (a0) { let t = 1; t = 2; } else t = 3; return t;`;
    expect(out(fn(shadow))).toContain('"shadow"');
    same(shadow, 1);
    same(shadow, 0);
  });
});

describe("several variables assigned inside try", () => {
  const body = `let v = 1, w = 1; try { if (a0) { v = 2; const t = a1.x; w = t; } } catch {} return [v, w];`;

  it("keeps what the arm assigned before it threw", () => {
    expect(out(fn(body))).toContain('__tddr.test(a0, "tryAssign")');
    same(body, 1, null);
    same(body, 1, { x: 3 });
    same(body, 0, null);
  });

  it("still rewrites one variable, which is assigned last", () => {
    const one = `let v = 1; try { if (a0) { const t = a1.x; v = t; } } catch {} return v;`;
    expect(out(fn(one))).toContain("v = __tddr.guards(");
    same(one, 1, null);
    same(one, 1, { x: 3 });
  });

  it("says why", async () => {
    const { message } = await onField(body.replace("a1.x", "1"));
    expect(message).toMatch(/^vip: assigns several variables in a branch decided by a field inside try/);
  });
});

describe("a case grouped with default", () => {
  it("drops a negative number or a template without holes", () => {
    for (const body of [`switch (a0) { case -1: default: return 1; case 2: return 2; }`, "switch (a0) { case `x`: default: return 1; case 2: return 2; }"]) {
      expect(out(fn(body))).toContain("__tddr.pick(a0");
      for (const a of [-1, 2, "x", 3]) same(body, a);
    }
  });

  it("evaluates a test that is not a plain literal", () => {
    same("switch (a0) { case a1.x: default: return 1; }", 1, null);
    same("switch (a0) { case a1.x: default: return 1; }", 1, { x: 1 });
    same("switch (a0) { case later: default: return 1; } let later = 5; return later;", 1);
    same("switch (a0) { case a1.x: default: return 1; }", 1, undefined);
  });

  it("drops a literal one", () => {
    const body = `switch (a0) { case "a": case "b": default: return 1; }`;
    expect(out(fn(body))).toContain("__tddr.pick(a0");
    same(body, "a");
  });
});

describe("a destructured catch", () => {
  it("lets a default name a declaration of the body only as the outer name", () => {
    sameMessage("try { null.x; } catch ({ q = x }) { const x = 1; return q; }");
    sameMessage("const x = 7; try { null.x; } catch ({ q = x }) { const x = 1; return [q, x]; }");
    same("try { null.x; } catch ({ message, name: n = 'a' }) { var k = n; return [message.length > 0, k]; }");
    same("try { null.x; } catch ({ message }) { function h() { return 4; } return [h(), typeof message]; }");
  });

  it("keeps the lines of a pattern over several lines", () => {
    const src = fn("try { null.x; } catch ({\n message,\n name\n}) {\n return name;\n}");
    expect(out(src).split("\n")).toHaveLength(src.split("\n").length);
  });
});

describe("an if header over several lines", () => {
  it("keeps every line where it was", () => {
    for (const body of [
      "if (\n a0\n) return 1;\nreturn 2;",
      "if (\n a0 &&\n a1\n)\n  return 1;\nelse if (\n a1\n) return 2;\nreturn 3;",
      "let v;\nif (\n a0\n) v = 1;\nelse v = 2;\nreturn v;",
      "let v = 1, w = 2;\nif (\n a0\n) {\n v = 2; w = 3;\n}\nreturn [v, w];",
      "switch (\n a0\n) {\n case 1:\n return 1;\n default:\n return 2;\n}",
    ]) {
      const src = fn(body);
      expect(out(src).split("\n"), body).toHaveLength(src.split("\n").length);
      for (const a of [0, 1]) same(body, a, 1);
    }
  });
});

describe("the reason a statement stays an error", () => {
  const why = async (body: string) => (await onField(body)).message;

  it("names the closure that reads the assigned variables", async () => {
    const msg = await why("let a = 'a', b = 'b'; const show = () => a + b; if (a0) { a = 'A'; b = 'B'; } return show();");
    expect(msg).toMatch(/^vip: assigns several variables in a branch decided by a field while a function in this component also reads them.*\nHint: assign one variable per if/s);
  });

  it("names the arm that declares the variable again", async () => {
    const msg = await why("let v = 1; if (a0) { const v = 2; } else v = 3; return v;");
    expect(msg).toMatch(/^vip: assigns a variable that a branch declares again.*\nHint: rename the variable declared inside the branch/s);
  });

  it("names a name the code after the if declares", async () => {
    for (const body of [
      "if (a0) return why(); return 1; function why() { return 2; }",
      "if (a0) { const t = 'x'; return t; } const t = 'y'; return t;",
    ]) {
      expect(await why(body), body).toMatch(/^vip: decides a return, but a name declared after it/);
    }
    expect(await why("if (a0) return why(); return 1; function why() { return 2; }")).toMatch(/^vip: decides a return, but a name declared after it.*\nHint: rename the later declaration/s);
    expect(await why("if (a0) { const t = 'x'; return t; } const t = 'y'; return t;")).toMatch(/a name declared after it/);
  });

  it("is still valid JS on plain values", () => {
    same("if (a0) return why(); return 1; function why() { return 2; }", 1);
    same("if (a0) return why(); return 1; function why() { return 2; }", 0);
    same("if (a0) { const t = 'x'; return t; } const t = 'y'; return t;", 1);
    same("if (a0) { const t = 'x'; return t; } const t = 'y'; return t;", 0);
  });

  it("names an await", async () => {
    expect(out("async function f(a0) { let v; if (a0) v = await 1; else v = 2; return v; }")).toContain('__tddr.test(a0, "await")');
  });
});

describe("a test further down an else-if chain, a case test or a discriminant that changes something", () => {
  const cases: Array<[string, string]> = [
    ["n++ in an else-if test of an assignment", `let n = 0; let tone = "gray"; if (a0) tone = "green"; else if (n++ > 5) tone = "red"; return [tone, n];`],
    ["pop in an else-if test of an early return", `if (a0) return 1; else if (a1.pop()) return 2; return a1.length;`],
    ["a case test with ++", `switch (a0) { case "a": return 1; case a2.count++: return 2; } return 3;`],
  ];

  it.each(cases)("%s is refused for a field, and nothing runs", async (_, body) => {
    expect(out(fn(body))).toMatch(/__tddr\.(test|switchOn)\((__tddr_s\d+ = )?a0, "armEffect"\)/);
    const { message, hits } = await onField(body);
    expect(message).toMatch(/^vip: decides a branch whose value changes something/);
    expect(hits.rows).toEqual([]);
    expect(hits.o.count).toBe(0);
  });

  it.each(cases)("%s runs as written on plain values", (_, body) => {
    for (const args of [[0, [1, 2], { count: 0 }], [1, [], { count: 1 }], ["a", [3], { count: 2 }]]) same(body, ...args);
  });
});

describe("a switch discriminant that changes something", () => {
  const body = `switch (a2.count++) { case 1: return 1; default: return 2; }`;
  it("is left to the native switch, and runs as written", () => {
    expect(out(fn(body))).toContain('"armEffect"');
    for (const c of [0, 1]) same(body, 1, [], { count: c });
  });
});

describe("a case grouped with default, on a field", () => {
  const body = `switch (a0) { case FOO: default: return 1; case "b": return 2; }`;
  it("names the grouped reason", async () => {
    const { message } = await onField(`const FOO = a2; ${body}`);
    expect(message).toMatch(/^vip: decides a switch with a case grouped with default whose test is not a plain literal.*\nHint: use a literal/s);
  });
});

describe("a braced case followed by a break", () => {
  const body = `switch (a0) { case "x": { if (a1) return 1; return 2; } break; default: return 3; }`;
  it("is the braced case", async () => {
    expect(out(fn(body))).toContain("__tddr.pick(a0");
    expect(out(fn(body))).not.toContain("midReturn");
    for (const args of [["x", 0], ["x", 1], ["y", 1]]) same(body, ...args);
    expect((await onField(body)).message).toBe("ok");
  });
  it("last in the switch", () => {
    const last = `switch (a0) { case "y": return 0; case "x": { if (a1) return 1; return 2; } break; }  return 9;`;
    expect(out(fn(last))).toContain("__tddr.pick(a0");
    for (const args of [["x", 0], ["x", 1], ["y", 1], ["z", 1]]) same(last, ...args);
  });
});

describe("a mutation the transform can see in more places", () => {
  it.each([
    ["Object.assign onto a variable", `let v = 1; if (a0) v = Object.assign(a2, { k: 1 }) && 2; return [v, a2];`],
    ["an arrow called on the spot", `let v = 1; if (a0) v = (() => a1.push(3))(); return [v, a1];`],
    ["Reflect.deleteProperty", `let v = 1; if (a0) v = Reflect.deleteProperty(a2, "x") && 2; return [v, a2];`],
  ])("%s is refused for a field", async (_, body) => {
    expect(out(fn(body))).toContain('"armEffect"');
    const { message, hits } = await onField(body);
    expect(message).toMatch(/^vip: decides a branch whose value changes something/);
    expect(hits.rows).toEqual([]);
    expect(hits.o).toEqual({ count: 0 });
    for (const args of [[0, [1], { x: 1 }], [1, [1], { x: 1 }]]) same(body, ...args);
  });

  it("lets Object.assign onto a fresh object through", () => {
    const body = `let v = 1; if (a0) v = Object.assign({}, a2); return v;`;
    expect(out(fn(body))).not.toContain('"armEffect"');
    same(body, 1, [], { k: 1 });
  });
});

describe("switch (true) that stays a native switch", () => {
  const body = `let v; switch (true) { case a0: v = 1; break; default: v = 3; } return v;`;

  it("is an error on a field, with the if / else-if hint", async () => {
    const { message } = await onField(body);
    expect(message).toMatch(/^vip: is compared with true on the left.*\nHint: branch with if \(order\.paid\)/s);
  });

  it("runs as written on plain values", () => {
    for (const a of [true, false, 1, 0, "x"]) same(body, a);
    const other = `let v = 0; switch (false) { case a0: v = 1; break; case a1: v = 2; break; default: v = 3; } return v;`;
    for (const args of [[false, 1], [0, false], [true, true]]) same(other, ...args);
  });

  it("guards the cases of a switch on any discriminant", async () => {
    for (const d of ["yes", "!0", "`x`", "s.k", "String(yes)"]) {
      const body = `const yes = true; const s = { k: true }; let v; switch (${d}) { case a1.paid: v = 1; break; default: v = 3; } return v;`;
      expect(out(fn(body))).toContain("onCase");
      expect((await onField(body.replace("a1.paid", "a0"))).message).not.toBe("ok");
      for (const paid of [true, false, "true"]) same(body, 0, { paid });
    }
  });
  it("runs the discriminant once and reads it outside the switch's scope", () => {
    for (const d of ["!next()", "-next()"]) same(`let n = 0; const next = () => ++n; let v; switch (${d}) { case false: v = 1; break; case true: v = 2; break; default: v = 3; } return [v, n];`);
    same("const k = 1; let v = 0; switch (k) { case 0: let k = 2; v = k; break; case 1: v = 9; break; } return v;");
  });
  it("guards each of two nested switches against its own discriminant", async () => {
    const body = `let v = 0; switch (true) { case 1: switch ('x') { case a0: v = 1; break; default: v = 2; } break; default: v = 3; } return v;`;
    for (const a of [1, "x", "y"]) same(body, a);
    same(`let v = 0; switch (a0) { case 1: switch (a0 + 1 > 1) { case true: v = 1; break; default: v = 2; } break; default: v = 3; } return v;`, 1);
    const nested = `let v = 0; switch (a1) { case 1: switch ('x') { case a0: v = 1; break; default: v = 2; } break; default: v = 3; } return v;`;
    expect(out(fn(nested))).toMatch(/switchOn\(__tddr_s0 = a1.*switchOn\(__tddr_s1 = 'x'.*onCase\(a0, __tddr_s1\)/);
    expect((await onField(`let v = 0; switch (true) { case true: switch ('x') { case a0: v = 1; break; } break; } return v;`)).message).toMatch(/switch on "x"/);
  });
  it("leaves the case tests of a switch on a field alone", () => {
    const named = `let v; switch (a1) { case 1: v = 1; break; default: v = 3; } return v;`;
    for (const a of [1, 2, "1"]) same(named, 0, a);
  });
});

describe("an arm that declares a name another arm assigns from outside", () => {
  const body = `let v; if (a0) { let a2 = 1; v = a2; } else { a2 = 5; v = 2; } return a2;`;
  it("is refused as an assignment to a non-let, and nothing is rewritten", async () => {
    expect(out(fn(body))).toContain('"assign"');
    const { message } = await onField(body);
    expect(message).toMatch(/^vip: /);
    expect(message).not.toBe("ok");
    for (const args of [[1, [], { count: 0 }], [0, [], { count: 0 }]]) same(body, ...args);
  });
  it("still lets every arm keep its own copy", () => {
    const own = `let v; if (a0) { let t = 1; v = t; } else { let t = 5; v = t + 1; } return v;`;
    expect(out(fn(own))).not.toContain('"assign"');
    for (const a of [0, 1]) same(own, a);
  });
});

describe("a callback that changes the element it was given", () => {
  it("is not a local change on a field", async () => {
    const body = `let v = 1; if (a0) v = a1.map((x) => ++x.n); else v = a1.map((x) => x.n); return v;`;
    const f = make(body, true);
    const list = [{ n: 1 }];
    const msg = await runtime.renderSymbolic((r) => f(runtime.fieldOf(r, "vip"), list, {})).then(() => "ok", (e: Error) => e.message);
    expect(msg).toMatch(/changes something/);
    expect(list).toEqual([{ n: 1 }]);
  });
});

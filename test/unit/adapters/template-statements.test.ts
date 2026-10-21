import { describe, expect, it } from "vitest";
import * as runtime from "../../../adapters/template/index.ts";
import { rewrite } from "../../../adapters/template/transform.ts";

const IMPORT = 'import * as __tddr from "tddr:template";';
const out = (code: string) => {
  const r = rewrite(code, "/m.js");
  if (!r) return code;
  expect(r.code.startsWith(IMPORT)).toBe(true);
  return r.code.slice(IMPORT.length);
};

// what a snippet gives (or the kind of error it throws) as written and as rewritten
const run = (fn: () => unknown) => {
  try {
    return fn();
  } catch (e) {
    return `throws ${(e as Error).name}`;
  }
};
const both = (body: string, ...args: unknown[]) => {
  const fn = `(function (${args.map((_, i) => `a${i}`).join(", ")}) {\n${body}\n});`;
  const plain = new Function(`return ${fn}`)();
  const rewritten = new Function("__tddr", `return ${out(fn)}`)(runtime);
  return [run(() => plain.call({ me: 1 }, ...args)), run(() => rewritten.call({ me: 1 }, ...args))];
};
const same = (body: string, ...args: unknown[]) => {
  const [plain, rewritten] = both(body, ...args);
  expect(rewritten, `${body} with ${JSON.stringify(args)}`).toEqual(plain);
};
const fn = (body: string) => `function f(a0, a1) { ${body} }`;

describe("early returns", () => {
  it.each([
    [
      "if (!a0) return null; return a1;",
      "function f(a0, a1) { return __tddr.guards([[() => __tddr.not(a0), () => {return null;}]], () => { return a1;}); }",
    ],
    [
      "if (a0) return 1; else if (a1) return 2; else return 3;",
      "function f(a0, a1) { return __tddr.guards([[() => a0, () => {return 1;}], [() => a1, () => {return 2;}]], () => {return 3;}); }",
    ],
    [
      "if (a0) { const t = a1; return t; } return 0;",
      "function f(a0, a1) { return __tddr.guards([[() => a0, () => { const t = a1; return t; }]], () => { return 0;}); }",
    ],
    ["if (a0) return 1;", "function f(a0, a1) { return __tddr.guards([[() => a0, () => {return 1;}]]); }"],
    [
      "if (a0) return 1; if (a1) return 2; return 3;",
      "function f(a0, a1) { return __tddr.guards([[() => a0, () => {return 1;}]], () => { return __tddr.guards([[() => a1, () => {return 2;}]], () => { return 3;});}); }",
    ],
    [
      "if (a0) { if (a1) return 1; return 2; } return 3;",
      "function f(a0, a1) { return __tddr.guards([[() => a0, () => { return __tddr.guards([[() => a1, () => {return 1;}]], () => { return 2;}); }]], () => { return 3;}); }",
    ],
  ])("%s", (body, expected) => {
    expect(out(fn(body))).toBe(expected);
  });

  it("works in arrow callbacks and methods", () => {
    expect(out("const f = (x) => { if (x) return 1; return 2; };")).toBe("const f = (x) => { return __tddr.guards([[() => x, () => {return 1;}]], () => { return 2;}); };");
    expect(out("const o = { m(x) { if (x) return 1; return 2; } };")).toContain("return __tddr.guards(");
    expect(out("items.map((i) => { if (i.hidden) return null; return i.name; });")).toContain("return __tddr.guards([[() => i.hidden");
  });

  it("runs as the ifs did on plain values", () => {
    const cases: Array<[string, ...unknown[][]]> = [
      // a later test is not evaluated when an earlier one returned
      ["if (a0 === null) return 'none'; if (a0.length > 2) return 'long'; return 'short';", [null], ["abcd"], ["a"]],
      ["if (a0) return 1; else if (a1) return 2; else return 3;", [1, 0], [0, 1], [0, 0]],
      ["if (a0) { const t = a1 + 1; return t * 2; } const u = a1 - 1; return u;", [1, 4], [0, 4]],
      ["if (a0) { if (a1) return 'x'; return 'y'; } return 'z';", [1, 1], [1, 0], [0, 0]],
      ["if (!a0) return; return a0 + 1;", [0], [2]],
      ["if (a0) return 1; log = 2; return log;", [0], [1]],
      ["let n = 0; if (a0) return n; n = 5; if (a1) return n; return -n;", [1, 1], [0, 1], [0, 0]],
      ["if (a0) return this.me; return arguments.length;", [1, 2], [0, 2]],
      ["if (a0) return 1;", [1], [0]],
      ["if (a0) return 1; return a1 ? 'a' : 'b';", [0, 1], [0, 0]],
      ["if (a0) return [1].map((x) => { if (x) return 'in'; return 'out'; }); return null;", [1], [0]],
    ];
    for (const [body, ...argSets] of cases) for (const args of argSets) same(body.replace("log = 2", "var log = 2"), ...args);
  });

  it("keeps the TDZ, hoisting and var rules by leaving those shapes alone", () => {
    // the rest declares a name the guard uses: moving it would find the outer one
    const shadow = "const x = 'outer'; function g(c) { if (c) return x; const x = 'inner'; return x; } return g(a0);";
    expect(out(fn(shadow))).not.toContain("guards(");
    same(shadow, 1);
    same(shadow, 0);
    const hoisted = "if (a0) return h(); function h() { return 'h'; } return 'no';";
    expect(out(fn(hoisted))).not.toContain("guards(");
    same(hoisted, 1);
    const hoistedVar = "if (a0) return typeof v; var v = 1; return v;";
    expect(out(fn(hoistedVar))).not.toContain("guards(");
    same(hoistedVar, 1);
    same(hoistedVar, 0);
  });

  it("leaves alone a rest whose names something earlier uses", () => {
    // a function declared below is hoisted; the rest moving into a thunk would hide it
    for (const body of [
      "const l = fmt(a0); if (a0) return 1; return l; function fmt(x) { return 'f' + x; }",
      "const h = () => helper(); if (a0) return h(); return 'no'; function helper() { return 'h'; }",
      "const g = () => y; if (a0) return 1; let y = 5; return g();",
    ]) {
      expect(out(fn(body))).not.toContain("guards(");
      same(body, 1);
      same(body, 0);
    }
    const sw = "const l = fmt(a0); switch (a0) { case 1: return 'one'; case 2: return 'two'; } return l; function fmt(x) { return 'f' + x; }";
    expect(out(fn(sw))).not.toContain("pick(");
    for (const v of [1, 2, 3]) same(sw, v);
  });

  it("leaves what can't move into an arrow: await, yield, a generator", () => {
    expect(out("async function f(x, xs) { if (x) return 1; for await (const y of xs) {} return 2; }")).not.toContain("guards(");
    expect(out("async function f(x) { if (x) return 1; return await x; }")).not.toContain("guards(");
    expect(out("function* f(x) { if (x) return 1; return 2; }")).not.toContain("guards(");
    expect(out("function* f(x) { if (x) return 1; yield 2; }")).not.toContain("guards(");
    expect(out("async function f(x) { if (x) return 1; return 2; }")).toContain("guards(");
  });

  it("leaves ifs whose arms do other things, with a reason", () => {
    expect(out(fn("if (a0) { a1.push(1); return 1; } return 2;"))).toContain('__tddr.test(a0, "effects")');
    expect(out(fn("if (a0) { console.log(1); return 1; } return 2;"))).toContain('__tddr.test(a0, "effects")');
    expect(out(fn("if (a0) { a1 += 1; return 1; } return 2;"))).toContain('__tddr.test(a0, "effects")');
    expect(out(fn("if (a0) { a1.x = 1; return 1; } return 2;"))).toContain('__tddr.test(a0, "effects")');
    expect(out(fn("if (a0) { for (const x of a1) {} return 1; } return 2;"))).toContain('__tddr.test(a0, "effects")');
  });

  it("leaves an if that only sometimes returns", () => {
    expect(out(fn("if (a0) { if (a1) return 1; } return 2;"))).not.toContain("guards(");
    expect(out(fn("if (a0) return 1; else a1 = 2; return 3;"))).toContain("__tddr.test(a0");
  });

  it("names a return in a loop or in try", () => {
    expect(out(fn("for (const x of a1) { if (x.a) return 1; } return 2;"))).toContain('__tddr.test(x.a, "loopReturn")');
    expect(out(fn("while (a1) { if (a0) return 1; }"))).toContain('__tddr.test(a0, "loopReturn")');
    expect(out(fn("try { if (a0) return 1; } catch (e) {} return 2;"))).toContain('__tddr.test(a0, "tryReturn")');
    expect(out(fn("for (const x of a1) { if (x.a) break; }"))).toContain('__tddr.test(x.a, "jump")');
    expect(out(fn("for (const x of a1) { if (x.a) { continue; } }"))).toContain('__tddr.test(x.a, "jump")');
    expect(out(fn("while (a0) {}"))).toContain('__tddr.test(a0, "loop")');
  });

  it("keeps the old output in a Vue render, where ifs write to a stream", () => {
    const src = "function ssr(_ctx, _push) { if (_ctx.a) { return 1; } return 2; }";
    expect(out(src)).not.toContain("guards(");
  });
});

describe("switch on a field", () => {
  it("is an else-if chain of eq tests, grouped cases an or, default the else", () => {
    expect(out(fn("switch (a0) { case 'a': case 'b': return 1; case 'c': return 2; default: return 3; }"))).toBe(
      "function f(a0, a1) { return __tddr.pick(a0, (__tddr_d) => [[() => __tddr.or(__tddr.eq(__tddr_d, 'a'), () => __tddr.eq(__tddr_d, 'b')), () => {return 1;}], [() => __tddr.eq(__tddr_d, 'c'), () => {return 2;}], [null, () => {return 3;}],]); }",
    );
  });

  it("takes the code after it as the else when there is no default", () => {
    expect(out(fn("switch (a0) { case 1: return 'one'; } return 'other';"))).toBe(
      "function f(a0, a1) { return __tddr.pick(a0, (__tddr_d) => [[() => __tddr.eq(__tddr_d, 1), () => {return 'one';}],], () => { return 'other';}); }",
    );
  });

  it("runs as the switch did on plain values", () => {
    const cases: Array<[string, ...unknown[][]]> = [
      ["switch (a0) { case 'a': case 'b': return 1; case 'c': return 2; default: return 3; }", ["a"], ["b"], ["c"], ["d"]],
      ["switch (a0) { case 'a': return 1; default: return 3; case 'b': return 2; }", ["a"], ["b"], ["z"]],
      ["switch (a0) { case 'a': return 1; } return 'rest';", ["a"], ["b"]],
      ["switch (a0) { case 'a': case 'z': default: return 'd'; case 'b': return 'b'; }", ["a"], ["b"], ["q"]],
      ["switch (a0) { case 1: { const t = a1 * 2; return t; } case 2: return a1; }", [1, 5], [2, 5], [3, 5]],
      ["switch (a0) { case 1: const t = 'x'; return t; case 2: const u = 'y'; return u; default: return 0 }", [1], [2], [9]],
      ["switch (a0 + a1) { case 'ab': return 1; default: return 2 }", ["a", "b"], ["a", "c"]],
      ["switch (a0) { case a1: return 'same'; default: return 'diff' }", [1, 1], [1, 2]],
      ["let calls = 0; const next = () => ++calls; switch (a0) { case next(): return 'one'; case next(): return 'two'; default: return calls }", [1], [2], [3]],
      ["switch (a0) { default: return 'only' }", [1]],
    ];
    for (const [body, ...argSets] of cases) for (const args of argSets) same(body, ...args);
  });

  it("leaves fall-through, break and mixed bodies alone, with a reason", () => {
    const fall = out(fn("switch (a0) { case 1: a1.push(1); case 2: return 2; }"));
    expect(fall).toContain('__tddr.switchOn(__tddr_s0 = a0, "fall")');
    const brk = out(fn("switch (a0) { case 1: a1 = 1; break; case 2: return 2; }"));
    expect(brk).toContain('__tddr.switchOn(__tddr_s0 = a0, "break")');
    expect(out(fn("switch (a0) { case 1: return 1; case 2: }"))).toContain("__tddr.switchOn(__tddr_s0 = a0)");
    expect(out(fn("switch (a0) { case 1: if (a1) return 1; }"))).not.toContain("pick(");
    // a case test with an effect, grouped with default, would be dropped
    expect(out(fn("switch (a0) { case f(): default: return 1; }"))).not.toContain("pick(");
    // a name one case declares and another reads
    expect(out(fn("switch (a0) { case 1: const t = 1; return t; case 2: return t; }"))).not.toContain("pick(");
  });
});

describe("variables assigned in branches", () => {
  it.each([
    [
      "let v; if (a0) v = 1; else v = 2; return v;",
      "function f(a0, a1) { let v; v = __tddr.guards([[() => a0, () => 1]], () => 2); return v; }",
    ],
    [
      "let v = 0; if (a0) v = a1; return v;",
      "function f(a0, a1) { let v = 0; v = __tddr.guards([[() => a0, () => a1]], () => v); return v; }",
    ],
    [
      "let v; if (a0) { v = 1 } else if (a1) { v = 2 } else { v = 3 } return v;",
      "function f(a0, a1) { let v; v = __tddr.guards([[() => a0, () => 1], [() => a1, () => 2]], () => 3); return v; }",
    ],
    [
      "let v; if (a0) { const t = a1.x; v = t + 1; } else v = 0; return v;",
      "function f(a0, a1) { let v; v = __tddr.guards([[() => a0, () => { const t = a1.x; return __tddr.add(t , 1); }]], () => 0); return v; }",
    ],
    [
      "let v = 1, w = 2; if (a0) { v = 3; w = 4; } else if (a1) { v = 5; } return v;",
      "function f(a0, a1) { let v = 1, w = 2; ;[v, w] = __tddr.guardsAll([[() => a0, () => ((v, w) => { v = 3; w = 4; ;return [v, w]; })(v, w)], [() => a1, () => ((v, w) => { v = 5; ;return [v, w]; })(v, w)]], () => [v, w]); return v; }",
    ],
  ])("%s", (body, expected) => {
    expect(out(fn(body))).toBe(expected);
  });

  it("runs as the ifs did on plain values", () => {
    const cases: Array<[string, ...unknown[][]]> = [
      ["let v; if (a0) v = 'A'; else v = 'B'; return v;", [1], [0]],
      ["let v = 'init'; if (a0) v = 'B'; return v;", [1], [0]],
      ["let v; if (a0) { v = 1 } else if (a1) { v = 2 } else { v = 3 } return v;", [1, 1], [0, 1], [0, 0]],
      ["let v = 'x'; if (a0) { v = 1 } else if (a1) { v = 2 } return v;", [1, 1], [0, 1], [0, 0]],
      ["let v; if (a0) { const t = a1 * 2; v = t + 1; } else v = 0; return v;", [1, 4], [0, 4]],
      ["let x = 1, y = 2; if (a0) { x = 10; y = x + 1; } else if (a1) { y = 20; } return [x, y];", [1, 0], [0, 1], [0, 0]],
      ["let x = 1, y = 2; if (a0) { if (a1) { x = 'both'; } else { x = 'one'; y = 'one'; } } return [x, y];", [1, 1], [1, 0], [0, 1]],
      ["let x = 'n'; if (a0) { x = 'a'; } if (a1) { x = x + 'b'; } return x;", [1, 1], [1, 0], [0, 1], [0, 0]],
      ["let out = []; for (const i of a0) { let tag; if (i % 2) tag = 'odd'; else tag = 'even'; out.push(tag); } return out;", [[1, 2, 3]]],
      ["let v = 0; for (let i = 0; i < a0; i++) { if (i > 1) v = i; } return v;", [4]],
      ["let v; const f = () => v; if (a0) v = 1; else v = 2; return f();", [1], [0]],
      ["let a = 1, b = 2; if (a0) { a = b; b = a; } return [a, b];", [1], [0]],
      ["let a = 1, b = 2; if (a0) { const t = a; a = b; b = t; } return [a, b];", [1], [0]],
    ];
    for (const [body, ...argSets] of cases) for (const args of argSets) same(body, ...args);
  });

  it("leaves other shapes alone, with a reason", () => {
    const effects = (body: string) => expect(out(fn(body))).toContain('__tddr.test(a0, "effects")');
    effects("let v; if (a0) { v = 1; a1.push(v); } return v;");
    effects("let v = 0; if (a0) v += 1; return v;");
    effects("let v = 0; if (a0) v++; return v;");
    effects("if (a0) a1.x = 1;");
    effects("if (a0) a1(); else a1(2);");
    effects("let v; if (a0) { v = 1; for (const x of a1) {} } return v;");
    effects("let v; if (a0) { v = 1; if (a1) a1.push(1); } return v;");
    // not a let of this function: a parameter, a const, an outer or module variable
    const assign = (src: string) => expect(out(src)).toContain('__tddr.test(a0, "assign")');
    assign(fn("if (a0) a1 = 1;"));
    assign(fn("const v = 0; if (a0) v = 1;"));
    assign("let m; function f(a0) { if (a0) m = 1; }");
    assign("function f(a0) { var v; if (a0) v = 1; return v; }");
    // assigned before its let: the rewrite would read it in the TDZ
    assign(fn("if (a0) v = 1; let v = 0; return v;"));
    // a closure inside the arm that reads the variable would see a copy
    expect(out(fn("let x = 1, y = 2; if (a0) { x = 3; y = a1.map(() => x); } return y;"))).toContain('__tddr.test(a0, "closure")');
  });

  it("keeps an arm's own variable of the same name out of the rewrite", () => {
    same("let v = 'a'; if (a0) { let v = 'b'; v = 'c'; } return v;", 1);
    same("let v = 'a'; if (a0) { let v = 'b'; v = 'c'; } return v;", 0);
    same("let v = 'a'; if (a0) { v = 'x'; } else { let v = 'b'; v = 'c'; } return v;", 0);
    same("let v = 'a'; if (a0) { v = 'x'; } else { let v = 'b'; v = 'c'; } return v;", 1);
    expect(out(fn("let v = 'a'; if (a0) { let v = 'b'; v = 'c'; } return v;"))).not.toContain("guards");
  });

  it("does not rewrite an assignment that comes before its let", () => {
    same("if (a0) v = 1; let v = 0; return v;", 0);
    same("if (a0) v = 1; let v = 0; return v;", 1);
  });

  it("leaves an if that is the unbraced body of a loop", () => {
    expect(out(fn("let v; for (const x of a1) if (x) v = 1;"))).toContain('__tddr.test(x, "effects")');
  });
});

describe("an author's catch", () => {
  it("first rethrows what a template can't do", () => {
    expect(out("try { a(); } catch (e) { b(e); }")).toBe("try { a(); } catch (e) {__tddr.rethrow(e); b(e); }");
    expect(out("try { a(); } catch { b(); }")).toBe("try { a(); } catch (__tddr_e) {__tddr.rethrow(__tddr_e); b(); }");
    expect(out("try { a(); } finally { b(); }")).toBe("try { a(); } finally { b(); }");
  });

  it("still catches everything else", () => {
    same("try { throw new RangeError('x'); } catch (e) { return e.message; }");
    same("try { if (a0) throw new Error('x'); return 'fine'; } catch { return 'caught'; } finally { a1 = 1; }", 1, 0);
    same("try { null.x; } catch ({ message }) { return typeof message; }");
    same("try { null.x; } catch ({ message, name: n = 'x' }) { return message + n; }");
  });

  it("rethrows a template error before destructuring the catch", () => {
    const make = (source: string) => new Function("__tddr", "x", `return ${source}`)(runtime, () => { throw runtime.templateError("order.paid", "can't", "do something else"); });
    const f = make(out("(function () { try { x(); } catch ({ message }) { return message; } })"));
    expect(() => f()).toThrow(/order\.paid/);
  });

  it("lets a template error through", () => {
    const body = "try { x(); } catch (e) { return 'swallowed'; }";
    const make = (source: string) => new Function("__tddr", "x", `return ${source}`);
    const boom = () => {
      throw runtime.templateError("order.paid", "can't", "do something else");
    };
    const src = `(function () { ${body} })`;
    expect(() => make(out(src))(runtime, boom)()).toThrow(/order\.paid: can't/);
    expect(make(src)(runtime, boom)()).toBe("swallowed");
  });
});

describe("source maps and positions", () => {
  it("keeps every line where it was", () => {
    const src = "function f(a, b) {\n  if (!a) {\n    return null;\n  }\n  if (a === 'x') return 1;\n  return b;\n}\n";
    const r = rewrite(src, "/m.js")!;
    expect(r.code.split("\n")).toHaveLength(src.split("\n").length);
  });
});

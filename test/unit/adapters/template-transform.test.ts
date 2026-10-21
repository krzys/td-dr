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

// runs a snippet (a function body) as written and as rewritten
const both = (body: string, ...args: unknown[]) => {
  const fn = `(function (${args.map((_, i) => `a${i}`).join(", ")}) {\n${body}\n});`;
  const plain = new Function(`return ${fn}`)();
  const rewritten = new Function("__tddr", `return ${out(fn)}`)(runtime);
  return [plain(...args), rewritten(...args)];
};

describe("the operator rewrite", () => {
  it.each([
    ["a && b", "__tddr.and(a , () =>  b)"],
    ["a || b", "__tddr.or(a , () =>  b)"],
    ["a ?? b", "__tddr.nullish(a , () =>  b)"],
    ["t ? a : b", "__tddr.cond(t , () =>  a , () =>  b)"],
    ["!a", "__tddr.not(a)"],
    ["a === b", "__tddr.eq(a , b)"],
    ["a !== b", "__tddr.ne(a , b)"],
    ["a == b", "__tddr.looseEq(a , b)"],
    ["a != b", "__tddr.looseNe(a , b)"],
    ["a < b", "__tddr.lt(a , b)"],
    ["a >= b", "__tddr.ge(a , b)"],
    ["a + b", "__tddr.add(a , b)"],
    ["typeof a", '(typeof a === "undefined" ? "undefined" : __tddr.typeOf(a))'],
    ["typeof a.b", "__tddr.typeOf( a.b)"],
    ["a && { b: 1 }", "__tddr.and(a , () => ( { b: 1 }))"],
    ["(a, b) && c", "__tddr.and((a, b) , () =>  c)"],
    ["a /* && */ && b", "__tddr.and(a /* && */ , () =>  b)"],
    ["x && /<!--/.test(y)", "__tddr.and(x , () =>  /<!--/.test(y))"],
  ])("%s", (src, expected) => {
    expect(out(`${src};`)).toBe(`${expected};`);
  });

  it("nests", () => {
    expect(out("a && !b ? c : d === 'x';")).toBe("__tddr.cond(__tddr.and(a , () =>  __tddr.not(b)) , () =>  c , () =>  __tddr.eq(d , 'x'));");
  });

  it("wraps statement tests", () => {
    expect(out("if (a) b(); while (c) d(); do e(); while (f); for (;g;) h(); switch (k) {}")).toBe(
      'if (__tddr.test(a, "effects")) b(); while (__tddr.test(c, "loop")) d(); do e(); while (__tddr.test(f, "loop")); for (;__tddr.test(g, "loop");) h(); switch (__tddr.switchOn(k)) {}',
    );
  });

  it("leaves literal-only operations and arrows that can't hold an await alone", () => {
    expect(rewrite('const s = "a" + "b"; const t = 1 === 1;', "/m.js")).toBeUndefined();
    expect(out("async function f() { return a && await b; }")).toBe("async function f() { return a && await b; }");
  });

  it("imports the renderers' shims by name, so they aren't externalized", () => {
    expect(out('import { jsx } from "react/jsx-runtime";')).toBe('import { jsx } from "tddr:shim/react/jsx-runtime";');
    expect(out('export * from "vue/server-renderer";')).toBe('export * from "tddr:shim/vue/server-renderer";');
    expect(out('import { h } from "vue";')).toBe('import { h } from "tddr:shim/vue";');
    expect(rewrite('import { h } from "vue/dist/vue.js";', "/m.js")).toBeUndefined();
  });

  it("keeps plain semantics", () => {
    const snippets: Array<[string, ...unknown[]]> = [
      ["return [a0 && a1, a0 || a1, a0 ?? a1, !a0, a0 ? a1 : 'n']", 0, "x"],
      ["return [a0 && a1, a0 || a1, a0 ?? a1, !a0, a0 ? a1 : 'n']", "", null],
      ["return [a0 && a1, a0 || a1, a0 ?? a1, !!a0, a0 ? { a: a1 } : [a1]]", { k: 1 }, 2],
      ["let n = 0; const f = () => ++n; a0 && f(); a0 || f(); a0 ?? f(); a0 ? f() : f(); return n", 0],
      ["return [a0 === a1, a0 !== a1, a0 == a1, a0 != a1, a0 < a1, a0 > a1, a0 <= a1, a0 >= a1, a0 + a1]", 1, "1"],
      ["return [a0 === a1, a0 == a1, a0 + a1]", null, undefined],
      ["return typeof a0 + typeof missing + typeof a1.x", 1, { x: [] }],
      ["const out = []; for (let i = 0; i < a0; i++) { if (i % 2) out.push(i); else out.push(-i) } return out", 5],
      ["switch (a0) { case 'a': return 1; default: return 2 }", "a"],
      ["let i = 0; while (i < a0) i++; do i++; while (!a0); return i", 3],
      ["return a0.map((x) => x > 1 ? x * 2 : x === 1 && 'one')", [0, 1, 2, 3]],
      ["return `${a0 || 'none'}-${a1 ? 'y' : 'n'}`", "", 1],
      ["function f() { return this && arguments.length > 1 && arguments[1] } return f.call(a0, 1, a1)", { t: 1 }, "two"],
    ];
    for (const [body, ...args] of snippets) {
      const [plain, rewritten] = both(body, ...args);
      expect(rewritten, body).toEqual(plain);
    }
  });
});

describe("Vue's SSR render", () => {
  it("writes a statement if chain as one pushIf, Vue's placeholder else marked", () => {
    const src = [
      "function render(_ctx, _push) {",
      "  if (_ctx.a) {",
      "    _push(`<p>A</p>`);",
      "  } else if (_ctx.s === 'x') _push(`<p>X</p>`);",
      "  else {",
      "    _push(`<!--v-if-->`);",
      "  }",
      "  if (_ctx.b) { _push(`B`) }",
      "}",
    ].join("\n");
    expect(out(src)).toBe(
      [
        "function render(_ctx, _push) {",
        "  __tddr.pushIf(_push, [[() => _ctx.a, () => {",
        "    _push(`<p>A</p>`);",
        "  }], [() => __tddr.eq(_ctx.s , 'x'), () => {_push(`<p>X</p>`);}]], () => {",
        "    _push(`<!--v-if-->`);",
        "  }, true);",
        "  __tddr.pushIf(_push, [[() => _ctx.b, () => { _push(`B`) }]], null);",
        "}",
      ].join("\n"),
    );
  });

  it("keeps an if that returns, and passes the stream to v-for's list", () => {
    const src = [
      'import { ssrRenderList as _ssrRenderList } from "vue/server-renderer";',
      "function render(_ctx, _push) {",
      "  _ssrRenderList(_ctx.items, (item) => { if (item.on) { _push(`x`) } });",
      "  slot((_, _push) => { if (_push) { _push(`a`) } else { return [] } });",
      "}",
    ].join("\n");
    expect(out(src)).toBe(
      [
        'import { ssrRenderList as _ssrRenderList } from "tddr:shim/vue/server-renderer";',
        "function render(_ctx, _push) {",
        "  _ssrRenderList(_ctx.items, (item) => { __tddr.pushIf(_push, [[() => item.on, () => { _push(`x`) }]], null); }, _push);",
        "  slot((_, _push) => { if (__tddr.test(_push)) { _push(`a`) } else { return [] } });",
        "}",
      ].join("\n"),
    );
  });

  it("runs the chain like the if it was on plain data", () => {
    const src = "const pushed = []; const _push = (s) => pushed.push(s); (function (_ctx, _push) { if (_ctx.a) _push('A'); else if (_ctx.b) _push('B'); else _push('C') })(a0, _push); return pushed.join('')";
    for (const ctx of [{ a: 1 }, { b: 1 }, {}]) {
      const [plain, rewritten] = both(src, ctx);
      expect(rewritten).toBe(plain);
    }
  });
});

// a mapped generated position back to the original, from the map's segments
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const decode = (mappings: string) => {
  const lines: number[][][] = [];
  let [srcLine, srcCol] = [0, 0];
  for (const line of mappings.split(";")) {
    let col = 0;
    const segs: number[][] = [];
    for (const seg of line.split(",").filter(Boolean)) {
      const values: number[] = [];
      let v = 0;
      let shift = 0;
      for (const ch of seg) {
        const d = B64.indexOf(ch);
        v += (d & 31) << shift;
        if (d & 32) shift += 5;
        else {
          values.push(v & 1 ? -(v >> 1) : v >> 1);
          v = 0;
          shift = 0;
        }
      }
      col += values[0]!;
      srcLine += values[2]!;
      srcCol += values[3]!;
      segs.push([col, srcLine, srcCol]);
    }
    lines.push(segs);
  }
  return (line: number, col: number) => {
    const seg = lines[line]!.filter((s) => s[0]! <= col).at(-1)!;
    return [seg[1], seg[2]! + (col - seg[0]!)];
  };
};

describe("the source map", () => {
  it("maps every original token back to where it was", () => {
    const src = "const total = (a, b) =>\n  a.price > 0 && b ? `${a.name}` : 'none';\nif (!x) y(a === b);\n";
    const r = rewrite(src, "/m.js")!;
    const find = decode(r.map.mappings);
    const genLines = r.code.split("\n");
    const srcLines = src.split("\n");
    for (const word of ["price", "name", "'none'", "y(", "x)", "a.price"]) {
      const gl = genLines.findIndex((l) => l.includes(word));
      const sl = srcLines.findIndex((l) => l.includes(word));
      expect(find(gl, genLines[gl]!.indexOf(word)), word).toEqual([sl, srcLines[sl]!.indexOf(word)]);
    }
    expect(r.map.sources).toEqual(["/m.js"]);
  });
});

// the original position a generated one maps to, as a source map consumer (and so Vite's stack
// mapping) reads it: the segment at or before the column, without an offset into it
const lookup = (mappings: string) => {
  const segs = decodeAll(mappings);
  return (line: number, col: number): [number, number] => {
    const seg = segs[line]!.filter((s) => s[0]! <= col).at(-1)!;
    return [seg[1]!, seg[2]!];
  };
};
const decodeAll = (mappings: string): number[][][] => {
  const lines: number[][][] = [];
  let [srcLine, srcCol] = [0, 0];
  for (const line of mappings.split(";")) {
    let col = 0;
    const segs: number[][] = [];
    for (const seg of line.split(",").filter(Boolean)) {
      const values: number[] = [];
      let [v, shift] = [0, 0];
      for (const ch of seg) {
        const d = B64.indexOf(ch);
        v += (d & 31) << shift;
        if (d & 32) shift += 5;
        else {
          values.push(v & 1 ? -(v >> 1) : v >> 1);
          [v, shift] = [0, 0];
        }
      }
      col += values[0]!;
      srcLine += values[2]!;
      srcCol += values[3]!;
      segs.push([col, srcLine, srcCol]);
    }
    lines.push(segs);
  }
  return lines;
};
// line and column of the nth occurrence of `text`
const where = (code: string, text: string, nth = 0): [number, number] => {
  let i = -1;
  for (let k = 0; k <= nth; k++) i = code.indexOf(text, i + 1);
  expect(i, text).toBeGreaterThanOrEqual(0);
  const before = code.slice(0, i);
  return [before.split("\n").length - 1, i - before.lastIndexOf("\n") - 1];
};

describe("positions", () => {
  const src = [
    "const a = x.price > 0 && y;",
    "const b = t ? 'yes' : 'no';",
    "const c = !done;",
    "const d = typeof w.q;",
    "if (paid) rows.push(1);",
    "switch (k) { case 'a': f(); }",
    "while (more) step();",
    "",
  ].join("\n");

  it("maps each runtime call to the start of what it replaced, wherever in the call a stack points", () => {
    const r = rewrite(src, "/m.js")!;
    const at = lookup(r.map.mappings);
    const calls: Array<[call: string, original: string]> = [
      ["__tddr.and(", "x.price > 0 && y"],
      ["__tddr.gt(", "x.price > 0"],
      ["__tddr.cond(", "t ? 'yes'"],
      ["__tddr.not(", "!done"],
      ["__tddr.typeOf(", "typeof w.q"],
      ["__tddr.test(paid", "paid)"],
      ["__tddr.switchOn(", "k)"],
      ["__tddr.onCase(", "'a'"],
      ["__tddr.test(more", "more)"],
    ];
    for (const [call, original] of calls) {
      const [line, col] = where(r.code, call);
      // a frame's column is the call's start, or (V8, for a method call) its name
      for (const c of [col, col + "__tddr.".length]) expect(at(line, c), call).toEqual(where(src, original));
    }
  });

  it("maps the code it keeps token by token, each on its own line, through statement rewrites", () => {
    const body = [
      "function Mail({ order }) {",
      "  let label;",
      "  if (order.gift) label = order.giftNote;",
      "  else label = 'none';",
      "  if (!order.paid) {",
      "    return null;",
      "  }",
      "  switch (order.status) {",
      "    case 'open':",
      "      return [label, order.dueDate];",
      "    default:",
      "      return order.closedOn;",
      "  }",
      "}",
      "",
    ].join("\n");
    const r = rewrite(body, "/m.js")!;
    const at = lookup(r.map.mappings);
    expect(r.code.split("\n")).toHaveLength(body.split("\n").length);
    for (const word of ["order.gift", "order.giftNote", "'none'", "order.paid", "null", "order.status", "'open'", "order.dueDate", "order.closedOn"]) {
      const [line, col] = where(r.code, word);
      expect([line, col], word).toEqual([where(body, word)[0], col]);
      expect(at(line, col), word).toEqual(where(body, word));
    }
  });

  it("refuses syntax it can't follow at the node, and names the place of a syntax error", () => {
    const refusal = (code: string) => {
      try {
        rewrite(code, "/e/m.js");
      } catch (e) {
        return e as SyntaxError & { loc: unknown };
      }
      throw new Error("did not throw");
    };
    const w = refusal("export const a = 1;\nfunction f(o) {\n  with (o) { return x; }\n}\n");
    expect(w.name).toBe("SyntaxError");
    expect(w.message).toBe("/e/m.js:3:3: tddr can't rewrite this email module: a with statement makes the names inside it depend on an object at run time (and is a syntax error in an ES module)");
    expect(w.loc).toEqual({ file: "/e/m.js", line: 3, column: 2 });
    const p = refusal("const s = '😀';\nlet b = ;\n");
    expect(p.message).toBe("/e/m.js:2:9: Unexpected token");
    expect(p.loc).toEqual({ file: "/e/m.js", line: 2, column: 8 });
    // the frameworks compile JSX and TypeScript before the rewrite; reaching it uncompiled is an error, not a guess
    expect(refusal("export default () => <p/>;").message).toMatch(/^\/e\/m\.js:1:22: Unexpected JSX expression$/);
  });
});

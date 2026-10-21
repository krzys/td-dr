import { describe, expect, test } from "vitest";
import * as T from "../../adapters/template/index.ts";
import { compile, preview } from "../../src/index.ts";
import { isProblem, parseCond } from "../../src/template/cond.ts";
import type { DialectName } from "../../src/template/dialects.ts";
import { blockClose, blockOpen, field } from "../../src/template/tokens.ts";
import { writeTemplate } from "../../src/template/write.ts";
import { fills } from "../harness/template-fixture.ts";

// The condition matrix (template-semantics.test.ts) composed: values a component builds with
// &&, || and ?? and renders, conditions inside loops and chains, names and literals at the edges.
// Each case is the HTML render's JS, preview() and every real engine fill agreeing, or the data
// set refused with a TemplateDataError.

const DIALECTS = ["handlebars", "liquid"] as const;
const MISSING = Symbol("missing");
const ALL: Array<[string, unknown]> = [
  ["missing", MISSING],
  ["null", null],
  ["false", false],
  ["true", true],
  ["0", 0],
  ["1", 1],
  ['""', ""],
  ['"a"', "a"],
  ["[]", []],
  ["[1]", [1]],
  ["{}", {}],
];
// values a component can print the way a template prints them (React shows nothing for a boolean)
const PRINTABLE = ALL.filter(([n]) => ["missing", "null", "0", "1", '""', '"a"'].includes(n));
const data = (vars: Record<string, unknown>) => Object.fromEntries(Object.entries(vars).filter(([, v]) => v !== MISSING));
const plain = (v: unknown) => (v === MISSING ? undefined : v);

const text = (html: string): string =>
  (/<body[^>]*>([\s\S]*)<\/body>/.exec(html)?.[1] ?? html)
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/\s+/g, "");
const compiled = new Map<string, string>();
const template = (page: string, d: DialectName): string => {
  const key = `${d}\0${page}`;
  if (!compiled.has(key)) {
    const r = compile(page, { template: d, strict: true });
    expect(r.diagnostics.filter((x) => x.severity === "error"), page).toEqual([]);
    compiled.set(key, r.html);
  }
  return compiled.get(key)!;
};
const shown = (page: string, props: Record<string, unknown>, dialects: readonly DialectName[]): string => {
  try {
    return text(compile(preview(page, props, { dialects })).html);
  } catch (e) {
    if ((e as Error).name !== "TemplateDataError") throw e;
    return "refused";
  }
};

// `page` must read `js` (the HTML render's text) for `props`, or be refused for a dialect
const agrees = (page: string, props: Record<string, unknown>, js: string, label: string): number => {
  let refused = 0;
  const bare = shown(page, props, []);
  if (bare !== "refused") expect(bare, `${label} preview`).toBe(js);
  for (const d of DIALECTS) {
    const got = shown(page, props, [d]);
    if (got === "refused") {
      refused++;
      continue;
    }
    expect(got, `${d} preview ${label}`).toBe(js);
    for (const out of fills(template(page, d), d, props)) expect(text(out), `${d} fill ${label}\n${template(page, d)}`).toBe(js);
  }
  return refused;
};

// a recorded value as the markup a framework renders: `empty` is what it shows as nothing
const REACT = (v: unknown) => v == null || typeof v === "boolean" || v === "";
const VUE = (v: unknown) => v == null || v === "";
const markup = (v: unknown, empty: (v: unknown) => boolean): string => {
  const parts = T.blockParts(v, empty);
  if (parts) return parts.map((x) => `<${x.tag}${T.attrText(x.attrs)}>${markup(x.value, empty)}</${x.tag}>`).join("");
  if (T.infoOf(v)) return String(v);
  return empty(v) ? "" : String(v);
};
const props = () => T.rootProps({ roots: new Set(), aliases: new Set(), reserved: new Set() }).props as Record<string, any>;

type Expr = { name: string; f: (x: any, y: any, z: any) => unknown; xs: typeof ALL; ys: typeof ALL };
const EXPRS: Expr[] = [
  { name: "(x && y) ?? z", f: (x, y, z) => T.nullish(T.and(x, () => y), () => z), xs: ALL, ys: PRINTABLE },
  { name: "(x && 'T') ?? z", f: (x, _y, z) => T.nullish(T.and(x, () => "T"), () => z), xs: ALL, ys: PRINTABLE },
  { name: "(x || y) ?? z", f: (x, y, z) => T.nullish(T.or(x, () => y), () => z), xs: PRINTABLE, ys: PRINTABLE },
  { name: "(x ? y : z) ?? 'F'", f: (x, y, z) => T.nullish(T.cond(x, () => y, () => z), () => "F"), xs: ALL, ys: PRINTABLE },
  { name: "x ?? y ?? z", f: (x, y, z) => T.nullish(T.nullish(x, () => y), () => z), xs: PRINTABLE, ys: PRINTABLE },
  { name: "x && 'T'", f: (x) => T.and(x, () => "T"), xs: ALL, ys: [["missing", MISSING]] },
  { name: "x && y", f: (x, y) => T.and(x, () => y), xs: ALL, ys: PRINTABLE },
  { name: "x ? y : x", f: (x, y) => T.cond(x, () => y, () => x), xs: ALL, ys: PRINTABLE },
  { name: "x || 'F'", f: (x) => T.or(x, () => "F"), xs: PRINTABLE, ys: [["missing", MISSING]] },
  { name: "(x && y) || z", f: (x, y, z) => T.or(T.and(x, () => y), () => z), xs: ALL, ys: PRINTABLE },
];

describe("values built with && || ?? and rendered: the html render, preview() and the engines agree", () => {
  for (const [fw, empty] of [
    ["react", REACT],
    ["vue", VUE],
  ] as const) {
    for (const e of EXPRS) {
      test(`${fw}: ${e.name}`, { timeout: 120_000 }, () => {
        const page = `<div><p style="margin:0">[${markup(e.f(props().x, props().y, props().z), empty)}]</p></div>`;
        let refused = 0;
        for (const [xn, x] of e.xs)
          for (const [yn, y] of e.ys)
            for (const [zn, z] of PRINTABLE) {
              // React shows a list as its items, nothing for a boolean; Vue prints booleans
              const v = e.f(plain(x), plain(y), plain(z));
              if (fw === "vue" && (Array.isArray(v) || (typeof v === "object" && v !== null))) continue;
              const js = `[${empty(v) ? "" : String(v)}]`;
              refused += agrees(page, data({ x, y, z }), js, `${e.name} x=${xn} y=${yn} z=${zn}`);
            }
        // React prints 0 for a falsy 0 the template can't show: those data sets are refused
        if (fw === "react" && /x &&/.test(e.name)) expect(refused).toBeGreaterThan(0);
      });
    }
  }

  test("(x && y) ?? z: a falsy x is the value, not a fallback to z", () => {
    const p = props();
    const v = T.cond(T.nullish(T.and(p.x, () => p.y), () => "F"), () => "YES", () => "NO");
    const page = `<div><p style="margin:0">${markup(v, REACT)}</p></div>`;
    // Handlebars can't tell a falsy x from a missing one: its need refuses them; Liquid reads them
    for (const x of [0, false, ""]) expect(agrees(page, { x, y: "y" }, "NO", `x=${JSON.stringify(x)}`)).toBeLessThanOrEqual(1);
    for (const x of [0, false, ""]) expect(shown(page, { x, y: "y" }, ["liquid"])).toBe("NO");
    expect(agrees(page, { y: "y" }, "YES", "x missing")).toBe(0);
  });

  test("React's x && <A/> refuses x = 0, which React prints and the template can't", () => {
    const page = `<div><p style="margin:0">${markup(T.and(props().n, () => "items"), REACT)}</p></div>`;
    expect(page).toContain('prints-zero="n"');
    expect(() => preview(page, { n: 0 })).toThrow(/n is 0; the component prints "0" for n && …/);
    expect(text(preview(page, { n: 3 }))).toBe("items");
    expect(text(preview(page, { n: false }))).toBe("");
  });
});

const ifPage = (t: string) => `<div><p data-email-if="${t}" style="margin:0">YES</p><p data-email-else style="margin:0">NO</p></div>`;
const SMALL = ALL.filter(([n]) => ["missing", "null", "false", "true", "0", '""', '"a"', "[]", "[1]", "{}"].includes(n));

describe("conditions in loops and chains", () => {
  const loop = (body: string) => `<div data-email-each="items" data-email-as="it">${body}</div>`;
  const pages: Array<[string, string]> = [
    ["field of the loop variable and of the root (@root)", loop(`<p data-email-if="it.x && y" style="margin:0">YES</p><p data-email-else style="margin:0">NO</p>`)],
    ["comparison across the loop", loop(`<p data-email-if="it.x == y" style="margin:0">YES</p><p data-email-else style="margin:0">NO</p>`)],
    ["null test in a loop", loop(`<p data-email-if="it.x == null || y == 'a'" style="margin:0">YES</p><p data-email-else style="margin:0">NO</p>`)],
    ["a loop variable named like a root field", `<div data-email-each="items" data-email-as="y"><p data-email-if="y.x || y" style="margin:0">YES</p><p data-email-else style="margin:0">NO</p></div>`],
    ["nested loops", `<div data-email-each="items" data-email-as="o"><div data-email-each="o.kids" data-email-as="k"><p data-email-if="k == o.x || y" style="margin:0">YES</p><p data-email-else style="margin:0">NO</p></div></div>`],
    ["an unless with an else", `<div><p data-email-unless="x && y == 'a'" style="margin:0">YES</p><p data-email-else style="margin:0">NO</p></div>`],
    ["an else-if chain", `<div><p data-email-if="y == 'q'" style="margin:0">A</p><p data-email-else-if="x || y == null" style="margin:0">B</p><p data-email-else-if="!x && y" style="margin:0">C</p><p data-email-else style="margin:0">D</p></div>`],
  ];
  // the same page decided by hand, from JS on the data
  const js: Record<string, (x: any, y: any) => string> = {
    "field of the loop variable and of the root (@root)": (x, y) => [x, y, undefined].map((ix) => (ix && y ? "YES" : "NO")).join(""),
    "comparison across the loop": (x, y) => [x, y, undefined].map((ix) => (ix === y ? "YES" : "NO")).join(""),
    "null test in a loop": (x, y) => [x, y, undefined].map((ix) => (ix == null || y === "a" ? "YES" : "NO")).join(""),
    "a loop variable named like a root field": (x, y) => [{ x, kids: [x, 1] }, { x: y, kids: [] }, { kids: [y] }].map((it) => (it.x || it ? "YES" : "NO")).join(""),
    "nested loops": (x, y) =>
      [{ x, kids: [x, 1] }, { x: y, kids: [] }, { kids: [y] }]
        .flatMap((o) => o.kids.map((k) => (k === o.x || y ? "YES" : "NO")))
        .join(""),
    "an unless with an else": (x, y) => (!(x && y === "a") ? "YES" : "NO"),
    "an else-if chain": (x, y) => (y === "q" ? "A" : x || y == null ? "B" : !x && y ? "C" : "D"),
  };
  for (const [name, page] of pages) {
    test(name, { timeout: 120_000 }, () => {
      for (const [xn, x] of SMALL)
        for (const [yn, y] of SMALL) {
          const items = [{ x: plain(x), kids: [plain(x), 1] }, { x: plain(y), kids: [] }, { kids: [plain(y)] }];
          const props = data({ items, x, y });
          agrees(page, props, js[name]!(plain(x), plain(y)), `x=${xn} y=${yn}`);
        }
    });
  }
});

describe("names", () => {
  test("Liquid reads .size .first .last off a list, a string or an object without that field: a Liquid need", { timeout: 60_000 }, () => {
    const cases: Array<[string, unknown, boolean]> = [
      ["x.size == 'M'", { size: "M" }, true],
      ["x.size == 'M'", { name: "shirt" }, false],
      ["x.size", { name: "shirt" }, false],
      ["x.size", "abc", false],
      ["x.size", [1, 2], false],
      ["x.size == null", 5, true],
      ["x.first", ["a"], false],
      ["x.first", { first: "F" }, true],
      ["x.last == 'a'", ["a"], false],
    ];
    for (const [c, x, liquidOk] of cases) {
      const page = ifPage(c);
      const refusedOnLiquid = shown(page, { x }, ["liquid"]) === "refused";
      expect(refusedOnLiquid, `${c} ${JSON.stringify(x)}`).toBe(!liquidOk);
      agrees(page, { x }, shown(page, { x }, []), `${c} ${JSON.stringify(x)}`);
    }
    // a field printed off a list too
    expect(() => preview(`<p>${field("x.first")}</p>`, { x: ["a"] }, { dialects: ["liquid"] })).toThrow(/the field x\.first: x is \["a"\]; the liquid template needs anything but a list/);
    expect(preview(`<p>${field("x.first")}</p>`, { x: ["a"] }, { dialects: ["handlebars"] })).toContain("<p></p>");
  });

  test("keywords, helpers and built-in members are no data path, in any dialect, with a hint", () => {
    for (const c of ["x.true", "x.null", "x.this", "x.undefined", "and", "or.y", "not == 'a'", "contains", "forloop.first", "tablerowloop", "log", "each", "lookup", "x.constructor", "toString", "x.hasOwnProperty"]) {
      const r = parseCond(c, `data-email-if="${c}"`);
      expect(isProblem(r) && r.message, c).toMatch(/not a data path|can't be written/);
      expect(isProblem(r) && r.hint, c).toMatch(/keywords, helpers or built-in object members|Compare a dotted name/);
      for (const d of DIALECTS) expect(compile(ifPage(c), { template: d }).diagnostics.map((x) => x.code), `${c} ${d}`).toContain("E012");
    }
    // a later name may be one Liquid or Handlebars would also read as a word, if it isn't a literal
    for (const c of ["x.empty", "x.else", "x.as", "cart.empty"]) expect(isProblem(parseCond(c, "t")), c).toBe(false);
    // a field and a loop variable follow the same rule
    expect(compile(`<p>${"log"}</p>`, { template: "handlebars" }).diagnostics.map((x) => x.code)).toContain("E012");
    expect(compile(`<div><p data-email-each="items" data-email-as="forloop" style="margin:0">x</p></div>`, { template: "liquid" }).diagnostics.map((x) => x.code)).toContain("E012");
  });

  test("Liquid flags can't hide a data field: a hyphen is in no data path", () => {
    const page = ifPage("x && y || z && w");
    const t = template(page, "liquid");
    expect(t).toContain("{% assign tddr-1 = false %}");
    agrees(page, { tddr_1: true, x: false, z: false }, "NO", "a field named tddr_1");
    agrees(page, { "tddr-1": true, x: false, z: false }, "NO", "a field named tddr-1");
  });

  test("preview reads the data's own fields only", () => {
    expect(preview(`<p>${field("x.a")}</p>`, { x: Object.create({ a: "inherited" }) })).toContain("<p></p>");
    expect(text(preview(ifPage("x.a"), { x: Object.create({ a: 1 }) }))).toBe("NO");
  });
});

describe("literals", () => {
  test("anything a dialect would read as syntax or an escape is refused, in the hint and in a component", () => {
    for (const lit of ["%}", "a}}", "{{a", "{%", "a\\", "a\\b", "\\n", "a\tb", "it's", 'say "hi"', "a<b", "a--b", "x"]) {
      const c = `x == '${lit.replace(/'/g, "\\'")}'`;
      const r = parseCond(c, "t");
      if (!lit.includes("'")) expect(isProblem(r) && r.message, lit).toMatch(/the string holds|unexpected/);
      expect(() => T.eq(props().x, lit), lit).toThrow(/a template comparison can't hold that/);
    }
  });

  test("ordinary text survives every dialect exactly", { timeout: 60_000 }, () => {
    for (const lit of ["a b", "  a  ", "é", "${x}", "@root", "a&b", "-", "a-b", "—", "%", "{", "}", "a}", "x.y"]) {
      const page = ifPage(`x == '${lit.replace(/&/g, "&amp;")}'`);
      for (const x of [lit, "zz", MISSING]) agrees(page, data({ x }), x === lit ? "YES" : "NO", `${JSON.stringify(lit)} x=${String(x)}`);
    }
  });

  test("numbers are written so they read back exactly, or refused", () => {
    expect(T.condText(T.condOf(T.eq(props().x, -0)))).toBe("x == 0");
    expect(() => T.eq(props().x, 1e-7)).toThrow(/plain number/);
    expect(() => T.eq(props().x, 2 ** 53)).toThrow(/too large/);
    const r = parseCond("x == 0.1000000000000000055511", "t");
    expect(isProblem(r) && r.message).toMatch(/has more digits than a number holds exactly/);
  });
});

describe("the writers fail loudly on a condition they can't place", () => {
  test("a marker with a reserved name is left out with a W006, never written", () => {
    const report: string[] = [];
    const html = `${blockOpen({ op: "if", when: { op: "truthy", path: "a" } })}x${blockClose("if")}`.replace("tddr:if a", "tddr:if x.true");
    expect(writeTemplate(html, "handlebars", (p) => report.push(p.code))).toBe("x");
    expect(report[0]).toBe("W006");
  });
});

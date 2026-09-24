import { describe, expect, test } from "vitest";
import { codesOf, styledDocFrom, testCtx } from "../helpers/index.ts";
import { DESKTOP, type Env, type StyledElement } from "../../src/style/types.ts";

const env = (o: Partial<Env>): Env => ({ ...DESKTOP, ...o });

const find = (n: StyledElement, tag: string): StyledElement | undefined =>
  n.tag === tag ? n : n.children.flatMap((c) => (c.type === "element" ? [find(c, tag)] : [])).find(Boolean);

const compile = (css: string, e: Env = DESKTOP, body = '<p class="b">x</p>') => {
  const ctx = testCtx();
  const doc = styledDocFrom(`<style>${css}</style>${body}`, ctx, e);
  return { ctx, doc, color: find(doc.body, body.includes("<a") ? "a" : "p")?.style["color"] };
};

describe("@media against an env", () => {
  test("max-width rules apply at or below the viewport, min-width at or above", () => {
    const css = "p{color:black} @media (max-width:600px){p{color:red}} @media (min-width:700px){p{color:blue}}";
    expect(compile(css, DESKTOP).color).toBe("blue");
    expect(compile(css, env({ viewport: 600 })).color).toBe("red");
    expect(compile(css, env({ viewport: 650 })).color).toBe("black");
    expect(compile(css, env({ viewport: 700 })).color).toBe("blue");
  });

  test("supported queries are silent in every env", () => {
    const css = "@media (max-width:600px){p{color:red}} @media (prefers-color-scheme:dark){p{color:white}} @media screen and (min-width:300px){p{margin:0}}";
    for (const e of [DESKTOP, env({ viewport: 400 }), env({ dark: true })]) expect(codesOf(compile(css, e).ctx)).toEqual([]);
  });

  test("rules inside cascade in source order", () => {
    const css = "@media (max-width:600px){p{color:red}} p{color:green} @media (max-width:600px){p{color:blue}}";
    expect(compile(css, env({ viewport: 500 })).color).toBe("blue");
    expect(compile("@media (max-width:600px){p{color:red}} p{color:green}", env({ viewport: 500 })).color).toBe("green");
  });

  test("dark rules apply only when dark", () => {
    const css = "p{color:black} @media (prefers-color-scheme:dark){p{color:white}}";
    expect(compile(css, env({ dark: true })).color).toBe("white");
    expect(compile(css, DESKTOP).color).toBe("black");
  });

  test("nested @media combine with and", () => {
    const css = "@media (max-width:600px){ @media (min-width:400px){ p{color:red} } } @layer a{ @media (max-width:300px){ p{margin:0} } }";
    expect(compile(css, env({ viewport: 500 })).color).toBe("red");
    expect(compile(css, env({ viewport: 350 })).color).not.toBe("red");
    expect(compile(css, env({ viewport: 300 })).color).not.toBe("red");
    expect(compile(css, env({ viewport: 700 })).color).not.toBe("red");
    const inRule = "p{ color:black; @media (max-width:600px){ color:red } }";
    expect(compile(inRule, env({ viewport: 500 })).color).toBe("red");
    expect(compile(inRule, DESKTOP).color).toBe("black");
  });

  test("unsupported features warn in any env and never apply", () => {
    for (const q of ["(orientation: landscape)", "(min-height: 400px)", "(hover: hover)", "(prefers-reduced-motion: reduce)", "(min-resolution: 2dppx)"]) {
      for (const e of [DESKTOP, env({ viewport: 400, dark: true })]) {
        const r = compile(`p{color:black} @media ${q}{p{color:red}}`, e);
        expect(r.color, q).toBe("black");
        const d = r.ctx.diagnostics.list();
        expect(d.map((x) => x.code), q).toEqual(["W001"]);
        expect(d[0]?.message, q).toContain(q);
      }
    }
  });

  test("width with prefers-color-scheme in one query warns, @container still does", () => {
    const r = compile("@media (max-width:600px) and (prefers-color-scheme:dark){p{color:red}}", env({ viewport: 500, dark: true }));
    expect(codesOf(r.ctx)).toEqual(["W001"]);
    expect(r.color).not.toBe("red");
    expect(codesOf(compile("@container (min-width:100px){p{color:red}}").ctx)).toEqual(["W001"]);
  });

  test("width nested with prefers-color-scheme warns, either order, in every env", () => {
    const nests = [
      "@media (prefers-color-scheme:dark){ @media (max-width:600px){p{color:red}} }",
      "@media (max-width:600px){ @media (prefers-color-scheme:dark){p{color:red}} }",
    ];
    for (const css of nests) {
      for (const e of [DESKTOP, env({ viewport: 500 }), env({ viewport: 500, dark: true })]) {
        const r = compile(`p{color:black} ${css}`, e);
        expect(codesOf(r.ctx).filter((c) => c === "W001")).toHaveLength(1);
        expect(r.ctx.diagnostics.list()[0]?.message).toContain("width query");
        expect(r.color).toBe("black");
      }
      expect(compile(css).doc.conditions.dark).toBe(false);
    }
    expect(compile(nests[0]!).doc.conditions.ranges).toEqual([]);
    expect(compile(nests[1]!).doc.conditions.ranges).toEqual([{ min: 0, max: 600 }]);
  });

  test("one unsupported query in a comma list warns once and leaves the rest", () => {
    const r = compile("p{color:black} @media (orientation:landscape), (max-width:600px){p{color:red}}", env({ viewport: 500 }));
    const d = r.ctx.diagnostics.list();
    expect(d.map((x) => x.code)).toEqual(["W001"]);
    expect(d[0]?.message).toContain("(orientation:landscape)");
    expect(r.color).toBe("red");
    expect(r.doc.conditions.ranges).toEqual([{ min: 0, max: 600 }]);
  });

  test("print and speech never match, without a warning", () => {
    const r = compile("@media print{p{color:red}} @media speech{p{color:red}}", DESKTOP);
    expect(codesOf(r.ctx)).toEqual([]);
    expect(r.color).not.toBe("red");
  });
});

describe(":hover against an env", () => {
  const a = '<a href="#" class="cta">x</a>';

  test("a subject :hover applies only with hover, and is silent", () => {
    const css = "a{color:black} a.cta:hover{color:red}";
    expect(compile(css, DESKTOP, a).color).toBe("black");
    expect(compile(css, env({ hover: true }), a).color).toBe("red");
    expect(codesOf(compile(css, DESKTOP, a).ctx)).toEqual([]);
    expect(codesOf(compile(css, env({ hover: true }), a).ctx)).toEqual([]);
  });

  test("a descendant path to the subject works", () => {
    const body = `<nav class="nav">${a}</nav>`;
    expect(compile(".nav a.cta:hover{color:red}", env({ hover: true }), body).color).toBe("red");
    expect(compile(":hover.cta{color:red}", env({ hover: true }), body).color).toBe("red");
  });

  test(":hover counts as a class for specificity", () => {
    const css = "a.cta{color:blue} a:hover{color:red}";
    expect(compile(css, env({ hover: true }), a).color).toBe("red");
    expect(compile("a:hover{color:red} a.cta{color:blue}", env({ hover: true }), a).color).toBe("blue");
    expect(compile("a:hover{color:red} .cta.cta{color:blue}", env({ hover: true }), a).color).toBe("blue");
    expect(compile("a:hover{color:red} .cta{color:blue}", env({ hover: true }), a).color).toBe("red");
    expect(compile("a{color:blue} a:hover{color:red}", env({ hover: true }), a).color).toBe("red");
    expect(compile("a:hover{color:red} a{color:blue}", env({ hover: true }), a).color).toBe("red");
  });

  test("a list is handled per item", () => {
    const css = "a:hover, a:focus{color:red}";
    const r = compile(css, env({ hover: true }), a);
    expect(r.color).toBe("red");
    expect(codesOf(r.ctx)).toEqual(["W001"]);
  });

  test(":hover elsewhere keeps W001 and never matches", () => {
    const body = `<div class="card">${a}</div>`;
    for (const e of [DESKTOP, env({ hover: true })]) {
      const r = compile(".card:hover a{color:red}", e, body);
      expect(codesOf(r.ctx)).toEqual(["W001"]);
      expect(r.color).not.toBe("red");
    }
    const pe = compile("a:hover::before{content:'x';color:red}", env({ hover: true }), a);
    expect(codesOf(pe.ctx)).toEqual(["W001"]);
    expect(codesOf(compile(".nope:hover{color:red}", env({ hover: true }), a).ctx)).toEqual([]);
  });

  test("a subject :hover inside a width or scheme query warns and never applies", () => {
    for (const q of ["(max-width:600px)", "(prefers-color-scheme:dark)"]) {
      for (const e of [DESKTOP, env({ viewport: 500, dark: true, hover: true })]) {
        const r = compile(`a{color:black} @media ${q}{ a:hover{color:red} }`, e, a);
        expect(codesOf(r.ctx)).toEqual(["W001"]);
        expect(r.color).toBe("black");
        expect(r.doc.conditions.hover).toBe(false);
      }
    }
  });

  test("a width or scheme @media nested in a subject :hover warns once and never applies", () => {
    const cases: Array<[string, Partial<Env>]> = [
      ["a:hover{ @media (max-width:600px){ color:red } }", { viewport: 375, hover: true }],
      [".btn:hover{ @media (prefers-color-scheme: dark){ color:red } }", { dark: true, hover: true }],
    ];
    for (const [css, o] of cases) {
      const body = '<a class="btn">x</a>';
      const d = compile(css, DESKTOP, body);
      expect(codesOf(d.ctx)).toEqual(["W001"]);
      expect(d.doc.conditions).toEqual({ ranges: [], dark: false, hover: false });
      const r = compile(css, env(o), body);
      expect(r.color).not.toBe("red");
      expect(codesOf(r.ctx)).toEqual(["W001"]);
    }
  });

  test("a nested media in a hover that lands on nothing is silent", () => {
    expect(codesOf(compile(".nope:hover{ @media (max-width:600px){ color:red } }", DESKTOP, a).ctx)).toEqual([]);
  });

  test("a plain @media in a subject :hover still applies", () => {
    expect(compile("a:hover{ @media screen{ color:red } }", env({ hover: true }), a).color).toBe("red");
  });

  test("an invalid subject :hover selector reports W002 in DESKTOP too", () => {
    expect(codesOf(compile("a:hover:nth-child(foo){color:red}", DESKTOP, a).ctx)).toEqual(["W002"]);
  });

  test("nested &:hover is a subject hover", () => {
    expect(compile("a.cta{ color:black; &:hover{ color:red } }", env({ hover: true }), a).color).toBe("red");
    expect(compile("a.cta{ color:black; &:hover{ color:red } }", DESKTOP, a).color).toBe("black");
  });
});

describe("@media edge cases", () => {
  test("an empty prelude matches everything", () => {
    const r = compile("@media { p{color:red} }");
    expect(r.color).toBe("red");
    expect(codesOf(r.ctx)).toEqual([]);
  });

  test("a nested clash in a comma list warns once", () => {
    const r = compile("@media (prefers-color-scheme: dark){ @media (max-width:600px), (max-width:400px){ p{color:red} } }");
    expect(codesOf(r.ctx)).toEqual(["W001"]);
  });
});

describe("hover-rule-cta", () => {
  const css = ".cta { background-color: #2563eb; } .cta:hover { background-color: #1d4ed8; }";
  const body = '<p>t</p><a class="cta">x</a>';
  test("the darker background applies to .cta only, only with hover", () => {
    const bg = (e: Env, tag: string) => find(compile(css, e, body).doc.body, tag)?.style["background-color"];
    expect(bg(env({ hover: true }), "a")).toBe("#1d4ed8");
    expect(bg(env({ hover: true }), "p")).toBeUndefined();
    expect(bg(DESKTOP, "a")).toBe("#2563eb");
  });
});

describe("conditions", () => {
  const cond = (css: string, body?: string) => compile(css, DESKTOP, body).doc.conditions;

  test("ranges", () => {
    expect(cond("@media (max-width:600px){p{color:red}}").ranges).toEqual([{ min: 0, max: 600 }]);
    expect(cond("@media (max-width:600px){p{color:red}} @media (max-width:400px){p{color:red}}").ranges).toEqual([
      { min: 401, max: 600 },
      { min: 0, max: 400 },
    ]);
    expect(cond("@media (min-width:600px){p{color:red}}").ranges).toEqual([{ min: 0, max: 599 }]);
    expect(cond("p{color:red}").ranges).toEqual([]);
  });

  test("unsupported queries add no edges", () => {
    expect(cond("@media (orientation:landscape) and (max-width:500px){p{color:red}} @media print and (max-width:300px){p{color:red}}").ranges).toEqual([]);
  });

  test("dark needs a supported query that holds a rule", () => {
    expect(cond("@media (prefers-color-scheme:dark){p{color:white}}").dark).toBe(true);
    expect(cond("@media not (prefers-color-scheme:light){p{color:white}}").dark).toBe(true);
    expect(cond("@media (prefers-color-scheme:light){p{color:white}}").dark).toBe(false);
    expect(cond("@media (prefers-color-scheme:dark){}").dark).toBe(false);
    expect(cond("@media (prefers-color-scheme:dark) and (max-width:300px){p{color:white}}").dark).toBe(false);
    expect(cond("@media (prefers-color-scheme:dark){ @media (max-width:300px){p{color:white}} }").dark).toBe(false);
  });

  test("hover is any subject :hover in a rule", () => {
    expect(cond("a:hover{color:red}", "<a>x</a>").hover).toBe(true);
    expect(cond(".card:hover a{color:red}", "<a>x</a>").hover).toBe(false);
    expect(cond("a:focus{color:red}", "<a>x</a>").hover).toBe(false);
  });

  test("an @media that can never match feeds no conditions", () => {
    expect(cond("@media print { @media (max-width:600px){ p{color:red} } }").ranges).toEqual([]);
    expect(codesOf(compile("@media print { @media (max-width:600px){ p{color:red} } }").ctx)).toEqual([]);
    expect(cond("@media print { a:hover{color:red} }", "<a>x</a>").hover).toBe(false);
    expect(cond("@media print { @media (prefers-color-scheme:dark){ p{color:red} } }").dark).toBe(false);
  });

  test("a comma list mixing width and scheme", () => {
    const css = "p{color:black} @media (prefers-color-scheme: dark), (max-width:600px){ p{color:red} }";
    expect(compile(css, env({ viewport: 375 })).color).toBe("red");
    expect(compile(css, env({ dark: true })).color).toBe("red");
    expect(compile(css, DESKTOP).color).toBe("black");
    const c = cond(css);
    expect(c.ranges).toEqual([{ min: 0, max: 600 }]);
    expect(c.dark).toBe(true);
  });

  test("the same in every env", () => {
    const css = "@media (max-width:600px){p{color:red}} @media (prefers-color-scheme:dark){p{color:white}} p:hover{color:blue}";
    const want = cond(css);
    for (const e of [env({ viewport: 400 }), env({ dark: true }), env({ hover: true })]) {
      expect(compile(css, e).doc.conditions).toEqual(want);
    }
  });

  test("fonts stay empty", () => {
    expect(compile("p{color:red}").doc.fonts).toEqual({ imports: [], faces: [] });
  });
});

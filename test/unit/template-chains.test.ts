import { describe, expect, test } from "vitest";
import { compile, field, preview } from "../../src/index.ts";
import { blockClose, blockOpen } from "../../src/template/tokens.ts";
import { parseCond } from "../../src/template/cond.ts";
import { writeTemplate } from "../../src/template/write.ts";
import type { Cond } from "../../src/ir/index.ts";
import { expand } from "../harness/template-fixture.ts";

const both = ["handlebars", "liquid"] as const;
const cond = (s: string): Cond => parseCond(s, "test") as Cond;
const chain = (branches: string[], otherwise?: string): string =>
  branches.map((c, i) => `${blockOpen({ op: i ? "elseif" : "if", when: cond(c) })}[${i}]`).join("") + (otherwise ? `${blockOpen({ op: "else" })}[${otherwise}]` : "") + blockClose("if");

// what JS treats as false and true besides booleans; [] is left out, it is true in JS but false in
// Handlebars, a data need of that dialect (template-semantics.test.ts covers it)
const FALSY = [false, "", 0, null];
const TRUTHY = [true, "x", [1], {}];

// every combination of four conditions and two strings, as booleans and again as other values
const worlds = (): Record<string, unknown>[] => {
  const out: Record<string, unknown>[] = [];
  for (let bits = 0; bits < 64; bits++) {
    const s = bits & 16 ? "x" : "y";
    const t = bits & 32 ? "x" : "z";
    out.push({ a: !!(bits & 1), b: !!(bits & 2), c: !!(bits & 4), d: !!(bits & 8), s, t });
    const v = (bit: number, k: number) => (bits & bit ? TRUTHY : FALSY)[(bits + k) % 4];
    out.push({ a: v(1, 0), b: v(2, 1), c: v(4, 2), d: v(8, 3), s, t });
  }
  return out;
};

// preview of the same chain written as hints decides it the way the source shows it
const reference = (branches: string[], otherwise: string | undefined, props: Record<string, unknown>): string => {
  const els = branches.map((c, i) => `<i ${i ? "data-email-else-if" : "data-email-if"}="${c}">[${i}]</i>`).join("") + (otherwise ? `<i data-email-else>[${otherwise}]</i>` : "");
  return (preview(`<p>${els}</p>`, props).match(/\[\w+\]/g) ?? []).join("");
};

describe("writers lower every condition correctly (real engines)", () => {
  const cases: Array<[string[], string?]> = [
    [["a"], "e"],
    [["!a"], "e"],
    [["a && b"]],
    [["a || b"], "e"],
    [["!(a && b)"]],
    [["a && b || c"], "e"],
    [["a || b && c"]],
    [["(a || b) && c"], "e"],
    [["(a || b) && (c || d)"], "e"],
    [["!a && b"], "e"],
    [["!a || !b"]],
    [["a && !(b || c)"], "e"],
    [["s == 'x' && a"], "e"],
    [["s != 'x' || !a"], "e"],
    [["s == t || a && b"], "e"],
    [["!(s == t)"], "e"],
    [["a", "b", "s == 'x'"], "e"],
    [["!a", "(b || c) && d", "s != t"], "e"],
    [["a && b", "a || c", "!d"]],
    [["s == 'x'", "t == 'x'"], "e"],
  ];
  for (const [branches, otherwise] of cases) {
    test(`${branches.join(" / ")}${otherwise ? " / else" : ""}`, () => {
      const html = chain(branches, otherwise);
      for (const d of both) {
        const tpl = writeTemplate(html, d);
        for (const w of worlds()) {
          const want = reference(branches, otherwise, w);
          const got = expand(tpl, d, w).replace(/<[^>]*>/g, "");
          expect(got, `${d} ${JSON.stringify(w)}\n${tpl}`).toBe(want);
        }
      }
    });
  }
});

describe("writer output", () => {
  test("handlebars: else, else if for plain paths, nesting for the rest", () => {
    expect(writeTemplate(chain(["a"], "e"), "handlebars")).toBe("{{#if a}}[0]{{else}}[e]{{/if}}");
    expect(writeTemplate(chain(["a", "b"], "e"), "handlebars")).toBe("{{#if a}}[0]{{else if b}}[1]{{else}}[e]{{/if}}");
    expect(writeTemplate(chain(["a", "s == 'x'"], "e"), "handlebars")).toBe('{{#if a}}[0]{{else}}{{#equals s "x"}}[1]{{else}}[e]{{/equals}}{{/if}}');
    expect(writeTemplate(chain(["a && b"]), "handlebars")).toBe("{{#if a}}{{#if b}}[0]{{/if}}{{/if}}");
    expect(writeTemplate(chain(["a || b"]), "handlebars")).toBe("{{#if a}}[0]{{else}}{{#if b}}[0]{{/if}}{{/if}}");
    expect(writeTemplate(chain(["!a"], "e"), "handlebars")).toBe("{{#unless a}}[0]{{else}}[e]{{/unless}}");
  });

  test("liquid: elsif, and / or inline where right-to-left reading allows, a flag otherwise", () => {
    expect(writeTemplate(chain(["a", "b"], "e"), "liquid")).toBe("{% if a and a != 0 and a != \"\" %}[0]{% elsif b and b != 0 and b != \"\" %}[1]{% else %}[e]{% endif %}");
    expect(writeTemplate(chain(["s == 'x' || t == 'x' && a"]), "liquid")).toBe('{% if s == "x" or t == "x" and a and a != 0 and a != "" %}[0]{% endif %}');
    expect(writeTemplate(chain(["(s == 'x' || t == 'x') && a"]), "liquid")).toBe('{% if a and a != 0 and a != "" and s == "x" or t == "x" %}[0]{% endif %}');
    expect(writeTemplate(chain(["!a"], "e"), "liquid")).toBe("{% unless a and a != 0 and a != \"\" %}[0]{% else %}[e]{% endunless %}");
    expect(writeTemplate(chain(["a || b"]), "liquid")).toBe(
      "{% assign tddr-1 = false %}{% if a and a != 0 and a != \"\" %}{% assign tddr-1 = true %}{% endif %}{% if b and b != 0 and b != \"\" %}{% assign tddr-1 = true %}{% endif %}{% if tddr-1 %}[0]{% endif %}",
    );
  });

  test("inside a loop the paths of every branch go through @root", () => {
    const html = `${blockOpen({ op: "each", path: "items", as: "i" })}${chain(["i.on && vip", "i.code == code"], "e")}${blockClose("each")}`;
    expect(writeTemplate(html, "handlebars")).toBe("{{#each items as |i|}}{{#if i.on}}{{#if @root.vip}}[0]{{else}}{{#equals i.code @root.code}}[1]{{else}}[e]{{/equals}}{{/if}}{{else}}{{#equals i.code @root.code}}[1]{{else}}[e]{{/equals}}{{/if}}{{/each}}");
    expect(writeTemplate(html, "liquid")).toBe("{% for i in items %}{% if i.on and i.on != 0 and i.on != \"\" and vip and vip != 0 and vip != \"\" %}[0]{% elsif i.code == code %}[1]{% else %}[e]{% endif %}{% endfor %}");
  });

  test("an else or elseif marker outside a chain is a bug: W006, left out", () => {
    const report: string[] = [];
    expect(writeTemplate(`a${blockOpen({ op: "else" })}b`, "liquid", (p) => report.push(p.code))).toBe("ab");
    expect(report).toEqual(["W006"]);
  });
});

const hb = (src: string) => compile(src, { template: "handlebars", strict: true });
const lq = (src: string) => compile(src, { template: "liquid", strict: true });
const errors = (r: ReturnType<typeof compile>) => r.diagnostics.filter((d) => d.severity === "error");

describe("else chains in the input", () => {
  test("data-email-else after an if: one chain, both branches in the same slot", () => {
    const r = hb(`<div><div data-email-if="paid" style="padding:4px">P</div>\n  <div data-email-else style="padding:4px">D</div></div>`);
    expect(errors(r)).toEqual([]);
    expect(r.html).toMatch(/\{\{#if paid\}\}\s*<tr>[\s\S]*P[\s\S]*<\/tr>\s*\{\{else\}\}\s*<tr>[\s\S]*D[\s\S]*<\/tr>\s*\{\{\/if\}\}/);
    expect(r.html).not.toContain("data-email");
  });

  test("else-if chains, in both forms and mixed", () => {
    const src = `<div><tddr-if test="a"><p style="margin:0">A</p></tddr-if><p style="margin:0" data-email-else-if="b == 'x'">B</p><tddr-else><p style="margin:0">C</p><p style="margin:0">C2</p></tddr-else></div>`;
    const r = lq(src);
    expect(errors(r)).toEqual([]);
    expect(r.html).toMatch(/\{% if a and a != 0 and a != "" %\}[\s\S]*A[\s\S]*\{% elsif b == "x" %\}[\s\S]*B[\s\S]*\{% else %\}[\s\S]*C[\s\S]*C2[\s\S]*\{% endif %\}/);
    expect(r.html).not.toContain("tddr-");
  });

  test("at text level the markers sit around the elements, the whitespace between them goes", () => {
    const src = `<p style="margin:0">Order <b data-email-if="paid">paid</b>\n <b data-email-else-if="late">late</b> <b data-email-else>open</b>.</p>`;
    expect(hb(src).html).toContain("Order {{#if paid}}<b");
    expect(hb(src).html).toMatch(/paid<\/b>\{\{else if late\}\}<b[^>]*>late<\/b>\{\{else\}\}<b[^>]*>open<\/b>\{\{\/if\}\}\./);
    for (const [props, word] of [[{ paid: true }, "Order paid."], [{ late: true }, "Order late."], [{}, "Order open."]] as const) {
      expect(preview(src, props).replace(/<[^>]*>/g, "")).toBe(word);
      for (const d of both) expect(expand(compile(src, { template: d }).html, d, props).replace(/<[^>]*>/g, ""), d).toContain(word);
    }
  });

  test("<tddr-*> inside text: its children take its place", () => {
    const src = `<p style="margin:0">Hi <tddr-if test="name">${field("name")}</tddr-if><tddr-else>there</tddr-else>!</p>`;
    expect(lq(src).html).toContain('Hi {% if name and name != 0 and name != "" %}{{ name | escape }}{% else %}there{% endif %}!');
    expect(preview(src, {})).toContain(">Hi there!</p>");
    expect(preview(src, { name: "Ann" })).toContain(">Hi Ann!</p>");
  });

  test("a chain alone on its line is a block: an image branch keeps the image rule", () => {
    const r = hb(`<div><img data-email-if="vip" src="https://i.test/a.png" width="100" alt="a"><img data-email-else src="https://i.test/b.png" width="100" alt="b"></div>`);
    expect(errors(r)).toEqual([]);
    expect(r.html).toMatch(/\{\{#if vip\}\}\s*<tr>[\s\S]*a\.png[\s\S]*\{\{else\}\}\s*<tr>[\s\S]*b\.png/);
  });

  test("<tddr-each> repeats its children; one child takes the list itself", () => {
    const r = hb(`<div><tddr-each of="items" as="line"><p style="margin:0">${field("line.name")}</p></tddr-each></div>`);
    expect(errors(r)).toEqual([]);
    expect(r.html).toMatch(/\{\{#each items as \|line\|\}\}\s*<tr>[\s\S]*\{\{line\.name\}\}[\s\S]*<\/tr>\s*\{\{\/each\}\}/);
    expect(preview(`<ul><tddr-each of="xs" as="x"><li>${field("x")}</li></tddr-each></ul>`, { xs: ["1", "2"] })).toContain("<ul><li>1</li><li>2</li></ul>");
  });

  test("a chain in a flex column cell and in a gapped stack: the gap goes inside every branch", () => {
    const r = hb(`<div style="display:flex;flex-direction:column;gap:10px"><p style="margin:0">x</p><p style="margin:0" data-email-if="a">A</p><p style="margin:0" data-email-else>B</p></div>`);
    expect(errors(r)).toEqual([]);
    expect(r.html).toMatch(/\{\{#if a\}\}\s*<tr>\s*<td style="padding:10px 0 0 0;[^"]*">[\s\S]*A[\s\S]*\{\{else\}\}\s*<tr>\s*<td style="padding:10px 0 0 0;/);
  });

  test("on an item of a row it is E012 and lowered without the construct", () => {
    const r = hb(`<div style="display:flex"><div style="width:100px">a</div><tddr-if test="x"><div style="width:100px">b</div></tddr-if><div data-email-else style="width:100px">c</div></div>`);
    const e = errors(r);
    expect(e.map((d) => d.code)).toEqual(["E012"]);
    expect(e[0]?.loc?.line).toBe(1);
    expect(r.html).not.toContain("{{#if");
  });

  test("a dangling else, an else after something else, a bad condition: E012 with a location and hint", () => {
    const r = hb(`<div>\n<p style="margin:0" data-email-else>a</p>\n<p style="margin:0" data-email-if="x">b</p>\n<p style="margin:0">c</p>\n<tddr-else><p style="margin:0">d</p></tddr-else>\n<tddr-if test="a &&"><p style="margin:0">e</p></tddr-if>\n</div>`);
    const e = errors(r);
    expect(e.map((d) => [d.code, d.loc?.line])).toEqual([["E012", 2], ["E012", 5], ["E012", 6]]);
    expect(e[0]?.message).toMatch(/without a data-email-if/);
    expect(e[1]?.message).toMatch(/isn't right after/);
    expect(e[2]?.message).toMatch(/ends too early/);
    for (const d of e) expect(d.hint).toBeTruthy();
    // shown once, as written
    for (const t of ["a", "b", "c", "d", "e"]) expect(r.html).toContain(`>${t}</p>`);
    expect(r.html).not.toContain("{{else");
  });

  test("attributes on a transparent element are E012", () => {
    const r = hb(`<div><tddr-if test="a" class="x"><p style="margin:0">a</p></tddr-if></div>`);
    expect(errors(r).map((d) => d.message)).toEqual(["<tddr-if> class is dropped"]);
  });

  test("an outlook-only branch keeps the conditional inside its branch", () => {
    const r = hb(`<div><p style="margin:0">a</p><div data-email="outlook-only" data-email-if="x">o</div><div data-email-else>p</div></div>`);
    expect(errors(r)).toEqual([]);
    expect(r.html).toMatch(/\{\{#if x\}\}\s*<!--\[if mso\]><tr>[\s\S]*<\/tr><!\[endif\]-->\s*\{\{else\}\}\s*<tr>[\s\S]*p[\s\S]*<\/tr>\s*\{\{\/if\}\}/);
  });

  test("a chain inside a preheader is E012", () => {
    const r = hb(`<div data-email="preheader"><tddr-if test="a">x</tddr-if></div><p style="margin:0">b</p>`);
    expect(errors(r).map((d) => d.code)).toContain("E012");
  });
});

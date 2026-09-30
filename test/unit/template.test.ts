import { describe, expect, test } from "vitest";
import { compile, field, preview, writeString } from "../../src/index.ts";
import { blockClose, blockOpen } from "../../src/template/tokens.ts";
import { writeTemplate } from "../../src/template/write.ts";
import { expand } from "../harness/template-fixture.ts";

describe("dialect writers", () => {
  const body = `<p>${field("order.total")}</p>${blockOpen({ op: "each", path: "order.items", as: "line" })}<li>${field("line.name")} ${field("order.currency")}</li>${blockClose("each")}`;

  test("handlebars: block params, and @root once a loop changes the context", () => {
    expect(writeTemplate(body, "handlebars")).toBe(
      "<p>{{order.total}}</p>{{#each order.items as |line|}}<li>{{line.name}} {{@root.order.currency}}</li>{{/each}}",
    );
  });

  test("liquid: for loops keep the outer scope", () => {
    expect(writeTemplate(body, "liquid")).toBe(
      "<p>{{ order.total | escape }}</p>{% for line in order.items %}<li>{{ line.name | escape }} {{ order.currency | escape }}</li>{% endfor %}",
    );
  });

  test("if and unless, nested in an each", () => {
    const html = `${blockOpen({ op: "each", path: "items", as: "i" })}${blockOpen({ op: "if", when: { op: "truthy", path: "i.sale" } })}S${blockClose("if")}${blockOpen({ op: "if", when: { op: "not", cond: { op: "truthy", path: "paid" } } })}U${blockClose("if")}${blockClose("each")}`;
    expect(writeTemplate(html, "handlebars")).toBe("{{#each items as |i|}}{{#if i.sale}}S{{/if}}{{#unless @root.paid}}U{{/unless}}{{/each}}");
    expect(writeTemplate(html, "liquid")).toBe("{% for i in items %}{% if i.sale and i.sale != 0 and i.sale != \"\" %}S{% endif %}{% unless paid and paid != 0 and paid != \"\" %}U{% endunless %}{% endfor %}");
  });

  test("subject lines", () => {
    expect(writeString(`Order ${field("order.id")} is paid`, "handlebars")).toBe("Order {{order.id}} is paid");
    expect(writeString(`Order ${field("order.id")} is paid`, "liquid")).toBe("Order {{ order.id | escape }} is paid");
  });
});

describe("placeholders through compile", () => {
  test("text, href and the preheader survive lowering", () => {
    const src = `<div data-email="preheader">Paid ${field("order.total")}</div><p style="margin:0">Hi ${field("user.name")}</p><a href="${field("order.url")}" style="display:inline-block;padding:10px 20px;background:#336;color:#fff">View</a>`;
    const { html } = compile(src, { template: "handlebars", strict: false });
    expect(html).toContain("Hi {{user.name}}");
    expect(html).toContain('href="{{order.url}}"');
    expect(html).toContain("Paid {{order.total}}");
    expect(html).not.toMatch(/[]/);
  });

  test("without a dialect it is E014", () => {
    const r = compile(`<p style="margin:0">${field("a")}</p>`);
    expect(r.diagnostics.map((d) => d.code)).toContain("E014");
  });

  test("a placeholder in CSS is E013 with a location", () => {
    const r = compile(`<p style="margin:0">x</p>\n<p style="padding:${field("brand")}">y</p>`, { template: "liquid" });
    const d = r.diagnostics.find((x) => x.code === "E013");
    expect(d?.loc?.line).toBe(2);
  });
});

describe("preview", () => {
  const props = { paid: true, order: { total: "$12.00" }, items: [{ name: "Tea" }, { name: "Cup" }] };
  test("fills placeholders, repeats each, decides if and unless", () => {
    const src = `<ul><li data-email-each="items" data-email-as="x">${field("x.name")} / ${field("order.total")}</li></ul>
<p data-email-if="paid">paid</p><p data-email-unless="paid">due</p><a href="${field("order.total")}">l</a>`;
    const out = preview(src, props);
    expect(out).toContain("<li>Tea / $12.00</li><li>Cup / $12.00</li>");
    expect(out).toContain("<p>paid</p>");
    expect(out).not.toContain("due");
    expect(out).toContain('href="$12.00"');
    expect(out).not.toContain("data-email-");
  });

  // JS semantics: [] is true, so the div shows and repeats nothing; Handlebars would hide it
  test("an empty list is true for if (as in JS) and repeats nothing", () => {
    const src = '<div data-email-if="items"><i data-email-each="items">x</i></div>';
    expect(preview(src, { items: [] }, { dialects: ["liquid"] })).toContain("<div></div>");
    expect(() => preview(src, { items: [] })).toThrow(/items is \[\]; the handlebars template needs anything but an empty list/);
    expect(preview('<div data-email-if="items.length != 0"><i data-email-each="items">x</i></div>', { items: [] })).not.toContain("<div");
  });
});

describe("comparisons", () => {
  const src = `<p data-email-if="tax.exempt == 'Yes'">exempt</p><p data-email-unless="tax.exempt == 'Yes'">taxed</p><p data-email-if="status != 'paid'">due</p>`;

  test("handlebars uses the ESP equals / notEquals helpers", () => {
    const { html } = compile(src, { template: "handlebars" });
    expect(html).toContain('{{#equals tax.exempt "Yes"}}');
    expect(html).toContain('{{#notEquals tax.exempt "Yes"}}');
    expect(html).toContain('{{#notEquals status "paid"}}');
    expect(html).toContain("{{/notEquals}}");
  });

  test("liquid compares inline", () => {
    const { html } = compile(src, { template: "liquid" });
    expect(html).toContain('{% if tax.exempt == "Yes" %}');
    expect(html).toContain('{% unless tax.exempt == "Yes" %}');
    expect(html).toContain('{% if status != "paid" %}');
  });

  test("preview decides them like the ESP", () => {
    const out = preview(src, { tax: { exempt: "Yes" }, status: "paid" });
    expect(out).toContain("exempt");
    expect(out).not.toContain("taxed");
    expect(out).not.toContain("due");
  });

  test("a value that can't sit in a template is E012", () => {
    const r = compile(`<p data-email-if="a == 'x--y'">x</p>`, { template: "liquid" });
    expect(r.diagnostics.map((d) => d.code)).toContain("E012");
  });
});

describe("comparing two fields", () => {
  const src = `<p data-email-if="order.method == user.method">same</p><p data-email-unless="order.method == user.method">differs</p><p data-email-if="a.x != a.y">ne</p>
<ul><li data-email-each="items" data-email-as="i"><b data-email-if="i.code == order.code">hit</b></li></ul>`;

  test("the marker carries the right side without quotes", () => {
    expect(blockOpen({ op: "if", when: { op: "==", left: { path: "a.b" }, right: { path: "c.d" } } })).toBe("<!--tddr:if a.b == c.d-->");
    expect(blockOpen({ op: "if", when: { op: "not", cond: { op: "!=", left: { path: "a" }, right: { path: "b" } } } })).toBe("<!--tddr:if !(a != b)-->");
  });

  test("handlebars: equals / notEquals with two paths, @root inside a loop", () => {
    const { html, diagnostics } = compile(src, { template: "handlebars" });
    expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(html).toContain("{{#equals order.method user.method}}");
    expect(html).toContain("{{#notEquals order.method user.method}}");
    expect(html).toContain("{{#notEquals a.x a.y}}");
    expect(html).toContain("{{#equals i.code @root.order.code}}");
  });

  test("liquid compares inline", () => {
    const { html } = compile(src, { template: "liquid" });
    expect(html).toContain("{% if order.method == user.method %}");
    expect(html).toContain("{% unless order.method == user.method %}");
    expect(html).toContain("{% if a.x != a.y %}");
    expect(html).toContain("{% if i.code == order.code %}");
  });

  test("preview and both engines agree", () => {
    const props = { order: { method: "post", code: "B" }, user: { method: "post" }, a: { x: "1", y: "1" }, items: [{ code: "A" }, { code: "B" }] };
    const out = preview(src, props);
    expect(out).toContain("same");
    expect(out).not.toContain("differs");
    expect(out).not.toContain("ne<");
    expect(out.match(/hit/g)).toHaveLength(1);
    for (const d of both) {
      const html = expand(compile(src, { template: d }).html, d, props);
      expect(html.match(/hit/g), d).toHaveLength(1);
      expect(html, d).toContain("same");
      expect(html, d).not.toContain("differs");
    }
  });

  test("a keyword other than true, false or null on the right, or the element's own loop variable, is E012", () => {
    const codes = (s: string) => compile(s, { template: "liquid" }).diagnostics.filter((d) => d.code === "E012");
    expect(codes(`<p data-email-if="a == true">x</p>`)).toHaveLength(0);
    expect(codes(`<p data-email-if="a == nil">x</p>`)).toHaveLength(1);
    expect(codes(`<p data-email-if="a == empty">x</p>`)).toHaveLength(1);
    const own = codes(`<div><p style="margin:0" data-email-each="items" data-email-as="i" data-email-if="show == i.kind">x</p></div>`);
    expect(own[0]?.hint).toMatch(/child/);
  });
});

const raw = (path: string): string => `\uE000${path}\uE001`;
const both = ["handlebars", "liquid"] as const;

describe("escaping", () => {
  test("both engines escape a field in text and in an attribute", () => {
    const html = `<a href="https://x/${field("sku")}">${field("name")}</a>`;
    for (const d of both) {
      const out = expand(writeTemplate(html, d), d, { sku: 's"3', name: 'A<b>&"' });
      expect(out, d).toMatch(/^<a href="https:\/\/x\/s&(quot|#34);3">A&lt;b&gt;&amp;&(quot|#34);<\/a>$/);
    }
  });

  test("author text that looks like template syntax renders as written", () => {
    const cases = ["{{ not a path }}", "50% {off} {{ }}", "{{{a}}}", "{{{{x", "C:\\{{ a b }}", "a\\\\{{x", "end \\"];
    for (const text of cases) {
      for (const d of both) expect(expand(writeTemplate(`<p>${text}</p>`, d), d, { a: "A", x: "X" }), `${d} ${text}`).toBe(`<p>${text}</p>`);
    }
  });

  test("our own syntax next to author text is not disturbed", () => {
    const html = `<p>{${field("a")}} {{ b }}\\${field("a")}\\</p>${blockOpen({ op: "if", when: { op: "truthy", path: "a" } })}{x${blockClose("if")}`;
    for (const d of both) {
      // what a browser shows: the entities Handlebars needs read as braces
      const out = expand(writeTemplate(html, d), d, { a: "A" }).replace(/&#123;/g, "{").replace(/&#125;/g, "}");
      expect(out, d).toBe("<p>{A} {{ b }}\\A\\</p>{x");
    }
  });
});

describe("field paths", () => {
  test("field() takes dotted names only", () => {
    expect(() => field("a b")).toThrow(/data path/);
    expect(() => field("x}}{{y")).toThrow(/data path/);
    expect(() => field("else")).toThrow(/data path/);
    expect(() => field("this.name")).toThrow(/data path/);
    expect(field("order.total")).toBe(raw("order.total"));
  });

  test("an invalid token in the HTML is E012 and isn't written", () => {
    for (const d of both) {
      const r = compile(`<p style="margin:0">Hi ${raw("x}}{{y")}</p>\n<p style="margin:0">${raw("a b")}</p>`, { template: d });
      const e = r.diagnostics.filter((x) => x.code === "E012");
      expect(e.map((x) => x.loc?.line), d).toEqual([1, 2]);
      expect(e[0]?.hint).toBeTruthy();
      expect(r.html).not.toContain("x}}");
      expect(r.html).not.toContain("a b");
    }
  });

  test("writeString rejects invalid fields and block markers", () => {
    expect(() => writeString(`Hi ${raw("a b")}`, "liquid")).toThrow(/data path/);
    expect(() => writeString(`${blockOpen({ op: "if", when: { op: "truthy", path: "a" } })}x${blockClose("if")}`, "handlebars")).toThrow(/block/);
  });

  test("unbalanced markers are a compiler bug, not an exception", () => {
    const report: string[] = [];
    const out = writeTemplate(`a${blockClose("if")}b${blockOpen({ op: "each", path: "xs" })}c`, "handlebars", (p) => report.push(p.code));
    expect(report).toEqual(["W006", "W006"]);
    expect(out).toBe("ab{{#each xs as |item|}}c{{/each}}");
  });
});

describe("class placeholders", () => {
  test("a class token with a placeholder is kept, unused classes still go", () => {
    for (const d of both) {
      const { html } = compile(`<p style="margin:0">a <span class="badge ${field("tier")}">x</span></p>`, { template: d });
      expect(html, d).toMatch(/<span class="\{\{ ?tier( \| escape)? ?\}\}"/);
    }
  });
});

describe("preheader with template hints", () => {
  test("a hint on or inside a preheader is E012 with a location", () => {
    const src = `<div data-email="preheader" data-email-if="x">Hi</div>\n<div data-email="preheader">A <span data-email-each="xs">b</span></div>\n<p style="margin:0">body</p>`;
    const r = compile(src, { template: "handlebars" });
    const e = r.diagnostics.filter((x) => x.code === "E012");
    expect(e.map((x) => x.loc?.line)).toEqual([1, 2]);
    expect(e[0]?.message).toMatch(/preheader/);
    expect(e[0]?.hint).toMatch(/field/);
  });

  test("a preheader inside a construct is E012 too", () => {
    const r = compile(`<div data-email-if="x"><div data-email="preheader">Hi</div><p style="margin:0">b</p></div>`, { template: "liquid" });
    expect(r.diagnostics.map((x) => x.code)).toContain("E012");
  });
});

describe("each and a condition on one element", () => {
  test("a condition read off the element's own loop variable is E012", () => {
    const r = compile(`<div><p style="margin:0" data-email-each="items" data-email-as="i" data-email-if="i.show">x</p></div>`, { template: "handlebars" });
    const e = r.diagnostics.find((x) => x.code === "E012");
    expect(e?.hint).toMatch(/child/);
    expect(r.html).not.toContain("{{#if");
    expect(r.html).toContain("{{#each items as |i|}}");
  });

  test("the default alias counts, an outer path doesn't", () => {
    const bad = compile(`<div><p style="margin:0" data-email-each="items" data-email-unless="item.hidden">x</p></div>`, { template: "liquid" });
    expect(bad.diagnostics.map((x) => x.code)).toContain("E012");
    const ok = compile(`<div><p style="margin:0" data-email-each="items" data-email-as="i" data-email-if="show">x</p></div>`, { template: "liquid" });
    expect(ok.diagnostics.map((x) => x.code)).not.toContain("E012");
  });
});

describe("preview edge cases", () => {
  test("<template> content is copied per repetition", () => {
    const out = preview(`<template data-email-each="xs" data-email-as="x"><p>${field("x")}</p></template>`, { xs: ["one", "two"] });
    expect(out).toContain("<p>one</p>");
    expect(out).toContain("<p>two</p>");
  });

  // the engines repeat a string or an object in their own ways, JS's .map fails: a data need
  test("each over anything but a list, null or missing is refused", () => {
    const src = `<i data-email-each="xs">x</i>`;
    expect(() => preview(src, { xs: "abc" })).toThrow(/the loop over xs: xs is "abc"; a loop needs a list, null or missing there/);
    expect(() => preview(src, { xs: { a: 1 } })).toThrow(/TemplateDataError|a loop needs/);
    expect(preview(src, { xs: null })).not.toContain("<i>");
    expect(preview(src, {})).not.toContain("<i>");
  });

  test("an invalid each renders once, like compile", () => {
    expect(preview(`<i data-email-each="a[0]">x</i>`, { a: [1, 2] }).match(/<i>x<\/i>/g)).toHaveLength(1);
    expect(preview(`<i data-email-each="xs" data-email-as="my x">x</i>`, { xs: [1, 2] }).match(/<i>x<\/i>/g)).toHaveLength(1);
  });
});

describe("E013 lint", () => {
  test("only inside tags, quoted or not", () => {
    const codesOf = (src: string) => compile(src, { template: "handlebars" }).diagnostics.map((d) => d.code);
    expect(codesOf(`<p style="margin:0">write style="${field("a")}" here</p>`)).not.toContain("E013");
    expect(codesOf(`<p style=padding:${field("a")}>x</p>`)).toContain("E013");
    expect(codesOf(`<p title='style="${field("a")}"' style="margin:0">x</p>`)).not.toContain("E013");
  });
});

describe("placeholders td;dr would drop", () => {
  const diag = (src: string, css?: string[]) => compile(src, { template: "handlebars", ...(css ? { css } : {}) }).diagnostics;

  test("a presentational attribute of a lowered box is E013, any other attribute E012", () => {
    const ds = diag(`<div style="padding:4px">\n<div bgcolor="${field("brand.bg")}" style="padding:4px"><p style="margin:0">x</p></div>\n<div title="${field("a")}"><p style="margin:0">y</p></div>\n<p style="margin:0">z <span data-id="${field("b")}">w</span></p></div>`);
    expect(ds.filter((d) => d.code === "E013").map((d) => d.loc?.line)).toEqual([2]);
    expect(ds.filter((d) => d.code === "E012").map((d) => d.loc?.line)).toEqual([3, 4]);
    expect(ds.find((d) => d.code === "E012")?.hint).toBeTruthy();
  });

  test("attributes that are kept say nothing", () => {
    const ds = diag(`<div><img src="https://i.test/${field("a")}" alt="${field("b")}" width="100" height="40" style="display:block"><p style="margin:0"><a href="${field("c")}" title="${field("d")}">l</a></p></div>`);
    expect(ds.filter((d) => d.severity === "error")).toEqual([]);
  });

  test("a placeholder in an extra stylesheet is E013", () => {
    expect(diag(`<p style="margin:0">x</p>`, [`p { color: ${field("c")}; }`]).map((d) => d.code)).toContain("E013");
  });
});

describe("ESP syntax written by hand", () => {
  test("block syntax of either dialect in text or an attribute is E012, and is written as text", () => {
    const src = `<p style="margin:0"><a href="{{#if x}}a{{else}}b{{/if}}">l</a></p>\n<p style="margin:0">{% if x %}y{% endif %}</p>`;
    for (const d of both) {
      const r = compile(src, { template: d });
      const e = r.diagnostics.filter((x) => x.code === "E012");
      expect(e.map((x) => x.loc?.line), d).toEqual([1, 2]);
      expect(e[0]?.hint).toMatch(/data-email-if/);
      expect(expand(r.html, d, { x: true })).toContain("{% if x %}y{% endif %}");
    }
  });
});

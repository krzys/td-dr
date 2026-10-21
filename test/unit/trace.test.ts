import { describe, expect, test } from "vitest";
import { compile } from "../../src/index.ts";
import { fieldTable, findField, ownsFields, scanTags, traceSources } from "../../adapters/dev/ui/link.js";
import { startTags } from "../../src/template/tags.ts";
import { fixtureOptions, isActive, loadFixtures } from "../harness/fixture-runner.ts";
import { templateDialects, tokenize } from "../harness/template-fixture.ts";

// offsets of the start tags of a text by (line, col), both 1-based like SrcLoc
const tagAtLoc = (text: string, line: number, col: number): string | undefined => {
  const at = text.split("\n").slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0) + col - 1;
  const t = startTags(text).find((x) => x.start === at);
  return t?.tag;
};

describe("compile trace", () => {
  const input = [
    "<style>.row{display:flex;gap:10px}.col{display:flex;flex-direction:column}</style>",
    '<div class="col" style="max-width:600px;margin:0 auto">',
    "  <p>Hello <b>there</b></p>",
    '  <img src="https://x.test/a.png" width="40" height="40" alt="">',
    '  <div class="row"><div class="col"><p>a</p></div><div class="col"><p>b</p></div></div>',
    "</div>",
  ].join("\n");
  const out = compile(input, { trace: true });
  const tags = startTags(out.html);
  const entry = (tag: string, nth = 0) => out.trace![tags.flatMap((t, i) => (t.tag === tag ? [i] : []))[nth]!];

  test("has one entry per start tag and leaves html and diagnostics alone", () => {
    expect(out.trace).toHaveLength(tags.length);
    const plain = compile(input);
    expect(plain.trace).toBeUndefined();
    expect(out.html).toBe(plain.html);
    expect(out.diagnostics).toEqual(plain.diagnostics);
    expect(out.html).not.toContain("tddr\u{F8F0}src");
  });

  test("a passthrough element and its nested element point at their own tags", () => {
    expect(entry("p")).toEqual({ line: 3, col: 3 });
    expect(entry("b")).toEqual({ line: 3, col: 12 });
  });

  test("an image points at the img", () => {
    expect(entry("img")).toEqual({ line: 4, col: 3 });
  });

  test("the cell of a flex column points at the column", () => {
    const cells = tags.flatMap((t, i) => (t.tag === "td" && out.trace![i]?.line === 5 ? [out.trace![i]!] : []));
    expect(cells.map((c) => tagAtLoc(input, c.line, c.col))).toContain("div");
    expect(cells.some((c) => c.col === 20)).toBe(true);
  });

  test("shell and wrapper tags have no entry", () => {
    expect(out.trace![0]).toBeUndefined();
    expect(tags[0]!.tag).toBe("html");
    const trs = tags.flatMap((t, i) => (t.tag === "tr" ? [out.trace![i]] : []));
    expect(trs.every((e) => e === undefined)).toBe(true);
  });

  test("an author attribute named like the old marker survives, with trace on or off", () => {
    const src = '<p tddr-src="1:1">x</p>';
    const plain = compile(src);
    expect(compile(src, { trace: true }).html).toBe(plain.html);
  });

  test("a marker inside an Outlook conditional gets no entry and is stripped", () => {
    const o = compile('<div style="max-width:300px;margin:0 auto"><p>x</p></div>', { trace: true, width: 600 });
    expect(o.html).toContain("<!--[if mso]>");
    expect(o.html).not.toContain("tddr\u{F8F0}src");
    expect(o.trace).toHaveLength(startTags(o.html).length);
  });

  test("a template: each and if bodies are traced in the written template", () => {
    const src = [
      '<div data-email-each="items" data-email-as="it"><p>${it.name}</p></div>',
      '<p data-email-if="show">shown</p>',
    ]
      .join("\n")
      .replace("${it.name}", tokenize("{{it.name}}"));
    const o = compile(src, { trace: true, template: "handlebars" });
    expect(o.html).toContain("{{#each items as |it|}}");
    const ts = startTags(o.html);
    expect(o.trace).toHaveLength(ts.length);
    const ps = ts.flatMap((t, i) => (t.tag === "p" ? [o.trace![i]] : []));
    expect(ps).toEqual([
      { line: 1, col: 49 },
      { line: 2, col: 1 },
    ]);
  });

  test("a loop in liquid keeps its entries too", () => {
    const o = compile('<div data-email-each="items"><p>x</p></div>', { trace: true, template: "liquid" });
    expect(o.html).toContain("{% for item in items %}");
    expect(o.trace).toHaveLength(startTags(o.html).length);
    expect(o.trace!.some((e) => e?.line === 1 && e.col === 30)).toBe(true);
  });
});

describe("a padded block holding text", () => {
  const wrap = (inner: string) => `<div style="max-width:600px;margin:0 auto">${inner}</div>`;
  const cases: Array<[string, string | undefined]> = [
    ["html", undefined],
    ["handlebars", "handlebars"],
  ];

  test.each(cases)("a text div's cell points at the div, %s", (_n, template) => {
    const src = wrap('<div style="padding:12px 24px">Plain text</div>');
    const o = compile(src, { trace: true, ...(template && { template: template as "handlebars" }) });
    const ts = startTags(o.html);
    const cell = ts.flatMap((t, i) => (t.tag === "td" && o.html.slice(t.start, t.end).includes("padding:12px 24px") ? [o.trace![i]] : []));
    expect(cell).toHaveLength(1);
    expect(tagAtLoc(src, cell[0]!.line, cell[0]!.col)).toBe("div");
  });

  test("also under data-email-if", () => {
    const src = wrap('<div data-email-if="show" style="padding:12px 24px">Plain text</div>');
    const o = compile(src, { trace: true, template: "handlebars" });
    const ts = startTags(o.html);
    const cell = ts.flatMap((t, i) => (t.tag === "td" && o.html.slice(t.start, t.end).includes("padding:12px 24px") ? [o.trace![i]] : []));
    expect(cell.every((c) => c && tagAtLoc(src, c.line, c.col) === "div")).toBe(true);
    expect(cell.length).toBeGreaterThan(0);
  });

  test("mixed text keeps the cell, the b and the field after it", () => {
    const src = wrap(`<div style="padding:12px 24px"><b>bold</b> tail ${tokenize("{{c}}")}</div>`);
    const o = compile(src, { trace: true, template: "handlebars" });
    const ts = startTags(o.html);
    const at = (tag: string) => ts.flatMap((t, i) => (t.tag === tag && o.trace![i] ? [o.trace![i]!] : []));
    expect(at("td").map((c) => tagAtLoc(src, c.line, c.col))).toContain("div");
    expect(at("b").map((c) => tagAtLoc(src, c.line, c.col))).toEqual(["b"]);
    const sources = traceSources(o.trace!, scanTags(src));
    const tpl = fieldTable(o.html, scanTags(o.html), "tpl", (t) => sources[t]!);
    const own = fieldTable(src, scanTags(src), "raw", (i) => i);
    expect(tpl).toHaveLength(1);
    expect(findField(own, tpl[0]!.s, tpl[0]!.k)).toBeDefined();
  });
});

describe("trace over the fixtures", () => {
  for (const f of loadFixtures().filter(isActive)) {
    const dialects = templateDialects(f);
    for (const dialect of dialects ?? [undefined]) {
      test(`${f.feature}/${f.name}${dialect ? ` [${dialect}]` : ""}`, () => {
        const input = dialect ? tokenize(f.input) : f.input;
        const o = { ...fixtureOptions(f), ...(dialect ? { template: dialect } : {}) };
        const plain = compile(input, o);
        const traced = compile(input, { ...o, trace: true });
        expect(traced.html).toBe(plain.html);
        expect(traced.diagnostics).toEqual(plain.diagnostics);
        expect(traced.html).not.toContain("tddr\u{F8F0}src");
        const trace = traced.trace!;
        expect(trace).toHaveLength(startTags(traced.html).length);
        // every entry names a start tag of the input
        for (const e of trace) if (e) expect(tagAtLoc(input, e.line, e.col), JSON.stringify(e)).toBeDefined();
      });
    }
  }
  // a click on a text field of the template can only find its source if the table pairs them
  const pathOf = (inner: string): string => inner.replace(/^\{\{|\}\}$/g, "").split("|")[0]!.trim().replace(/^(@root\.|this\.)/, "");
  for (const f of loadFixtures().filter(isActive)) {
    for (const dialect of templateDialects(f) ?? []) {
      test(`fields resolve: ${f.feature}/${f.name} [${dialect}]`, () => {
        const input = tokenize(f.input);
        const o = compile(input, { ...fixtureOptions(f), template: dialect, trace: true });
        const sources = traceSources(o.trace!, scanTags(input));
        const mine = fieldTable(o.html, scanTags(o.html), "tpl", (t) => sources[t]!);
        const own = fieldTable(input, scanTags(input), "raw", ownsFields(scanTags(input)));
        for (const t of mine) {
          const s = findField(own, t.s, t.k);
          const tpl = o.html.slice(t.start, t.end);
          expect(s, `${tpl} at ${t.start}`).toBeDefined();
          expect(pathOf(tpl)).toBe(input.slice(s!.start, s!.end).replace(/[\uE000-\uF8FF]/g, ""));
        }
      });
    }
  }
});

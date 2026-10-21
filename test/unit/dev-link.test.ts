import { describe, expect, test } from "vitest";
import {
  align,
  describeFrame,
  fieldTable,
  findField,
  firstTags,
  lineCol,
  mapped,
  nearestWith,
  ownsFields,
  TPL_FIELD,
  pickCopy,
  pickTag,
  scanTags,
  tagAt,
  traceSources,
  type Doc,
  type El,
} from "../../adapters/dev/ui/link.js";
import { compile } from "../../src/index.ts";
import { TPL_FIELD as RENDER_FIELD } from "../../adapters/vite/render.ts";
import { startTags } from "../../src/template/tags.ts";
import { loadFixtures, isActive } from "../harness/fixture-runner.ts";

const text = [
  "<!doctype html>",
  "<html><head><style>a > b { color: red }</style></head>",
  '<body><!--[if mso]><table><tr><td><![endif]-->',
  '<table role="presentation"><tr><td title="a > b"',
  '  class="x">hi</td></tr></table>',
  "</body></html>",
].join("\n");

describe("scanTags", () => {
  const scan = scanTags(text);

  test("lists start tags in order and skips comments, doctypes and style contents", () => {
    expect(scan.tags.map((t) => t.tag)).toEqual(["html", "head", "style", "body", "table", "tr", "td"]);
  });

  test("keeps a start tag that spans lines, and a > inside an attribute value", () => {
    const td = scan.tags.find((t) => t.tag === "td")!;
    expect([td.line, td.endLine]).toEqual([4, 5]);
    expect(td.endCol).toBe(12);
  });

  test("tagAt finds the start tag at or before a position", () => {
    const table = scan.tags.find((t) => t.tag === "table")!;
    expect(scan.tags[tagAt(scan, table.line, table.col + 3)]!.tag).toBe("table");
    expect(scan.tags[tagAt(scan, 5, 4)]!.tag).toBe("td");
    expect(tagAt(scan, 1, 0)).toBe(-1);
  });

  test("knows the enclosing tag of each, through end tags and void elements", () => {
    const s = scanTags('<div><p>a<br>b</p><img src="x"><span>c</span></div><i>d</i>');
    const parents = s.tags.map((t) => `${t.tag}<${s.tags[t.parent]?.tag ?? ""}`);
    expect(parents).toEqual(["div<", "p<div", "br<p", "img<div", "span<div", "i<"]);
  });

  test("lineCol turns an offset back into a position", () => {
    const s = scanTags("<a>\n  <b>");
    expect(lineCol(s, s.tags[1]!.start)).toEqual({ line: 2, col: 2 });
  });
});

describe("start tags are counted the same on both sides", () => {
  const samples = [
    text,
    '<p title="a > b">x</p><!--[if mso]><p><![endif]--><!--[if !mso]><!--><b>y</b><!--<![endif]--><title><b></title><textarea><i></textarea><u>z</u>',
  ];
  const same = (s: string) => {
    expect(scanTags(s).tags.map((t) => [t.tag, t.start, t.end])).toEqual(startTags(s).map((t) => [t.tag, t.start, t.end]));
  };
  test.each(samples.map((s, i) => [i, s] as const))("sample %i", (_i, s) => same(s));

  test("the output of every active fixture", () => {
    for (const f of loadFixtures().filter(isActive)) same(compile(f.input, { strict: false }).html);
  }, 60_000);
});

// a document of hand-made elements: just what the helpers read
const el = (localName: string, attrs: Record<string, string> = {}, parent: El | null = null, content = ""): El => ({
  localName,
  classList: { contains: (c: string) => (attrs["class"] ?? "").split(" ").includes(c) },
  textContent: content,
  parentElement: parent,
  getAttribute: (n: string) => attrs[n] ?? null,
});
const docOf = (...els: El[]): Doc => ({ querySelectorAll: () => els });

describe("traceSources", () => {
  test("names the input tag each entry points at, and -1 for none or a miss", () => {
    const input = scanTags("<div>\n  <p>a</p>\n  <b>b</b></div>");
    expect(traceSources([undefined, { line: 2, col: 3 }, null, { line: 3, col: 3 }, { line: 1, col: 2 }], input)).toEqual([-1, 1, -1, 2, -1]);
  });

  test("firstTags and mapped read them back", () => {
    const sources = [-1, 1, 1, 2];
    expect(firstTags(sources).get(1)).toBe(1);
    expect(firstTags(sources).get(2)).toBe(3);
    const scan = scanTags("<table><tr><td><p>x</p></td></tr></table>");
    // td has no source: the nearest tag above that has one answers
    expect(mapped(scan, [5, -1, -1, 7], 2)).toEqual([0, 5]);
    expect(mapped(scan, [5, -1, -1, 7], 3)).toEqual([3, 7]);
    expect(mapped(scan, [-1, -1, -1, -1], 3)).toBeNull();
  });
});

describe("fieldTable", () => {
  const tpl = [
    '<p title="{{in.attr}}">Hi {{user.name}}, {{ user.last | escape }}<b>x</b> {{after}}</p>',
    "<!-- {{in.comment}} --><style>{{in.style}}</style>",
    "{{#each items as |it|}}<td>{{it.name}}</td>{{/each}}{% if a %}<i>{{b}}</i>{% endif %}",
  ].join("\n");
  const scan = scanTags(tpl);

  test("lists text placeholders only, in tags' own order", () => {
    const f = fieldTable(tpl, scan, "tpl", (i) => i);
    expect(f.map((x) => tpl.slice(x.start, x.end))).toEqual(["{{user.name}}", "{{ user.last | escape }}", "{{after}}", "{{it.name}}", "{{b}}"]);
    // two before the <b>, one after it (that text belongs to the b)
    expect(f.map((x) => [scan.tags[x.tag]!.tag, x.k])).toEqual([["p", 0], ["p", 1], ["b", 0], ["td", 0], ["i", 0]]);
  });

  test("a tag without a source hands its text to the nearest one above that has one", () => {
    const html = "<table><tr><td>{{a}}</td><td>{{b}}</td></tr></table><p>{{c}}</p>";
    const s = scanTags(html);
    const sources = [10, -1, -1, -1, 11];
    const f = fieldTable(html, s, "tpl", (i) => sources[i]!);
    expect(f.map((x) => [x.s, x.k])).toEqual([[10, 0], [10, 1], [11, 0]]);
    expect(findField(f, 10, 1)!.start).toBe(html.indexOf("{{b}}"));
    expect(findField(f, 11, 1)).toBeUndefined();
  });

  test("reads the compiler's private-use pair too", () => {
    const raw = "<p>a user.name b</p>";
    const f = fieldTable(raw, scanTags(raw), "raw", (i) => i);
    expect(f).toHaveLength(1);
    expect(f[0]!.start).toBe(raw.indexOf(""));
  });
});

describe("describeFrame", () => {
  // <table><tr><td><p>…</p></td></tr></table> from <div><p>…</p></div> (td and tr have no source)
  const template = "<table><tr><td><p>{{a}}</p></td></tr></table>";
  const sources = [0, -1, -1, 1];

  test("pairs elements with tags by order, then with sources through the trace", () => {
    const table = el("table");
    const tr = el("tr", {}, table);
    const td = el("td", {}, tr);
    const p = el("p", {}, td);
    const chip = el("span", { class: "tddr-chip" }, p);
    const f = describeFrame(docOf(table, tr, td, p, chip), { by: "tags", scan: scanTags(template), sources });
    expect([table, tr, td, p].map((e) => f.sOf(e))).toEqual([0, -1, -1, 1]);
    expect(f.sOf(chip)).toBe(-1);
    expect(f.nearest(td)).toBe(table);
    expect(f.nearest(chip)).toBe(p);
    expect(f.tagOf(p)).toBe(3);
  });

  test("reads data-tddr-s and, through the trace, data-tddr-t; skips the field wrappers", () => {
    const a = el("div", { "data-tddr-s": "4" });
    const w = el("tddr-f", { "data-tddr-f": "9" }, a);
    const b = el("td", { "data-tddr-t": "3" });
    expect(describeFrame(docOf(a, w), { by: "s" }).sOf(a)).toBe(4);
    const t = describeFrame(docOf(b, w), { by: "t", sources: [-1, -1, -1, 7] });
    expect(t.sOf(b)).toBe(7);
    expect(t.byS.get(7)).toEqual([b]);
    expect(t.nearest(w)).toBeNull();
  });

  test("tddr-f wrappers don't take a tag when elements are paired by order", () => {
    const p = el("p");
    const w = el("tddr-f", {}, p);
    const b = el("b", {}, p);
    const { byEl } = align(docOf(p, w, b), scanTags("<p>{{x}}<b>y</b></p>").tags);
    expect([...byEl.keys()]).toEqual([p, b]);
    expect(byEl.get(b)!.i).toBe(1);
  });

  test("copies of a loop come in document order and are picked by position when counts agree", () => {
    const a1 = el("li", { "data-tddr-s": "2" });
    const a2 = el("li", { "data-tddr-s": "2" });
    const a3 = el("li", { "data-tddr-s": "2" });
    const f = describeFrame(docOf(a1, a2, a3), { by: "s" });
    expect([a1, a2, a3].map((e) => f.copyOf(e))).toEqual([0, 1, 2]);
    expect(pickCopy(f, 2, 1, 3)).toBe(a2);
    // the other view shows a different number of copies: the first, not a guess
    expect(pickCopy(f, 2, 1, 2)).toBe(a1);
    // no position known (a click in the code)
    expect(pickCopy(f, 2, undefined, 3)).toBe(a1);
    expect(pickCopy(f, 9, 0, 1)).toBeUndefined();
  });
});

describe("source-side fallbacks", () => {
  test("nearestWith walks the enclosing tags up to one the other side has", () => {
    const scan = scanTags("<div><div><p>x</p></div></div>");
    expect(nearestWith(scan, 2, (t) => t === 1)).toBe(1);
    expect(nearestWith(scan, 2, (t) => t === 2)).toBe(2);
    expect(nearestWith(scan, 2, () => false)).toBe(-1);
  });

  test("text inside a tddr-if belongs to the element around it", () => {
    const html = "<p>Hi <tddr-if test=\"a\">{{x}}</tddr-if> {{y}}</p>";
    const scan = scanTags(html);
    const f = fieldTable(html, scan, "tpl", ownsFields(scan));
    expect(f.map((x) => [x.s, x.k])).toEqual([[0, 0], [0, 1]]);
  });

  test("pickTag prefers the tag named like the element over its wrapping cell", () => {
    const scan = scanTags("<td><img><td><p>");
    const sources = [3, 3, 4, 4];
    expect(pickTag(sources, scan, 3, "img")).toBe(1);
    expect(pickTag(sources, scan, 4, "p")).toBe(3);
    expect(pickTag(sources, scan, 4, "div")).toBe(2);
    expect(pickTag(sources, scan, 9, "p")).toBe(-1);
  });

  test("the render module keeps the same pattern", () => {
    expect(RENDER_FIELD.source).toBe(TPL_FIELD.source);
  });

  test("a placeholder is not an escaped brace or a triple stash", () => {
    const hits = (t: string) => t.match(new RegExp(TPL_FIELD.source, "g")) ?? [];
    expect(hits("\\{{{ nor this }}}")).toEqual([]);
    expect(hits("{{{raw}}}")).toEqual([]);
    expect(hits("a {{b}} {{#if c}}")).toEqual(["{{b}}"]);
  });
});

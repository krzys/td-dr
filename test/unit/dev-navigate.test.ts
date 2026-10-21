// Click-to-locate across the dev page's views, run on parsed documents instead of a browser.
import { selectAll } from "css-select";
import { parse } from "parse5";
import { adapter, type Htmlparser2TreeAdapterMap } from "parse5-htmlparser2-tree-adapter";
import { describe, expect, test } from "vitest";
import type { RenderResponse } from "../../adapters/dev/protocol.ts";
import type { CodeTab, Range } from "../../adapters/dev/ui/code.js";
import { readableFields } from "../../adapters/dev/ui/dom.js";
import type { Doc, El } from "../../adapters/dev/ui/link.js";
import { scanTags } from "../../adapters/dev/ui/link.js";
import { buildFrame, createModel, createNavigator, rangeOf, tabOrder, type NavFrame } from "../../adapters/dev/ui/navigate.js";
import { compile } from "../../src/index.ts";

type Node = Htmlparser2TreeAdapterMap["node"];
type Element = Htmlparser2TreeAdapterMap["element"];
type FakeEl = El & { node: Element };

// a parsed document seen through the little the frame helpers read
const docOf = (html: string): Doc<FakeEl> => {
  const root = parse(html, { treeAdapter: adapter });
  const els = new WeakMap<Element, FakeEl>();
  const text = (n: Node): string => ("data" in n && n.type === "text" ? n.data : "children" in n ? n.children.map(text).join("") : "");
  const wrap = (n: Element): FakeEl => {
    const hit = els.get(n);
    if (hit) return hit;
    const el: FakeEl = {
      node: n,
      localName: n.name,
      classList: { contains: (c) => (n.attribs["class"] ?? "").split(/\s+/).includes(c) },
      get textContent() {
        return text(n);
      },
      get parentElement() {
        const up = n.parent;
        return up && "attribs" in up ? wrap(up) : null;
      },
      getAttribute: (k) => n.attribs[k] ?? null,
    };
    els.set(n, el);
    return el;
  };
  return { querySelectorAll: (sel) => selectAll<Node, Element>(sel, root).map(wrap) };
};
const all = (doc: Doc<FakeEl>, tag: string) => [...doc.querySelectorAll(tag)];

const response = (r: Partial<RenderResponse> & Pick<RenderResponse, "input" | "html">): RenderResponse => ({
  source: r.input,
  text: "",
  diagnostics: [],
  assets: [],
  size: { bytes: r.html.length, limit: 102_000 },
  ...r,
});

// the page around a navigator: one render, its two frames, and the code tab that is showing
const page = (r: RenderResponse, docs: { source: Doc<FakeEl>; compiled: Doc<FakeEl> }) => {
  const m = createModel(r);
  const texts: Record<CodeTab, string> = { compiled: r.html, template: r.template ?? "", source: readableFields(r.input) };
  const frames: Partial<Record<"source" | "compiled", NavFrame<FakeEl> | null>> = {};
  const at = { tab: "compiled" as CodeTab };
  const nav: ReturnType<typeof createNavigator<FakeEl>> = createNavigator<FakeEl>({
    model: () => m,
    frame: (k): NavFrame<FakeEl> | null => (frames[k] ??= buildFrame(k, docs[k], m, { fields: false, scanOf: (t) => nav.scanOf(t) })),
    doc: (k) => docs[k],
    shown: (t) => texts[t],
    tab: () => at.tab,
    fields: () => false,
    narrow: () => false,
  });
  // the text a range covers in a tab
  const slice = (tab: CodeTab, range: Range) => {
    const scan = scanTags(texts[tab]);
    return texts[tab].slice(scan.starts[range.line - 1]! + range.col, scan.starts[range.endLine - 1]! + range.endCol);
  };
  // click just inside the n-th occurrence of `needle` in a tab
  const clickCode = (tab: CodeTab, needle: string, nth = 0) => {
    at.tab = tab;
    let i = -1;
    for (let k = 0; k <= nth; k++) i = texts[tab].indexOf(needle, i + 1);
    const before = texts[tab].slice(0, i + 1).split("\n");
    return nav.fromCode({ line: before.length, col: before.at(-1)!.length });
  };
  return { nav, at, slice, clickCode };
};

describe("html mode: the compiler's trace ties the two frames and the code", () => {
  const input =
    '<!doctype html><html><head><title>T</title></head><body><div class="wrap"><h1>Hello</h1><p class="lead">Text <b>bold</b></p><ul><li>one</li><li>two</li></ul></div></body></html>';
  const { html, trace } = compile(input, { trace: true, strict: false });
  const r = response({ input, html, ...(trace && { trace }) });
  const source = docOf(input);
  const compiled = docOf(html);

  test("an element clicked in Source boxes what it became and marks that tag in the HTML tab", () => {
    const { nav, slice } = page(r, { source, compiled });
    const sel = nav.fromFrame("source", all(source, "b")[0]!, null)!;
    const p = nav.plan(sel);
    expect(p.boxes.source.el).toBe(all(source, "b")[0]);
    expect(p.boxes.compiled.el).toBe(all(compiled, "b")[0]);
    expect(p.code!.tab).toBe("compiled");
    expect(slice("compiled", p.code!.range)).toBe('<b style="font-weight:bold">');
    expect(p.fromFrame).toBe(true);
  });

  test("a tag clicked in the HTML tab boxes its element in both frames", () => {
    const { nav, clickCode } = page(r, { source, compiled });
    const p = nav.plan(clickCode("compiled", '<p style')!);
    expect(p.boxes.source.el?.classList.contains("lead")).toBe(true);
    expect(p.boxes.compiled.el).toBe(all(compiled, "p")[0]);
    expect(p.code!.tab).toBe("compiled");
  });

  test("the second of two like tags in Source is the second element, with no count to show", () => {
    const { nav, clickCode, slice } = page(r, { source, compiled });
    const p = nav.plan(clickCode("source", "<li", 1)!);
    expect(p.boxes.compiled.el).toBe(all(compiled, "li")[1]);
    expect(p.boxes.compiled.label).toBeUndefined();
    expect(slice("source", p.code!.range)).toBe("<li>");
  });

  test("the compiler's own wrappers have nothing to link to", () => {
    const { nav } = page(r, { source, compiled });
    expect(nav.fromFrame("compiled", all(compiled, "td")[0]!, null)).toBeNull();
  });
});

describe("a template filled by preview(): loop copies and fields", () => {
  const input = "<ul><li>name</li></ul>";
  const template = "<table><tr><td>{{#each items}}<p>{{name}}</p>{{/each}}</td></tr></table>";
  const fIn = input.indexOf("");
  const fTpl = template.indexOf("{{name}}");
  const r = response({
    input,
    template,
    html: "<table><tr><td><p>a</p><p>b</p></td></tr></table>",
    trace: [{ line: 1, col: 1 }, null, null, { line: 1, col: 5 }],
    filled: "preview",
    sourceShown: `<ul data-tddr-s="0"><li data-tddr-s="1"><tddr-f data-tddr-f="${fIn}">a</tddr-f></li><li data-tddr-s="1"><tddr-f data-tddr-f="${fIn}">b</tddr-f></li></ul>`,
    htmlShown: `<table data-tddr-s="0"><tr><td><p data-tddr-s="1"><tddr-f data-tddr-f="${fTpl}">a</tddr-f></p><p data-tddr-s="1"><tddr-f data-tddr-f="${fTpl}">b</tddr-f></p></td></tr></table>`,
  });
  const source = docOf(r.sourceShown!);
  const compiled = docOf(r.htmlShown!);

  test("the second copy in one frame is the second copy in the other, and its own tag in the HTML", () => {
    const { nav, slice } = page(r, { source, compiled });
    const p = nav.plan(nav.fromFrame("source", all(source, "li")[1]!, null)!);
    expect(p.boxes.compiled.el).toBe(all(compiled, "p")[1]);
    expect(p.code!.tab).toBe("compiled");
    expect(p.code!.range.col).toBe(r.html.lastIndexOf("<p>"));
    expect(slice("compiled", p.code!.range)).toBe("<p>");
  });

  test("from the code the copy isn't known: the first, labelled with how many there are", () => {
    const { nav, clickCode } = page(r, { source, compiled });
    const p = nav.plan(clickCode("source", "<li")!);
    expect(p.boxes.source).toEqual({ el: all(source, "li")[0], label: "li ×2" });
    expect(p.boxes.compiled).toEqual({ el: all(compiled, "p")[0], label: "p ×2" });
    expect(p.fromFrame).toBe(false);
  });

  test("a filled field clicked in a frame marks the same copy of it in the other, and its placeholder in the template", () => {
    const { nav, at, slice } = page(r, { source, compiled });
    at.tab = "template";
    const wrapper = all(compiled, "tddr-f")[1]!;
    const p = nav.plan(nav.fromFrame("compiled", wrapper, wrapper)!);
    expect(p.boxes.compiled.el).toBe(wrapper);
    expect(p.boxes.source.el).toBe(all(source, "tddr-f")[1]);
    expect(p.code!.tab).toBe("template");
    expect(slice("template", p.code!.range)).toBe("{{name}}");
  });

  test("a position inside a placeholder in the template is that field", () => {
    const { nav, clickCode, slice } = page(r, { source, compiled });
    const sel = clickCode("template", "{{name}}")!;
    expect(sel.field).toEqual({ s: 1, k: 0 });
    const p = nav.plan(sel);
    expect(p.boxes.source.el).toBe(all(source, "tddr-f")[0]);
    expect(slice("template", p.code!.range)).toBe("{{name}}");
  });
});

describe("helpers", () => {
  test("a click in a frame tries the code tabs nearest to it first", () => {
    expect(tabOrder("source", false)).toEqual(["source", "template", "compiled"]);
    expect(tabOrder("compiled", false)).toEqual(["compiled", "template", "source"]);
    expect(tabOrder("compiled", true)).toEqual(["template", "source", "compiled"]);
  });

  test("rangeOf spans lines", () => {
    const scan = scanTags("<a>\n<b\n c>");
    expect(rangeOf(scan, 4, 10)).toEqual({ line: 2, col: 0, endLine: 3, endCol: 3 });
  });
});

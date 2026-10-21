import { describe, expect, test } from "vitest";
import { analyze } from "../../src/analyze/analyze.ts";
import type { Rule } from "../../src/analyze/rule.ts";
import { analyzeChildren, passThrough } from "../../src/analyze/children.ts";
import { ownStyle, serializeStyled } from "../../src/analyze/serialize-styled.ts";
import { createSink } from "../../src/diagnostics/diagnostic.ts";
import { compile } from "../../src/index.ts";
import { emptyBox, mapChildren, type InlineNode, type Node } from "../../src/ir/index.ts";
import { parse } from "../../src/parse/html.ts";
import { runPasses } from "../../src/passes/index.ts";
import { blockify } from "../../src/style/computed.ts";
import { codesOf, el, testCtx, text } from "../helpers/index.ts";

describe("contracts", () => {
  test("compile returns html + diagnostics", () => {
    const r = compile("<p>Hi</p>");
    expect(typeof r.html).toBe("string");
    expect(Array.isArray(r.diagnostics)).toBe(true);
  });

  test("parse keeps source locations, styles and meta", () => {
    const ctx = testCtx({ css: [".x{color:red}"] });
    const doc = parse('<html lang="pl"><head><title> T </title><style>p{}</style></head><body>\n<p>a</p></body></html>', ctx);
    expect(doc.meta).toEqual({ lang: "pl", title: "T", page: true });
    expect(doc.styles.map((s) => s.origin)).toEqual(["author", "extra"]);
    expect(doc.styles[0]?.loc?.line).toBe(1);
    const p = doc.body.children.find((c) => "name" in c && c.name === "p");
    expect(p?.sourceCodeLocation?.startLine).toBe(2);
  });

  test("strict=false downgrades errors to warnings", () => {
    const strict = createSink(true);
    const loose = createSink(false);
    strict.report("E001");
    loose.report("E001", { message: "grid", loc: { line: 3, col: 4 } });
    expect(strict.list()[0]?.severity).toBe("error");
    expect(loose.list()[0]).toMatchObject({ code: "E001", severity: "warning", message: "grid", loc: { line: 3, col: 4 } });
  });

  test("analyze uses the first matching rule and reports E010 when none matches", () => {
    const ctx = testCtx();
    const leaf: Rule = {
      name: "leaf",
      matches: (n) => n.tag === "p",
      analyze: () => ({ kind: "inline", html: "<p>x</p>", style: {}, margin: emptyBox().margin }),
    };
    const block: Rule = {
      name: "block",
      matches: (n) => n.tag === "body",
      analyze: (n, _c, recurse) => ({
        kind: "stack",
        box: emptyBox(),
        gap: 0,
        collapse: true,
        children: n.children.flatMap((c) => (c.type === "element" ? [recurse(c)] : [])),
      }),
    };
    const ir = analyze(el("body", {}, [el("p"), el("blink", {}, [text("!")])]), ctx, [leaf, block]);
    expect(ir.kind).toBe("stack");
    expect((ir as Extract<Node, { kind: "stack" }>).children.map((c) => c.kind)).toEqual(["inline", "raw"]);
    expect(codesOf(ctx)).toEqual(["E010"]);
  });

  test("passes run in order", () => {
    const seen: string[] = [];
    const mk = (name: string) => ({ name, run: (n: Node) => (seen.push(name), n) });
    runPasses({ kind: "raw", html: "" }, testCtx(), [mk("a"), mk("b")]);
    expect(seen).toEqual(["a", "b"]);
  });

  test("mapChildren rebuilds containers", () => {
    const leaf: Node = { kind: "raw", html: "a" };
    const row: Node = { kind: "row", box: emptyBox(), gap: 0, wrap: false, cols: [{ width: { auto: true }, valign: "top", child: leaf }] };
    const out = mapChildren(row, () => ({ kind: "raw", html: "b" }));
    expect(out).toMatchObject({ cols: [{ child: { html: "b" } }] });
    expect(row).toMatchObject({ cols: [{ child: { html: "a" } }] });
  });

  test("serializeStyled inlines declared styles and escapes", () => {
    const html = serializeStyled([
      el("p", { color: "#ff0000" }, [text("a < b & c"), el("br")], { attrs: { style: "color:red", title: 'x"y' } }),
    ], undefined);
    expect(html).toBe('<p title="x&quot;y" style="color:#ff0000">a &lt; b &amp; c<br></p>');
  });

  test("ownStyle keeps UA/authored values, drops what is inherited anyway", () => {
    const parent = { color: "#111111", "font-size": "16px" };
    const h1 = el("h1", { color: "#111111", "font-size": "32px", "margin-top": "21.44px", display: "block" }, [], { declared: {} });
    // a heading's line height is stated even when normal: clients style h1–h6 directly
    expect(ownStyle(h1, parent)).toEqual({ "font-size": "32px", "margin-top": "21.44px", "line-height": "normal" });
  });

  test("ownStyle drops zero resets the browser already has, keeps them where it doesn't", () => {
    const reset = { "margin-top": "0", "padding-left": "0px", "border-top-width": "0", "border-top-style": "solid", "border-top-color": "#111111" };
    expect(ownStyle(el("span", { ...reset, "font-size": "20px" }, [], { declared: {} }), undefined)).toEqual({ "font-size": "20px" });
    expect(ownStyle(el("p", { ...reset }, [], { declared: {} }), undefined)["margin-top"]).toBe("0");
    expect(ownStyle(el("img", { ...reset }, [], { declared: {} }), undefined)["border-top-width"]).toBe("0");
    const boxed = { "padding-left": "8px", "border-top-width": "2px", "border-top-style": "solid" };
    expect(ownStyle(el("span", boxed, [], { declared: {} }), undefined)).toEqual(boxed);
  });

  test("analyzeChildren groups inline runs, recurses blocks, skips hidden", () => {
    const seen: string[] = [];
    const recurse = (n: { tag: string }): Node => (seen.push(n.tag), { kind: "raw", html: n.tag });
    const div = el("div", { display: "block" }, [
      text("Hi "),
      el("b", { display: "inline" }, [text("x")]),
      el("p", { display: "block" }, [text("para")]),
      el("div", { display: "none" }),
      text("  "),
      el("img", { display: "inline" }),
      text(" tail"),
    ]);
    const kids = analyzeChildren(div, testCtx(), recurse as never);
    expect(kids.map((k) => k.kind)).toEqual(["inline", "raw", "inline"]);
    expect(seen).toEqual(["p"]);
    const items = analyzeChildren(el("div", { display: "flex" }, [el("span", { display: "block" }), text(" x "), el("a", { display: "block" })]), testCtx(), recurse as never, { items: true });
    expect(items.map((k) => k.kind)).toEqual(["raw", "inline", "raw"]);
    const lone = analyzeChildren(el("div", { display: "block" }, [text(" "), el("img", { display: "inline" }), text("\n")]), testCtx(), recurse as never);
    expect(lone.map((k) => k.kind)).toEqual(["raw"]);
  });

  test("passThrough spells out the root and lifts its margins", () => {
    const ctx = testCtx();
    const h1 = el("h1", { display: "block", "font-size": "32px", "margin-top": "21.44px", "margin-bottom": "-4px" }, [text("Hi")], { declared: {} });
    const n = passThrough(h1, ctx) as InlineNode;
    expect(n.html).toBe('<h1 style="font-size:32px;line-height:normal;margin:0">Hi</h1>');
    expect(n.margin).toEqual({ top: 21.44, right: 0, bottom: 0, left: 0 });
    expect(codesOf(ctx)).toEqual(["E005"]);
  });

  test("flex items are blockified", () => {
    expect(blockify({ display: "inline-block" }, { display: "flex" })).toEqual({ display: "block" });
    expect(blockify({}, { display: "inline-flex" })).toEqual({ display: "block" });
    expect(blockify({ display: "inline" }, { display: "block" })).toEqual({ display: "inline" });
  });
});

test("passThrough lifts margins that collapse through the root", () => {
  const li = (m: string) => el("li", { display: "list-item", "margin-bottom": m }, [text("x")]);
  const ul = el("ul", { display: "block", "margin-bottom": "16px", "padding-left": "20px" }, [text("\n"), li("6px"), li("24px"), text("\n")]);
  const n = passThrough(ul, testCtx()) as InlineNode;
  expect(n.margin.bottom).toBe(24);
  expect(n.html).toContain('<li style="display:list-item;margin-bottom:6px">');
  expect(n.html).toContain('<li style="display:list-item;margin-bottom:0">');
});

test("Vue scoped styles match, and data-v-* never reaches the output", async () => {
  const { compile } = await import("../../src/index.ts");
  const { html } = compile('<style>.t[data-v-7ba5]{color:#ff0000}</style><p class="t" data-v-7ba5>x</p>');
  expect(html).toMatch(/<p style="[^"]*color:#ff0000/);
  expect(html).not.toContain("data-v-");
});

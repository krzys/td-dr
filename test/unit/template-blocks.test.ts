import { describe, expect, test } from "vitest";
import { compile } from "../../src/index.ts";
import { emptyBox, mapChildren, sides, type Node, type StackNode, type TemplateNode } from "../../src/ir/index.ts";
import { templateChildren } from "../../src/ir/helpers.ts";
import { msoOnly } from "../../src/emit/mso.ts";
import { collapseMargins } from "../../src/passes/collapse-margins.ts";
import { gapToPadding } from "../../src/passes/gap-to-padding.ts";
import { marginToPadding } from "../../src/passes/margin-to-padding.ts";
import { resolveWidths } from "../../src/passes/resolve-widths.ts";
import { blockClose, blockOpen, field } from "../../src/template/tokens.ts";
import { testCtx } from "../helpers/index.ts";
import { givenPadded, givenResolved } from "../helpers/phase.ts";

const hb = (src: string, strict = true) => compile(src, { template: "handlebars", strict });
const codes = (r: ReturnType<typeof compile>) => r.diagnostics.map((d) => d.code);

describe("hint rule: data-email-each / -if / -unless", () => {
  test("if guards the list: it opens outside the each and closes after it", () => {
    const r = hb('<div><p style="margin:0" data-email-each="items" data-email-as="x" data-email-if="show">' + field("x.n") + "</p></div>");
    expect(r.html).toMatch(/\{\{#if show\}\}\s*\{\{#each items as \|x\|\}\}[\s\S]*\{\{x\.n\}\}[\s\S]*\{\{\/each\}\}\s*\{\{\/if\}\}/);
    expect(r.html).not.toContain("data-email");
  });

  test("a block's rows sit between the rows of its stack", () => {
    const r = hb('<div><p style="margin:0">a</p><div data-email-unless="paid" style="padding:4px">b</div><p style="margin:0">c</p></div>');
    expect(r.html).toMatch(/<\/tr>\s*\{\{#unless paid\}\}\s*<tr>[\s\S]*b[\s\S]*<\/tr>\s*\{\{\/unless\}\}\s*<tr>/);
    expect(codes(r)).not.toContain("E012");
  });

  test("a whole flex row can carry it, an item of one can't", () => {
    const row = (attr: string) => `<div style="display:flex;gap:8px"><div style="width:100px">a</div><div ${attr} style="width:100px">b</div></div>`;
    expect(codes(hb(row("")))).not.toContain("E012");
    const bad = hb(row('data-email-if="x"'));
    expect(codes(bad)).toContain("E012");
    expect(bad.diagnostics.find((d) => d.code === "E012")?.loc?.line).toBe(1);
    expect(bad.html).not.toContain("{{#if");
    expect(codes(hb(`<div data-email-if="x" style="display:flex"><div style="width:100px">a</div></div>`))).not.toContain("E012");
  });

  test("an item of a flex column is a row of a stack: allowed", () => {
    const r = hb('<div style="display:flex;flex-direction:column"><div>a</div><div data-email-if="x">b</div></div>');
    expect(codes(r)).not.toContain("E012");
    expect(r.html).toContain("{{#if x}}");
  });

  test("a grid cell is an item, the grid itself is not", () => {
    const grid = (cell: string) => `<div ${cell} style="display:grid;grid-template-columns:1fr 1fr"><div>a</div><div>b</div></div>`;
    expect(codes(hb(grid('data-email-each="xs"')))).not.toContain("E012");
    expect(codes(hb('<div style="display:grid;grid-template-columns:1fr 1fr"><div data-email-each="xs">a</div></div>'))).toContain("E012");
  });

  test("invalid paths and aliases are E012 and leave the construct out", () => {
    const r = hb('<div><div data-email-if="a[0]">x</div><div data-email-each="xs" data-email-as="a b">y</div><div data-email-as="z">w</div></div>');
    expect(codes(r).filter((c) => c === "E012")).toHaveLength(3);
    expect(r.html).not.toMatch(/\{\{#/);
  });

  test("text-level elements get markers around them, in a run and alone", () => {
    const r = hb('<p style="margin:0">Hi <b data-email-if="vip">VIP</b> there</p><div><span data-email-each="tags" data-email-as="t">' + field("t.n") + "</span></div>");
    expect(r.html).toContain("Hi {{#if vip}}<b");
    expect(r.html).toContain("VIP</b>{{/if}} there");
    expect(r.html).toMatch(/\{\{#each tags as \|t\|\}\}.*\{\{t\.n\}\}.*\{\{\/each\}\}/s);
  });

  test("an invalid hint on a text-level element is reported once", () => {
    const r = hb('<p style="margin:0">Hi <b data-email-if="a b">VIP</b> there</p>');
    expect(codes(r).filter((c) => c === "E012")).toHaveLength(1);
    expect(r.html).not.toContain("{{#if");
  });

  test("with outlook-only the construct stays outside the conditional", () => {
    const r = hb('<div><p style="margin:0">a</p><div data-email="outlook-only" data-email-if="x">o</div></div>');
    expect(r.html).toMatch(/\{\{#if x\}\}\s*<!--\[if mso\]><tr>[\s\S]*<\/tr><!\[endif\]-->\s*\{\{\/if\}\}/);
  });
});

describe("msoOnly keeps ESP markers", () => {
  test("markers survive, other comments don't", () => {
    const out = msoOnly(`<!-- gone -->${blockOpen({ op: "each", path: "xs", as: "x" })}<td>1</td>${blockClose("each")}<!--[if mso]><td>2</td><![endif]-->`);
    expect(out).toBe(`<!--[if mso]>${blockOpen({ op: "each", path: "xs", as: "x" })}<td>1</td>${blockClose("each")}<td>2</td><![endif]-->`);
  });

  test("markers inside a dropped !mso part go with it", () => {
    const out = msoOnly(`<!--[if !mso]><!-->${blockOpen({ op: "if", when: { op: "truthy", path: "a" } })}x${blockClose("if")}<!--<![endif]-->y`);
    expect(out).toBe("<!--[if mso]>y<![endif]-->");
  });
});

describe("passes see through TemplateNode", () => {
  const tpl = (child: Node, op: TemplateNode["op"] = "if"): TemplateNode =>
    op === "each" ? { kind: "template", op, path: "p", child } : { kind: "template", op, branches: [{ when: { op: "truthy", path: "p" }, child }] };
  const childOf = (t: TemplateNode): Node => templateChildren(t)[0]!;
  const inline = (margin = sides(0)): Node => ({ kind: "inline", html: "x", style: {}, margin });
  const stack = (children: Node[], over: Partial<StackNode> = {}): StackNode => ({ kind: "stack", box: emptyBox(), children, gap: 0, collapse: true, ...over });

  test("mapChildren maps the child", () => {
    const t = tpl(inline());
    expect(mapChildren(t, () => inline(sides(1)))).toEqual(tpl(inline(sides(1))));
  });

  test("margin-to-padding turns the margin of what is inside into padding inside", () => {
    const out = marginToPadding.run(stack([tpl(inline(sides(4, 0)))]), testCtx()) as StackNode;
    const t = out.children[0] as TemplateNode;
    expect(t.kind).toBe("template");
    expect(childOf(t).kind).toBe("stack");
  });

  test("collapse-margins shares the margin the construct's neighbour already has: nothing doubled, no warning", () => {
    const ctx = testCtx();
    const out = collapseMargins.run(stack([inline(sides(0, 0, 10, 0)), tpl(inline(sides(10, 0, 0, 0))), inline()]), ctx) as StackNode;
    expect((out.children[0] as { margin: { bottom: number } }).margin.bottom).toBe(10);
    expect((childOf(out.children[1] as TemplateNode) as { margin: { top: number } }).margin.top).toBe(0);
    expect(ctx.diagnostics.list()).toEqual([]);
  });

  test("collapse-margins still warns when no padding can give the browser's spacing", () => {
    const ctx = testCtx();
    collapseMargins.run(stack([inline(), tpl(inline(sides(0, 0, 8, 0)), "each"), inline(sides(16, 0, 0, 0))]), ctx);
    expect(ctx.diagnostics.list().map((d) => d.code)).toEqual(["W003"]);
  });

  test("no warning when only one side has a margin", () => {
    const ctx = testCtx();
    collapseMargins.run(stack([inline(), tpl(inline(sides(10, 0, 0, 0))), inline()]), ctx);
    expect(ctx.diagnostics.list()).toEqual([]);
  });

  test("resolve-widths reaches the content", () => {
    const img: Node = { kind: "image", box: emptyBox(), src: "a.png", alt: "", fluid: true };
    const out = resolveWidths.run(givenPadded(stack([tpl(img)], { box: { ...emptyBox(), maxWidth: 300 } })), testCtx()) as StackNode;
    expect((childOf(out.children[0] as TemplateNode) as { width?: number }).width).toBe(300);
  });

  test("gap-to-padding puts the gap inside, so repetitions and a dropped block keep the spacing right", () => {
    const ctx = testCtx();
    const out = gapToPadding.run(givenResolved(stack([inline(), tpl(inline(), "each")], { gap: 12 })), ctx) as StackNode;
    const t = out.children[1] as TemplateNode;
    expect(t.kind).toBe("template");
    expect((childOf(t) as StackNode).box.padding.top).toBe(12);
    expect(ctx.diagnostics.list()).toEqual([]);
  });

  test("a construct that leads a gapped stack is reported", () => {
    const ctx = testCtx();
    gapToPadding.run(givenResolved(stack([tpl(inline(), "each"), inline()], { gap: 12 })), ctx);
    expect(ctx.diagnostics.list().map((d) => d.code)).toEqual(["W003"]);
  });
});

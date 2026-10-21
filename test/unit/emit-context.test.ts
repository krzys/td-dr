import { describe, expect, test } from "vitest";
import { createEmitContext, traced } from "../../src/emit/context.ts";
import { emit, emitNode } from "../../src/emit/emit.ts";
import { checkEmitReady, emptyBox, sides, type Node, type SrcLoc } from "../../src/ir/index.ts";
import { TRACE_ATTR } from "../../src/emit/trace.ts";
import { codesOf, testCtx } from "../helpers/index.ts";

const loc = (line: number, col = 1): SrcLoc => ({ line, col });
const inline = (html: string, at?: SrcLoc): Node => ({ kind: "inline", html, style: {}, margin: sides(0), ...(at ? { loc: at } : {}) });
const stack = (children: Node[], at?: SrcLoc, box = emptyBox()): Node => ({ kind: "stack", box, children, gap: 0, collapse: false, resolvedWidth: 600, ...(at ? { loc: at } : {}) });
const photo = (at: SrcLoc): Node =>
  stack([inline("x")], at, { ...emptyBox(), background: "#000000", backgroundImage: { css: "url(a.jpg)", url: "a.jpg" } });

// the trace marker of every start tag, in order ("-" for none)
const marks = (html: string): string[] =>
  [...html.matchAll(/<([a-z]+)\b([^>]*)>/g)].map((m) => `${m[1]}@${new RegExp(`${TRACE_ATTR}="([^"]+)"`).exec(m[2]!)?.[1] ?? "-"}`);

describe("emission context", () => {
  test("two compiles emitting in turn keep their own trace, head css and diagnostics", () => {
    const a = testCtx({ trace: true });
    const b = testCtx();
    const ea = createEmitContext(a);
    const eb = createEmitContext(b);
    const tree = stack([inline("hi", loc(2))], loc(1));
    const first = emitNode(ea, tree);
    const other = emitNode(eb, tree);
    const again = emitNode(ea, tree);
    expect(first).toContain(`${TRACE_ATTR}="1:1"`);
    expect(again).toBe(first);
    expect(other).not.toContain(TRACE_ATTR);
    emitNode(eb, photo(loc(9)));
    expect(codesOf(a)).toEqual([]);
    expect(codesOf(b)).toEqual(["W001"]);
    expect(ea.headCss).not.toBe(eb.headCss);
  });

  test("a compile run in the middle of another leaves the outer one's scope as it was", () => {
    const outer = traced(createEmitContext(testCtx({ trace: true })), loc(4));
    const before = emitNode(outer, inline("<b>x</b>"));
    emit(checkEmitReady(stack([inline("y", loc(7))], loc(6))), testCtx({ trace: true }));
    expect(outer.at).toBe("4:1");
    // a node without a loc is no author element's: its tags are unmarked, whatever scope it sits in
    expect(marks(emitNode(outer, stack([inline("z")])))).toEqual(["table@-", "tr@-", "td@-"]);
    expect(emitNode(outer, inline("<b>x</b>"))).toBe(before);
  });

  test("trace markers belong to the element whose tags are being written, and end with it", () => {
    const card = stack([inline("a", loc(3)), inline("b", loc(3, 5))], loc(2), { ...emptyBox(), padding: sides(4), background: "#eeeeee" });
    const { html } = emit(checkEmitReady(stack([card, inline("c", loc(4))], loc(1))), testCtx({ trace: true }));
    // the card's cell and its rows are its own; the sibling after it is back in the root's rows
    expect(marks(html)).toEqual(["table@1:1", "tr@-", "td@2:1", "table@2:1", "tr@-", "td@3:1", "tr@-", "td@3:5", "tr@-", "td@4:1"]);
  });

  test("with trace off nothing is marked", () => {
    const tree = stack([stack([inline("a", loc(3))], loc(2)), inline("b", loc(4))], loc(1));
    expect(emit(checkEmitReady(tree), testCtx()).html).not.toContain(TRACE_ATTR);
  });
});

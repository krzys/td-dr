import { describe, expect, test } from "vitest";
import { compile } from "../../../src/index.ts";
import { emptyBox, type Node, type RowNode, type WidthSpec } from "../../../src/ir/index.ts";
import { arithmeticResolver } from "../../../src/passes/arithmetic-resolver.ts";
import { testCtx } from "../../helpers/index.ts";

const leaf: Node = { kind: "raw", html: "" };
const wrapRow = (widths: WidthSpec[], gap: number): RowNode => ({ kind: "row", box: emptyBox(), gap, wrap: true, cols: widths.map((width) => ({ width, valign: "top" as const, child: leaf })) });
const lateNotes = (ctx: ReturnType<typeof testCtx>) => ctx.diagnostics.list().map((d) => d.message).filter((m) => m.includes("stop sharing a line"));
const pctRow = (gap: number, item = "", style = "", pad = "0 7px") =>
  `<!doctype html><html lang="en"><head><style>body{margin:0}${style}</style></head><body>\n<div style="display:flex;flex-wrap:wrap;gap:${gap}px;padding:${pad};font-family:Arial">` +
  `<div class="c" style="flex:0 0 48%;box-sizing:border-box;${item}">a</div><div class="c" style="flex:0 0 48%;box-sizing:border-box;${item}">b</div></div></body></html>`;
const notes = (html: string) => compile(html).diagnostics.map((d) => d.message).filter((m) => m.includes("stop sharing a line"));

describe("% lines on narrow screens", () => {
  test("a row inside padding breaks on a wider screen than its own width says", () => {
    const top = testCtx();
    arithmeticResolver.resolve(wrapRow([{ pct: 48 }, { pct: 48 }], 12), 540, top);
    expect(lateNotes(top)).toEqual([]); // 300px: below every screen
    const nested = testCtx();
    // 30px of padding each side: the row is 300px wide on a 360px screen
    arithmeticResolver.resolve(wrapRow([{ pct: 48 }, { pct: 48 }], 12), 540, nested, { a: 1, b: 60 });
    expect(lateNotes(nested)).toEqual(["% columns with a gap stop sharing a line once the row is narrower than 300px (screens narrower than 360px) in the source, but stay side by side in the output"]);
    const fixed = testCtx();
    arithmeticResolver.resolve(wrapRow([{ pct: 48 }, { pct: 48 }], 20), 580, fixed, { a: 0, b: -580 });
    expect(lateNotes(fixed)).toEqual([]); // a px-wide row never narrows
  });

  test("compiled: the surrounding padding counts", () => {
    const html = `<!doctype html><html lang="en"><head><style>body{margin:0}</style></head><body>\n<div style="max-width:600px;margin:0 auto;padding:0 30px;box-sizing:border-box;font-family:Arial">` +
      `<div style="display:flex;flex-wrap:wrap;gap:12px"><div style="flex:0 0 48%;box-sizing:border-box">a</div><div style="flex:0 0 48%;box-sizing:border-box">b</div></div></div></body></html>`;
    expect(notes(html)).toEqual(["% columns with a gap stop sharing a line once the row is narrower than 300px (screens narrower than 360px) in the source, but stay side by side in the output"]);
  });

  test("a narrower screen that lays the items out itself takes over below it: no note", () => {
    const mq = "@media (max-width: 480px) { .c { flex-basis: 100% !important; } }";
    expect(notes(pctRow(14))).toHaveLength(1); // breaks at 364px
    expect(notes(pctRow(14, "", mq))).toEqual([]);
    // the source breaks at 520px, above the 480px screen: between the two the output still differs
    expect(notes(pctRow(20, "", mq, "0 10px"))).toEqual(["% columns with a gap stop sharing a line once the row is narrower than 520px in the source, but stay side by side in the output"]);
    // a screen that changes something else about the items is no reason to stay quiet
    expect(notes(pctRow(14, "", "@media (max-width: 480px) { .c { color: red } }"))).toHaveLength(1);
  });
});

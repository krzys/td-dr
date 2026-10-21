import { describe, expect, test } from "vitest";
import { compile } from "../../../src/index.ts";
import { emptyBox, type StackNode } from "../../../src/ir/index.ts";
import { resolveWidths } from "../../../src/passes/resolve-widths.ts";
import { codesOf, testCtx } from "../../helpers/index.ts";
import { givenPadded } from "../../helpers/phase.ts";

const root: StackNode = { kind: "stack", box: { ...emptyBox(), width: { px: 640 } }, children: [], gap: 0, collapse: false, loc: { line: 2, col: 3 } };
const codes = (html: string, width: number) => compile(html, { width, lang: "en" }).diagnostics.map((d) => `${d.code} ${d.message}`);

describe("W011 / W004: the width decision is data", () => {
  test("a root the decision reported as wider than the width option is clamped without a second warning", () => {
    const ctx = testCtx({ width: 500 });
    const out = resolveWidths.run(givenPadded({ ...root, reportedWide: true }), ctx) as StackNode;
    expect(out.resolvedWidth).toBe(500);
    expect(out.box.width).toEqual({ px: 500 });
    expect(codesOf(ctx)).toEqual([]);
  });

  test("any other box wider than its slot still gets W004, whatever the diagnostics say", () => {
    const ctx = testCtx({ width: 500 });
    ctx.diagnostics.report("W011", { loc: root.loc });
    resolveWidths.run(givenPadded(root), ctx);
    expect(codesOf(ctx)).toEqual(["W011", "W004"]);
  });

  test("compiled, the root is reported once, also when other screens are compiled too", () => {
    const html = `<html><head><style>@media (max-width:480px){ .t{ color:red } }</style></head><body><div style="width:640px;margin:0 auto"><p class="t" style="margin:0">hi</p></div></body></html>`;
    expect(codes(html, 500).map((c) => c.slice(0, 4))).toEqual(["W011", "I015"]);
  });

  test("a ::before shares its host's source position, not its host's W011: its own clamp is W004", () => {
    const style = (more = "") => `<style>.r::before{content:"x";display:block;width:560px;background:#f00${more}}</style>`;
    const host = `<html><head>${style()}</head><body>\n<div class="r" style="width:600px;margin:0 auto;background:#eee"><p>Hello</p></div>\n</body></html>`;
    expect(codes(host, 480)).toEqual([
      "W011 Container is 600px wide but the width option is 480px; it is laid out at 480px",
      "I015 Email has no title",
      "W004 width 560px is wider than its slot (480px) and was clamped",
    ]);
    // the pseudo-element is the root itself: its W011 is the one, no W004 on top
    const alone = `<html><head>${style(";margin:0 auto")}</head><body>\n<div class="r"><div style="width:400px;margin:0 auto">a</div></div>\n</body></html>`;
    expect(codes(alone, 480).filter((c) => /W004|W011/.test(c))).toEqual(["W011 Container is 560px wide but the width option is 480px; it is laid out at 480px"]);
  });
});

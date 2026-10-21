import { describe, expect, test } from "vitest";
import { emit } from "../../src/emit/emit.ts";
import { checkEmitReady, emptyBox, sides, type Node } from "../../src/ir/index.ts";
import { compile } from "../../src/index.ts";
import { testCtx } from "../helpers/index.ts";

// style of the <td> right before the first text element
const cellStyle = (html: string): string => /<td style="([^"]*)">\s*<(?:p|h1|span)\b/.exec(compile(html).html)?.[1] ?? "";

describe("pruned text cells", () => {
  test("a cell with bare text keeps the text declarations", () => {
    const out = compile('<div style="font-size:13px;color:#64748b;padding:8px">hello</div>').html;
    expect(out).toContain("font-size:13px");
    expect(out).toContain("color:#64748b");
  });

  test("the cell drops what the only <p> restates", () => {
    const html = '<div style="padding:8px"><p style="font-size:13px;line-height:18px;color:#64748b;text-align:center">hi</p></div>';
    expect(cellStyle(html)).not.toMatch(/font-size|color|line-height|text-align/);
    const out = compile(html).html;
    expect(out).toMatch(/<p style="[^"]*font-size:13px/);
    expect(out).toMatch(/<p style="[^"]*mso-line-height-rule:exactly/);
  });

  test("a partly restated style keeps the rest on the cell", () => {
    const node: Node = {
      kind: "stack",
      box: { ...emptyBox(), padding: sides(8), background: "#eeeeee" },
      children: [{ kind: "inline", html: "<p>hi</p>", style: { color: "#111111", "font-size": "14px", "line-height": "20px" }, restated: { color: "#111111", "line-height": "30px" }, margin: sides(0) }],
      gap: 0,
      collapse: false,
      resolvedWidth: 600,
    };
    const td = /<td[^>]*style="([^"]*)"/.exec(emit(checkEmitReady(node), testCtx()).html)?.[1] ?? "";
    expect(td).toContain("font-size:14px");
    expect(td).toContain("line-height:20px");
    expect(td).toContain("mso-line-height-rule:exactly");
    expect(td).not.toContain("color:#111111");
  });

  test("an inline element sits on the cell's line, so the cell keeps everything", () => {
    const td = cellStyle('<div style="padding:8px;font-size:14px;color:#111111"><span>hi</span></div>');
    expect(td).toContain("font-size:14px");
    expect(td).toContain("color:#111111");
  });
});

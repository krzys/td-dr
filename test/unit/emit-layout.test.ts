import { describe, expect, test } from "vitest";
import { emit } from "../../src/emit/emit.ts";
import { checkEmitReady, emptyBox, sides, type Box, type Column, type ImageNode, type Node, type StackNode } from "../../src/ir/index.ts";
import { testCtx } from "../helpers/index.ts";
import { lintEmail } from "../harness/golden-lint.test.ts";

const inline = (html: string, style: Record<string, string> = {}): Node => ({ kind: "inline", html, style, margin: sides(0) });
// resolvedWidth: what resolve-widths would set in a 600px email (ir/phase.ts); auto columns are left to the table
const stack = (children: Node[], box: Partial<Box> = {}, resolvedWidth = 600): Node => ({
  kind: "stack",
  box: { ...emptyBox(), ...box },
  children,
  gap: 0,
  collapse: false,
  resolvedWidth,
});
const col = (child: Node, c: Partial<Column> = {}): Column => ({ width: { auto: true }, valign: "top", child, resolved: null, ...c });
const row = (cols: Column[], box: Partial<Box> = {}, wrap = false): Node => ({
  kind: "row",
  box: { ...emptyBox(), ...box },
  gap: 0,
  wrap,
  cols,
  resolvedWidth: 600,
});
const img = (o: Partial<ImageNode> = {}, box: Partial<Box> = {}): Node => ({
  kind: "image",
  box: { ...emptyBox(), ...box },
  src: "a.png",
  alt: "A",
  ...o,
});
const run = (n: Node) => {
  const { html } = emit(checkEmitReady(n), testCtx());
  expect(lintEmail(html)).toEqual([]);
  return html;
};
const IMG = "display:block;border:0;outline:none;text-decoration:none;";

describe("emit rows", () => {
  test("px cells centred in a wider painted or set-width row shrink-wrap and sit in the middle", () => {
    const panel = (box: Partial<Box>) => {
      const n = row([col(inline("x"), { width: { px: 300 }, align: "center", resolved: { px: 300, pct: 78.95 } })], box);
      return run({ ...n, resolvedWidth: 380 } as Node);
    };
    expect(panel({ background: "#000000" })).toMatch(/<td bgcolor="#000000"[^>]*>\n<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">/);
    expect(panel({ width: { px: 380 } })).toMatch(/<td>\n<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">/);
    // already as wide as its cells: nothing to pack
    const full = row([col(inline("x"), { width: { px: 380 }, align: "center", resolved: { px: 380, pct: 100 } })], { background: "#000000" });
    expect(run({ ...full, resolvedWidth: 380 } as Node)).not.toContain('align="center">');
  });

  test("a min-height row's box cell places the row the way its cells are placed", () => {
    const tall = (valigns: Array<"top" | "middle" | "bottom">, wrap = false) =>
      run(row(valigns.map((v) => col(inline("x"), { valign: v })), { background: "#000000", minHeight: 186 }, wrap));
    expect(tall(["middle", "middle"])).toMatch(/<td bgcolor="#000000" height="186" valign="middle"/);
    expect(tall(["bottom"])).toMatch(/height="186" valign="bottom"/);
    expect(tall(["middle", "top"])).toMatch(/height="186" valign="top"/);
  });

  test("a min-height column places center, end and one item by valign, the space-* values over empty rows", () => {
    const column = (justify: NonNullable<StackNode["justify"]>, n: number) =>
      run({ ...stack(["a", "b", "c"].slice(0, n).map((t) => inline(t)), { background: "#000000", minHeight: 200 }), justify } as Node);
    expect(column("center", 2)).toMatch(/<td height="200" valign="middle">/);
    expect(column("end", 1)).toMatch(/<td height="200" valign="bottom">/);
    // x: an item's 1px cell, s: an empty row taking one share of the spare height
    const shares = (justify: NonNullable<StackNode["justify"]>, n: number) =>
      [...column(justify, n).matchAll(/<td (height="1"|style="font-size:0)/g)].map((m) => (m[1] === 'height="1"' ? "x" : "s")).join("");
    // one item is placed like flex-start or center
    expect(column("between", 1)).toMatch(/<td height="200" valign="top">/);
    expect(column("around", 1)).toMatch(/<td height="200" valign="middle">/);
    expect(column("evenly", 1)).toMatch(/<td height="200" valign="middle">/);
    expect(shares("between", 3)).toBe("xsxsx");
    expect(shares("around", 2)).toBe("sxssxs");
    expect(shares("evenly", 2)).toBe("sxsxs");
  });

  test("2 cols: px, pct, valign, align, padding", () => {
    const html = run(
      row([
        col(inline("a", { color: "#111" }), { width: { px: 200 }, resolved: { px: 200, pct: 33.33 }, valign: "middle", align: "right", padding: sides(0, 10, 0, 0) }),
        col(inline("b"), { width: { grow: 1 }, resolved: { px: 400, pct: 66.67 } }),
      ]),
    );
    expect(html).toBe(
      [
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">',
        "<tr>",
        '<td width="200" valign="middle" align="right" style="width:190px;padding:0 10px 0 0;color:#111;">a</td>',
        '<td valign="top">b</td>',
        "</tr>",
        "</table>",
      ].join("\n"),
    );
  });

  test("3 cols with an auto column: no width attr or css", () => {
    const html = run(
      row([
        col(inline("a"), { resolved: { px: 100, pct: 20 } }),
        col(inline("b")),
        col(inline("c"), { resolved: { px: 100, pct: 20 } }),
      ]),
    );
    expect(html.match(/<td /g)).toHaveLength(3);
    expect(html).toContain('<td valign="top">b</td>');
    expect(html).toContain('<td width="100" valign="top" style="width:20%;">a</td>');
  });

  test("grow column beside an auto column claims the free space", () => {
    const html = run(row([col(inline("a")), col(inline("b"), { width: { grow: 1 } })]));
    expect(html).toContain('<td valign="top" style="width:100%;">b</td>');
    expect(html).toContain('<td valign="top" style="white-space:nowrap;">a</td>');
  });

  test("px column keeps its px width in css, the grow column beside it has none", () => {
    const html = run(
      row([
        col(inline("a"), { width: { px: 160 }, resolved: { px: 160, pct: 27 } }),
        col(inline("b"), { width: { grow: 1 }, resolved: { px: 400, pct: 73 } }),
      ]),
    );
    expect(html).toContain('<td width="160" valign="top" style="width:160px;">a</td>');
    expect(html).toContain('<td valign="top">b</td>');
  });

  test("row with a box: box cell around the row table", () => {
    const html = run(stack([row([col(inline("a")), col(inline("b"))], { padding: sides(10), background: "#eee" })]));
    expect(html).toContain('<td bgcolor="#eeeeee" style="padding:10px;background-color:#eee;">');
    expect(html.match(/<table/g)).toHaveLength(2);
  });

  test("row with a box at the root: outer table, box cell, inner table", () => {
    const html = run(row([col(inline("a"))], { padding: sides(4), width: { px: 300 }, align: "center" }));
    expect(html).toContain('<td width="300" style="width:300px;padding:4px;">');
    expect(html).toContain('align="center"');
  });

  test("nested row in a column", () => {
    const inner = row([col(inline("x"), { resolved: { px: 50, pct: 50 } }), col(inline("y"), { resolved: { px: 50, pct: 50 } })]);
    const html = run(row([col(inner, { resolved: { px: 300, pct: 100 } })]));
    expect(html.match(/<table/g)).toHaveLength(2);
    expect(html).toContain('<td width="300" valign="top" style="width:100%;">\n<table');
  });

  test("non-zero row gap throws", () => {
    expect(() => run({ ...(row([]) as Extract<Node, { kind: "row" }>), gap: 4 })).toThrow("gap");
  });
});

describe("emit ghost tables", () => {
  test("nested container with maxWidth gets a ghost table", () => {
    const html = run(stack([stack([inline("x")], { maxWidth: 400, align: "center" })]));
    expect(html).toContain('<!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="400" align="center"><tr><td width="400"><![endif]-->');
    expect(html).toContain("<!--[if mso]></td></tr></table><![endif]-->");
    expect(html).toContain("max-width:400px;");
  });

  test("ghost width prefers resolvedWidth", () => {
    const html = run(stack([stack([inline("x")], { maxWidth: 400 }, 380)]));
    expect(html).toContain('width="380"><tr><td width="380">');
  });

  test("root with maxWidth >= options width skips the ghost", () => {
    const html = run(stack([inline("x")], { maxWidth: 600, align: "center" }));
    expect(html).not.toContain("[if");
    expect(html).toContain("max-width:600px");
  });

  test("root narrower than the page width still gets a ghost", () => {
    expect(run(stack([inline("x")], { maxWidth: 400 }))).toContain("[if mso]");
  });

  test("row container with maxWidth", () => {
    const html = run(stack([row([col(inline("a"))], { maxWidth: 300 })]));
    expect(html).toContain('width="300"><tr><td width="300">');
  });
});

describe("emit images", () => {
  test("fixed image", () => {
    expect(run(img({ width: 100, height: 50 }))).toBe(`<img src="a.png" alt="A" width="100" height="50" style="${IMG}width:100px;height:50px;">`);
  });

  test("fixed image without height", () => {
    expect(run(img({ width: 100 }))).toContain("width:100px;height:auto;");
  });

  test("fluid image", () => {
    expect(run(img({ width: 300, height: 100, fluid: true }))).toBe(
      `<img src="a.png" alt="A" width="300" style="${IMG}width:100%;max-width:300px;height:100px;">`,
    );
  });

  test("fluid image with a set height keeps the height", () => {
    expect(run(img({ height: 120, fluid: true }))).toContain("width:100%;height:120px;");
  });

  test("border and radius go on the img, empty alt is kept, attributes escaped", () => {
    const h = run(img({ width: 10, alt: "", src: 'a"b&c' }, { radius: 4, border: { top: { width: 1, style: "solid", color: "#ccc" } } }));
    expect(h).toContain('src="a&quot;b&amp;c" alt=""');
    expect(h).toContain("border-top:1px solid #ccc;border-radius:4px;");
  });

  test("linked image", () => {
    const h = run(img({ width: 10, height: 10, href: "https://x.test/?a=1&b=2" }));
    expect(h).toMatch(/^<a href="https:\/\/x.test\/\?a=1&amp;b=2" target="_blank" style="text-decoration:none;"><img /);
    expect(h).toMatch(/<\/a>$/);
  });

  test("image align goes on its slot td in a stack and in a column", () => {
    const s = run(stack([img({ width: 10, height: 10 }, { align: "center" })]));
    expect(s).toContain('<td align="center"><img');
    const r = run(row([col(img({ width: 10, height: 10 }, { align: "right" }))]));
    expect(r).toContain('<td valign="top" align="right"><img');
  });

  test("fixed-width table child gets align on its slot td", () => {
    const s = run(stack([stack([inline("x")], { width: { px: 100 }, align: "right" })]));
    expect(s).toContain('<td align="right">\n<table');
  });
});

describe("stretch columns", () => {
  test("a painted full-width card becomes the cell, gutters become spacer cells", () => {
    const card: Node = { kind: "stack", box: { ...emptyBox(), padding: sides(10), background: "#eeeeee" }, children: [{ kind: "inline", html: "a", style: {}, margin: sides(0) }], gap: 0, collapse: true, resolvedWidth: 100 };
    const html = emit(checkEmitReady({ kind: "row", box: emptyBox(), gap: 0, wrap: false, resolvedWidth: 200, cols: [
      { width: { grow: 1 }, valign: "top", stretch: true, padding: sides(0, 6, 0, 0), resolved: { px: 106, pct: 53 }, child: card },
      { width: { grow: 1 }, valign: "top", stretch: true, padding: sides(0, 0, 0, 6), resolved: { px: 94, pct: 47 }, child: { kind: "inline", html: "b", style: {}, margin: sides(0) } },
    ] }), testCtx()).html;
    // cell 100px of a 200px row = 50%, gutter 6px = 3%; the card's padding is on an inner cell
    expect(html).toContain('<td width="100" valign="top" bgcolor="#eeeeee" style="width:50%;background-color:#eeeeee;">');
    expect(html).toContain('<td style="padding:10px;">a</td>');
    expect(html).toContain('<td width="6" style="width:3%;padding-left:6px;mso-padding-alt:0;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td>');
    expect(lintEmail(html)).toEqual([]);
  });

  test("asymmetric padding: each gutter's padding equals its own px width and the shares sum to resolved.pct", () => {
    const card: Node = { kind: "stack", box: { ...emptyBox(), background: "#eeeeee" }, children: [{ kind: "inline", html: "a", style: {}, margin: sides(0) }], gap: 0, collapse: true, resolvedWidth: 100 };
    const html = emit(checkEmitReady({ kind: "row", box: emptyBox(), gap: 0, wrap: false, resolvedWidth: 200, cols: [
      { width: { grow: 1 }, valign: "top", stretch: true, padding: sides(0, 10, 0, 4), resolved: { px: 114, pct: 57 }, child: card },
    ] }), testCtx()).html;
    expect(html).toContain('<td width="4" style="width:2%;padding-left:4px;mso-padding-alt:0;');
    expect(html).toContain('<td width="10" style="width:5%;padding-left:10px;mso-padding-alt:0;');
    expect(html).toContain('style="width:50%;background-color:#eeeeee;"');
  });

  test("a fixed-px stretched column's gutter is a border-box px width with padding", () => {
    const card: Node = { kind: "stack", box: { ...emptyBox(), background: "#eeeeee" }, children: [{ kind: "inline", html: "a", style: {}, margin: sides(0) }], gap: 0, collapse: true, resolvedWidth: 100 };
    const html = emit(checkEmitReady({ kind: "row", box: emptyBox(), gap: 0, wrap: false, resolvedWidth: 200, cols: [
      { width: { px: 100 }, valign: "top", stretch: true, padding: sides(0, 8, 0, 0), resolved: { px: 108, pct: 54 }, child: card },
    ] }), testCtx()).html;
    expect(html).toContain('<td width="8" style="box-sizing:border-box;width:8px;padding-left:8px;mso-padding-alt:0;font-size:0;');
  });
});

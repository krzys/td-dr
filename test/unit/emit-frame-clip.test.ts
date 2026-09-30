import { describe, expect, test } from "vitest";
import { emit } from "../../src/emit/emit.ts";
import { checkEmitReady, emptyBox, sides, type Box, type ImageNode, type Node } from "../../src/ir/index.ts";
import { testCtx } from "../helpers/index.ts";

const html = (n: Node): string => emit(checkEmitReady(n), testCtx()).html;
const img = (o: Partial<ImageNode> = {}, box: Partial<Box> = {}): ImageNode => ({
  kind: "image",
  box: { ...emptyBox(), ...box },
  src: "a.png",
  alt: "A",
  width: 24,
  height: 24,
  ...o,
});

describe("image frame (icon circle)", () => {
  const frame = img({}, { padding: sides(16), background: "#3a2434", radius: 28 });

  test("the cell is the whole circle and the icon stays square", () => {
    const out = html(frame);
    expect(out).toContain('<table role="presentation" width="56"');
    expect(out).toMatch(/<td width="56" align="center" valign="middle" bgcolor="#3a2434" style="padding:16px;background-color:#3a2434;border-radius:28px;">/);
    expect(out).not.toMatch(/<img[^>]*border-radius/);
  });

  test("a ring border sits on the cell and widens the table, not the cell width", () => {
    const ring = img({ width: 20, height: 20 }, { padding: sides(14), background: "#0b1350", radius: 28, border: { top: { width: 4, style: "solid", color: "#d9d4ff" }, right: { width: 4, style: "solid", color: "#d9d4ff" }, bottom: { width: 4, style: "solid", color: "#d9d4ff" }, left: { width: 4, style: "solid", color: "#d9d4ff" } }, align: "center" });
    const out = html(ring);
    expect(out).toContain('<table role="presentation" width="56"');
    expect(out).toContain('align="center"');
    expect(out).toMatch(/<td width="48" align="center" valign="middle"[^>]*border-top:4px solid #d9d4ff;[^>]*border-radius:28px;/);
    expect(out).not.toMatch(/<img[^>]*border-top/);
  });

  test("without padding the paint stays on the image, as before", () => {
    const out = html(img({}, { radius: 6, border: { top: { width: 1, style: "solid", color: "#000" } } }));
    expect(out).toMatch(/<img[^>]*border-top:1px solid #000;[^>]*border-radius:6px/);
    expect(out).not.toContain("<td");
  });
});

describe("clipped box", () => {
  const strip: Node = {
    kind: "row",
    box: { ...emptyBox(), clip: true, padding: sides(12, 0) },
    gap: 0,
    wrap: false,
    cols: [{ width: { auto: true }, valign: "middle", child: img({ width: 20, height: 20 }), resolved: null }],
    resolvedWidth: 600,
  };

  test("a fixed-layout table gives an overflow:hidden cell the box width", () => {
    const out = html({ kind: "stack", box: emptyBox(), children: [strip], gap: 0, collapse: false, resolvedWidth: 600 });
    expect(out).toContain('<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;">');
    expect(out).toContain('<td style="overflow:hidden;white-space:nowrap;">');
    expect(out).toMatch(/<td style="padding:12px 0;">\n<table[^>]*table-layout:fixed/);
  });

  test("padding and border come off the inner table's width", () => {
    const padded: Node = { ...strip, box: { ...emptyBox(), clip: true, padding: sides(0, 20) } } as Node;
    expect(html(padded)).toContain('<table role="presentation" width="560"');
  });

  test("text styles of a lone inline child move into the clipping cell", () => {
    const text: Node = { kind: "stack", box: { ...emptyBox(), clip: true }, children: [{ kind: "inline", html: "long", style: { color: "#fff" }, margin: sides(0) }], gap: 0, collapse: false, resolvedWidth: 600 };
    expect(html(text)).toContain('<td style="overflow:hidden;white-space:nowrap;color:#fff;">');
  });
});

describe("clip on a stretched, painted column", () => {
  test("a clipped card is not painted straight onto the column cell", async () => {
    const { compile } = await import("../../src/index.ts");
    const input = `<div style="max-width:600px;margin:0 auto;font-family:Arial"><div style="display:flex"><div style="width:100px;background:#eee;overflow:hidden;white-space:nowrap"><p style="margin:0">long text long text long text long text</p></div><div>b</div></div></div>`;
    const out = compile(input, { strict: false }).html;
    expect(out).toContain("table-layout:fixed");
    expect(out).toMatch(/<td[^>]*style="overflow:hidden;white-space:nowrap;/);
  });
});

describe("clipped box narrower than its padding", () => {
  test("the clipping table gets no negative width", () => {
    const tight: Node = { kind: "stack", box: { ...emptyBox(), clip: true, width: { px: 20 }, padding: sides(0, 16) }, children: [{ kind: "inline", html: "long", style: {}, margin: sides(0) }], gap: 0, collapse: false, resolvedWidth: 20 };
    const out = html({ kind: "stack", box: emptyBox(), children: [tight], gap: 0, collapse: false, resolvedWidth: 600 });
    expect(out).not.toMatch(/width="-/);
    expect(out).toContain('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;">\n<tr>\n<td style="overflow:hidden;');
  });
});

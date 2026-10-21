import { describe, expect, test } from "vitest";
import { emptyBox, sides, type Box, type Node, type StackNode } from "../../../src/ir/index.ts";
import { bleed } from "../../../src/passes/bleed.ts";
import { testCtx } from "../../helpers/index.ts";

const box = (o: Partial<Box> = {}): Box => ({ ...emptyBox(), ...o });
const inline = (margin = sides(0)): Node => ({ kind: "inline", html: "<p>x</p>", style: {}, margin });
const band = (margin: Box["margin"]): Node => ({ kind: "stack", box: box({ margin, background: "#eee" }), children: [], gap: 0, collapse: false, loc: { line: 3, col: 1 } });
const card = (b: Partial<Box>, children: Node[], collapse = true): StackNode => ({ kind: "stack", box: box(b), children, gap: 0, collapse });

const run = (n: Node) => {
  const ctx = testCtx();
  return { out: bleed.run(n, ctx) as StackNode, ctx };
};

describe("bleed", () => {
  test("side bleed moves the parent's padding to the other children and zeroes the band's margin", () => {
    const { out } = run(card({ padding: sides(24) }, [inline(), band(sides(0, -24))]));
    expect(out.box.padding).toEqual(sides(24, 0));
    const [wrapped, b] = out.children as [StackNode, StackNode];
    expect(wrapped.box.padding).toEqual({ top: 0, right: 24, bottom: 0, left: 24 });
    expect(b.box.margin).toEqual(sides(0));
  });

  test("a bottom bleed on the last child takes the parent's bottom radii", () => {
    const { out } = run(card({ padding: sides(24), radius: 10 }, [inline(), band({ top: 0, right: -24, bottom: -24, left: -24 })]));
    expect(out.box.padding.bottom).toBe(0);
    const b = out.children[1] as StackNode;
    expect(b.box.radii).toEqual([0, 0, 10, 10]);
  });

  test("a bottom bleed on a middle child is left alone and reported", () => {
    const { out, ctx } = run(card({ padding: sides(24) }, [band({ top: 0, right: 0, bottom: -24, left: 0 }), inline()]));
    expect(out.box.padding.bottom).toBe(24);
    expect(ctx.diagnostics.list().map((d) => d.code)).toEqual(["E005"]);
  });

  test("a margin that does not cancel the padding is reported", () => {
    const { ctx } = run(card({ padding: sides(24) }, [band(sides(0, -10))]));
    expect(ctx.diagnostics.list().map((d) => d.code)).toEqual(["E005"]);
  });

  test("a top bleed on the first child zeroes padding.top and takes the top radii", () => {
    const { out } = run(card({ padding: sides(24), radius: 10 }, [band({ top: -24, right: -24, bottom: 0, left: -24 }), inline()]));
    expect(out.box.padding).toEqual({ top: 0, right: 0, bottom: 24, left: 0 });
    expect((out.children[0] as StackNode).box.radii).toEqual([10, 10, 0, 0]);
  });

  test("the radius is inset by the parent's border width", () => {
    const border = { top: { width: 2, style: "solid" as const, color: "#000" }, left: { width: 2, style: "solid" as const, color: "#000" } };
    const { out } = run(card({ padding: sides(24), radius: 10, border }, [band({ top: -24, right: -24, bottom: 0, left: -24 }), inline()]));
    expect((out.children[0] as StackNode).box.radii).toEqual([8, 8, 0, 0]);
  });

  test("siblings between the same bleeds share one wrapper, a band splits them", () => {
    const { out } = run(card({ padding: sides(24) }, [inline(), inline(), band(sides(0, -24)), inline()]));
    expect(out.children.map((c) => c.kind)).toEqual(["stack", "stack", "stack"]);
    expect((out.children[0] as StackNode).children).toHaveLength(2);
    expect((out.children[1] as StackNode).box.margin).toEqual(sides(0));
    expect((out.children[2] as StackNode).children).toHaveLength(1);
  });

  test("a left-only bleed pads the siblings on the left only", () => {
    const { out } = run(card({ padding: sides(24) }, [inline(), band({ top: 0, right: 0, bottom: 0, left: -24 })]));
    expect(out.box.padding).toEqual({ top: 24, right: 24, bottom: 24, left: 0 });
    expect((out.children[0] as StackNode).box.padding).toEqual({ top: 0, right: 0, bottom: 0, left: 24 });
  });

  test("a non-collapsing (flex) parent is left alone and reported", () => {
    const { out, ctx } = run(card({ padding: sides(24) }, [inline(), band(sides(0, -24))], false));
    expect(out.box.padding).toEqual(sides(24));
    expect(ctx.diagnostics.list().map((d) => d.code)).toEqual(["E005"]);
  });

  test("reported leftovers are clamped to 0", () => {
    const { out } = run(card({ padding: sides(24) }, [band(sides(0, -10))]));
    expect((out.children[0] as StackNode).box.margin).toEqual(sides(0));
  });

  test("a bottom bleed is refused when the band's last child margin would escape", () => {
    const leaky = card({ padding: sides(8, 24, 0), margin: { top: 0, right: -24, bottom: -24, left: -24 }, background: "#eee" }, [inline(), inline({ top: 0, right: 0, bottom: 12, left: 0 })]);
    const { out, ctx } = run(card({ padding: sides(24) }, [inline(), leaky]));
    expect(out.box.padding.bottom).toBe(24);
    expect(ctx.diagnostics.list().map((d) => d.code)).toEqual(["E005"]);
  });

  test("a top bleed is refused when the band's first child margin would escape", () => {
    const leaky = card({ padding: sides(0, 24, 8), margin: { top: -24, right: -24, bottom: 0, left: -24 }, background: "#eee" }, [inline({ top: 10, right: 0, bottom: 0, left: 0 }), inline()]);
    const { out, ctx } = run(card({ padding: sides(24) }, [leaky, inline()]));
    expect(out.box.padding.top).toBe(24);
    expect(ctx.diagnostics.list().map((d) => d.code)).toEqual(["E005"]);
  });
});

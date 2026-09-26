import { describe, expect, test } from "vitest";
import { emptyBox, sides, type Box, type Node, type RowNode, type StackNode } from "../../../src/ir/index.ts";
import { resolveWidths } from "../../../src/passes/resolve-widths.ts";
import { codesOf, testCtx } from "../../helpers/index.ts";
import { givenPadded } from "../../helpers/phase.ts";

const box = (o: Partial<Box> = {}): Box => ({ ...emptyBox(), ...o });
const stack = (b: Partial<Box>, children: Node[] = []): StackNode => ({
  kind: "stack",
  box: box(b),
  children,
  gap: 0,
  collapse: false,
});
const img = (o: object = {}): Node => ({ kind: "image", box: box(), src: "a.png", alt: "", ...o });
const row = (cols: RowNode["cols"], gap = 0): RowNode => ({ kind: "row", box: box(), gap, wrap: false, cols });
const col = (width: RowNode["cols"][number]["width"], child: Node, extra: object = {}) => ({
  width,
  valign: "top" as const,
  child,
  ...extra,
});

describe("resolve-widths", () => {
  test("root gets the email width, maxWidth clamps nested containers", () => {
    const inner = stack({ maxWidth: 400 });
    const out = resolveWidths.run(givenPadded(stack({}, [inner])), testCtx()) as StackNode;
    expect(out.resolvedWidth).toBe(600);
    expect((out.children[0] as StackNode).resolvedWidth).toBe(400);
  });

  test("pct width is of the parent's content box", () => {
    const out = resolveWidths.run(givenPadded(stack({ padding: sides(0, 50) }, [stack({ width: { pct: 50 } })])), testCtx()) as StackNode;
    expect((out.children[0] as StackNode).resolvedWidth).toBe(250);
  });

  test("padding and border reduce the content width", () => {
    const side = { width: 5, style: "solid" as const, color: "#000" };
    const inner = img({ fluid: true });
    const out = resolveWidths.run(givenPadded(
      stack({ padding: sides(0, 10), border: { left: side, right: side } }, [inner])),
      testCtx(),
    ) as StackNode;
    expect(out.children[0]).toMatchObject({ width: 570, fluid: true });
  });

  test("nested row in a column gets the column's px", () => {
    const nested = row([col({ grow: 1 }, img({ fluid: true }))]);
    const outer = row([col({ px: 200 }, nested), col({ grow: 1 }, stack({}))]);
    const out = resolveWidths.run(givenPadded(outer), testCtx()) as RowNode;
    expect(out.cols[0]!.resolved).toEqual({ px: 200, pct: 33.33 });
    const n = out.cols[0]!.child as RowNode;
    expect(n.resolvedWidth).toBe(200);
    expect(n.cols[0]!.child).toMatchObject({ width: 200 });
  });

  test("column padding reduces the child's available width", () => {
    const outer = row([col({ px: 300 }, stack({}), { padding: sides(0, 10) })]);
    const out = resolveWidths.run(givenPadded(outer), testCtx()) as RowNode;
    expect((out.cols[0]!.child as StackNode).resolvedWidth).toBe(280);
  });

  test("auto columns are left to the table (null, not unresolved) and the child sees the content width", () => {
    const outer = row([col({ auto: true }, stack({}))]);
    const out = resolveWidths.run(givenPadded(outer), testCtx()) as RowNode;
    expect(out.cols[0]!.resolved).toBeNull();
    expect((out.cols[0]!.child as StackNode).resolvedWidth).toBe(600);
  });

  test("fluid image gets its slot width", () => {
    const out = resolveWidths.run(givenPadded(row([col({ pct: 50 }, img({ fluid: true }))])), testCtx()) as RowNode;
    expect(out.cols[0]!.child).toMatchObject({ width: 300, fluid: true });
  });

  test("max-width above the slot is a silent no-op; a fixed width above it warns", () => {
    const ctx = testCtx();
    expect((resolveWidths.run(givenPadded(stack({ maxWidth: 800 })), ctx) as StackNode).resolvedWidth).toBe(600);
    expect(codesOf(ctx)).toEqual([]);
    expect((resolveWidths.run(givenPadded(stack({ width: { px: 800 } })), ctx) as StackNode).resolvedWidth).toBe(600);
    expect(codesOf(ctx)).toEqual(["W004"]);
  });

  test("too-wide image warns and is left alone", () => {
    const ctx = testCtx();
    const image = img({ width: 900 });
    const out = resolveWidths.run(givenPadded(stack({}, [image])), ctx) as StackNode;
    expect(out.children[0]).toBe(image);
    expect(codesOf(ctx)).toEqual(["W004"]);
  });

  test("recurses through conditionals", () => {
    const out = resolveWidths.run(givenPadded({ kind: "conditional", target: "mso", child: stack({}) }), testCtx());
    expect((out as { child: StackNode }).child.resolvedWidth).toBe(600);
  });

  test("does not mutate the input", () => {
    const input = stack({}, [row([col({ grow: 1 }, img({ fluid: true }))])]);
    const snapshot = structuredClone(input);
    resolveWidths.run(givenPadded(input), testCtx());
    expect(input).toEqual(snapshot);
  });
});

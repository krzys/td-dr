import { describe, expect, test } from "vitest";
import { emptyBox, sides, type Box, type Column, type Node, type RowNode, type StackNode } from "../../../src/ir/index.ts";
import { flattenStacks } from "../../../src/passes/flatten-stacks.ts";
import { testCtx } from "../../helpers/index.ts";
import { givenEmitReady } from "../../helpers/phase.ts";

const run = (n: Node) => flattenStacks.run(givenEmitReady(n), testCtx());
const img = (src: string): Node => ({ kind: "image", box: emptyBox(), src, alt: "" });
const col = (child: Node): Column => ({ width: { auto: true }, valign: "top", child });
const row = (cols: Column[]): RowNode => ({ kind: "row", box: emptyBox(), gap: 0, wrap: false, cols });
const stack = (children: Node[], extra: Partial<StackNode> = {}, box: Partial<Box> = {}): StackNode => ({
  kind: "stack",
  box: { ...emptyBox(), ...box },
  children,
  gap: 0,
  collapse: false,
  ...extra,
});

describe("flatten-stacks", () => {
  test("a boxless stack inside a stack gives its children to the parent, in place", () => {
    const out = run(stack([img("a"), stack([img("b"), img("c")]), img("d")])) as StackNode;
    expect(out.children.map((c) => (c as { src: string }).src)).toEqual(["a", "b", "c", "d"]);
  });

  test("flattens through several levels", () => {
    const out = run(stack([stack([stack([img("a")])])])) as StackNode;
    expect(out.children).toEqual([img("a")]);
  });

  test("keeps a child with padding, paint, width or align", () => {
    for (const box of [
      { padding: sides(4, 0, 0, 0) },
      { background: "#fff" },
      { width: { px: 300 } },
      { maxWidth: 300 },
      { align: "center" as const },
      { minHeight: 10 },
      { radius: 4 },
      { clip: true },
      { border: { top: { width: 1, style: "solid" as const, color: "#000" } } },
    ]) {
      const out = run(stack([stack([img("a")], {}, box)])) as StackNode;
      expect(out.children).toHaveLength(1);
      expect(out.children[0]!.kind).toBe("stack");
    }
  });

  test("keeps a child with a gap or justify", () => {
    expect((run(stack([stack([img("a")], { gap: 4 })])) as StackNode).children[0]!.kind).toBe("stack");
    expect((run(stack([stack([img("a")], { justify: "end" })])) as StackNode).children[0]!.kind).toBe("stack");
  });

  test("keeps children in a parent that distributes them", () => {
    const out = run(stack([stack([img("a"), img("b")])], { justify: "center" }, { minHeight: 100 })) as StackNode;
    expect(out.children).toHaveLength(1);
  });

  test("does not touch stacks inside a template or conditional", () => {
    const inner = stack([img("a")]);
    const tpl: Node = { kind: "template", op: "each", path: "items", child: inner };
    const cond: Node = { kind: "conditional", target: "mso", child: inner };
    const out = run(stack([tpl, cond])) as StackNode;
    expect(out.children).toEqual([tpl, cond]);
  });

  test("keeps a child whose children would all be Outlook-only", () => {
    const cond: Node = { kind: "conditional", target: "mso", child: img("a") };
    const out = run(stack([stack([cond])])) as StackNode;
    expect(out.children[0]!.kind).toBe("stack");
  });

  test("keeps a child of Outlook-only children, ghost rows included", () => {
    const cond: Node = { kind: "conditional", target: "mso", child: img("a") };
    const ghost = row([col({ kind: "conditional", target: "mso", child: img("b") })]);
    const out = run(stack([cond, stack([ghost])])) as StackNode;
    expect(out.children).toEqual([cond, stack([ghost])]);
  });

  test("merges a child that mixes Outlook-only and shared children", () => {
    const cond: Node = { kind: "conditional", target: "mso", child: img("a") };
    expect((run(stack([stack([img("b"), cond])])) as StackNode).children).toEqual([img("b"), cond]);
  });

  test("a not-mso conditional does not hold its stack back", () => {
    const cond: Node = { kind: "conditional", target: "not-mso", child: img("a") };
    expect((run(stack([stack([cond])])) as StackNode).children).toEqual([cond]);
  });

  test("flattens inside a template's child but leaves the template itself", () => {
    const tpl: Node = { kind: "template", op: "each", path: "items", child: stack([stack([img("a")])]) };
    const out = run(stack([tpl])) as StackNode;
    expect(out.children).toEqual([{ ...tpl, child: stack([img("a")]) }]);
  });

  test("never flattens a column's stack into its row", () => {
    const r = row([col(stack([img("a")]))]);
    expect(run(r)).toEqual(r);
  });

  test("drops an empty boxless stack", () => {
    expect((run(stack([img("a"), stack([]), img("b")])) as StackNode).children).toEqual([img("a"), img("b")]);
  });
});

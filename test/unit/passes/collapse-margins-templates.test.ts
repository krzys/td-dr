import { describe, expect, test } from "vitest";
import {
  emptyBox,
  sides,
  type Node,
  type Sides,
  type StackNode,
  type TemplateNode,
} from "../../../src/ir/index.ts";
import { templateChildren } from "../../../src/ir/helpers.ts";
import { collapseMargins } from "../../../src/passes/collapse-margins.ts";
import { marginToPadding } from "../../../src/passes/margin-to-padding.ts";
import { testCtx } from "../../helpers/index.ts";

const block = (top: number, bottom: number): Node => ({ kind: "inline", html: "x", style: {}, margin: sides(top, 0, bottom, 0) });
const mOf = (n: Node): Sides => (n.kind === "inline" ? n.margin : sides(NaN));

const iff = (...arms: Node[]): TemplateNode => {
  const [first, ...rest] = arms;
  const branches = [{ when: { op: "truthy" as const, path: "a" }, child: first! }];
  // the last arm of a chain with more than one is the else
  if (rest.length === 0) return { kind: "template", op: "if", branches };
  const otherwise = rest.pop()!;
  return {
    kind: "template",
    op: "if",
    branches: [...branches, ...rest.map((child, i) => ({ when: { op: "truthy" as const, path: `b${i}` }, child }))],
    otherwise,
  };
};
const each = (child: Node): TemplateNode => ({ kind: "template", op: "each", path: "xs", child });

const stack = (children: Node[], over: { top?: number; bottom?: number; padTop?: number; padBottom?: number } = {}): StackNode => ({
  kind: "stack",
  box: {
    ...emptyBox(),
    margin: sides(over.top ?? 0, 0, over.bottom ?? 0, 0),
    padding: sides(over.padTop ?? 1, 0, over.padBottom ?? 1, 0),
  },
  children,
  gap: 0,
  collapse: true,
});

const run = (n: Node) => {
  const ctx = testCtx();
  const out = collapseMargins.run(n, ctx) as StackNode;
  return { out, codes: ctx.diagnostics.list().map((d) => d.code) };
};

const css = Math.max;

describe("collapse-margins around template nodes", () => {
  test("if: the unconditional part stays outside, only the extra goes inside", () => {
    const { out, codes } = run(stack([block(0, 16), iff(block(24, 24)), block(16, 0)]));
    const [a, t, c] = out.children as [Node, TemplateNode, Node];
    expect([mOf(a).bottom, mOf(templateChildren(t)[0]!).top, mOf(templateChildren(t)[0]!).bottom, mOf(c).top]).toEqual([16, 8, 24, 0]);
    expect(codes).toEqual([]);
  });

  test("if: every outcome gives the spacing of the HTML render", () => {
    for (const a of [0, 8, 16])
      for (const bt of [0, 4, 16, 24])
        for (const bb of [0, 12, 24])
          for (const c of [0, 8, 16, 32]) {
            const { out, codes } = run(stack([block(0, a), iff(block(bt, bb)), block(c, 0)]));
            const [A, T, C] = out.children as [Node, TemplateNode, Node];
            const B = mOf(templateChildren(T)[0]!);
            const label = `a${a} bt${bt} bb${bb} c${c}`;
            expect(mOf(A).bottom + B.top, label).toBe(css(a, bt));
            expect(B.bottom + mOf(C).top, label).toBe(css(bb, c));
            expect(mOf(A).bottom + mOf(C).top, label).toBe(css(a, c));
            expect(codes, label).toEqual([]);
          }
  });

  test("else: an arm is always shown, so each arm adds only its own extra", () => {
    const { out, codes } = run(stack([block(0, 16), iff(block(24, 12), block(8, 32)), block(20, 0)]));
    const [a, t, c] = out.children as [Node, TemplateNode, Node];
    const [x, y] = templateChildren(t).map(mOf);
    expect(mOf(a).bottom + x!.top).toBe(24);
    expect(x!.bottom + mOf(c).top).toBe(20);
    expect(mOf(a).bottom + y!.top).toBe(16);
    expect(y!.bottom + mOf(c).top).toBe(32);
    expect([mOf(a).bottom, mOf(c).top]).toEqual([16, 0]);
    expect(codes).toEqual([]);
  });

  test("chain without else can be dropped: every arm and the empty case agree", () => {
    const withoutElse: TemplateNode = {
      kind: "template",
      op: "if",
      branches: [
        { when: { op: "truthy", path: "a" }, child: block(10, 0) },
        { when: { op: "truthy", path: "b" }, child: block(30, 4) },
      ],
    };
    const { out, codes } = run(stack([block(0, 6), withoutElse, block(2, 0)]));
    const [A, T, C] = out.children as [Node, TemplateNode, Node];
    const arms = templateChildren(T).map(mOf);
    expect(mOf(A).bottom + mOf(C).top).toBe(6);
    expect(arms.map((m) => mOf(A).bottom + m.top)).toEqual([10, 30]);
    expect(arms.map((m) => m.bottom + mOf(C).top)).toEqual([2, 4]);
    expect(codes).toEqual([]);
  });

  test("each: edges are the neighbours', the gap between items is inside", () => {
    const { out, codes } = run(stack([block(0, 16), each(block(0, 8)), block(4, 0)]));
    const [a, t, c] = out.children as [Node, TemplateNode, Node];
    const item = mOf(templateChildren(t)[0]!);
    expect([mOf(a).bottom, item.top, item.bottom, mOf(c).top]).toEqual([16, 0, 8, 0]);
    // 0 items 16, 1 item 16 / 8, n items 8 between
    expect(mOf(a).bottom + mOf(c).top).toBe(16);
    expect(item.bottom + item.top).toBe(8);
    expect(codes).toEqual([]);
  });

  test("each: spacing no padding can give keeps the item's margins inside", () => {
    const { out, codes } = run(stack([block(0, 0), each(block(8, 8)), block(0, 0)]));
    const t = out.children[1] as TemplateNode;
    expect(mOf(templateChildren(t)[0]!)).toEqual(sides(8, 0, 8, 0));
    expect(codes).toEqual(["W003"]);
  });

  test("one unsolved construct gives one W003, not one per side", () => {
    expect(run(stack([block(0, 16), each(block(8, 8)), block(16, 0)])).codes).toEqual(["W003"]);
  });

  test("each: a margin on a neighbour that the list cannot match is reported", () => {
    const { codes } = run(stack([block(0, 0), each(block(0, 8)), block(16, 0)]));
    expect(codes).toEqual(["W003"]);
  });

  test("first child of a padded container: nothing to hoist into, the node keeps what it needs", () => {
    const { out, codes } = run(stack([iff(block(12, 0)), block(20, 0)]));
    const [t, c] = out.children as [TemplateNode, Node];
    expect(mOf(templateChildren(t)[0]!).top).toBe(12);
    expect(mOf(c).top).toBe(20);
    expect(codes).toEqual([]);
  });

  test("last child of a padded container", () => {
    const { out, codes } = run(stack([block(0, 14), iff(block(10, 18))]));
    const [a, t] = out.children as [Node, TemplateNode];
    const b = mOf(templateChildren(t)[0]!);
    expect(mOf(a).bottom + b.top).toBe(14);
    expect(b.bottom).toBe(18);
    expect(mOf(a).bottom).toBe(14);
    expect(codes).toEqual([]);
  });

  test("first child of an open container: the container's margin stays and the node adds the rest", () => {
    const { out, codes } = run(stack([iff(block(24, 0)), block(0, 0)], { top: 16, padTop: 0 }));
    expect(out.box.margin.top).toBe(16);
    // the container's margin collapses again further up, so the extra cannot be added exactly here
    expect(mOf(templateChildren(out.children[0] as TemplateNode)[0]!).top).toBe(24);
    expect(codes).toEqual(["W003"]);
  });

  test("first child of an open container whose margin already covers the node: exact", () => {
    const { out, codes } = run(stack([iff(block(10, 0)), block(0, 0)], { top: 16, padTop: 0 }));
    expect(mOf(templateChildren(out.children[0] as TemplateNode)[0]!).top).toBe(0);
    expect(codes).toEqual([]);
  });

  test("open wrapper in a padded stack: P mb20, wrapper mt10 [if mt24, C] is reported, not approximated", () => {
    const wrapper = stack([iff(block(24, 0)), block(0, 0)], { top: 10, padTop: 0, padBottom: 1 });
    const { codes } = run(stack([block(0, 20), wrapper]));
    expect(codes).toEqual(["W003"]);
  });

  test("last child of an open wrapper: [wrapper mb10 [A, if mb24], D mt20] is reported", () => {
    const wrapper = stack([block(0, 0), iff(block(0, 24))], { bottom: 10, padBottom: 0, padTop: 1 });
    const { codes } = run(stack([wrapper, block(20, 0)]));
    expect(codes).toEqual(["W003"]);
  });

  test("an arm that is an empty open stack (through node) is reported next to margins", () => {
    const empty: StackNode = { ...stack([], { top: 10, bottom: 10, padTop: 0, padBottom: 0 }) };
    const { codes } = run(stack([block(0, 4), iff(empty), block(4, 0)]));
    expect(codes).toEqual(["W003"]);
  });

  test("each: an item with margin on both sides is reported, the repeat adds them", () => {
    expect(run(stack([block(0, 0), each(block(8, 8)), block(0, 0)])).codes).toEqual(["W003"]);
    expect(run(stack([each(block(8, 8))])).codes).toEqual(["W003"]);
  });

  test("each: 0, 1 and n items between neighbours when the item's top margin is larger", () => {
    for (const a of [0, 6, 12])
      for (const it of [10, 20])
        for (const ib of [0, 4])
          for (const c of [0, 8, 30]) {
            const { out, codes } = run(stack([block(0, a), each(block(it, ib)), block(c, 0)]));
            if (codes.length) continue; // reported instead
            const [A, T, C] = out.children as [Node, TemplateNode, Node];
            const m = mOf(templateChildren(T)[0]!);
            const label = `a${a} it${it} ib${ib} c${c}`;
            expect(mOf(A).bottom + mOf(C).top, label).toBe(css(a, c));
            expect(mOf(A).bottom + m.top, label).toBe(css(a, it));
            expect(m.bottom + mOf(C).top, label).toBe(css(ib, c));
            expect(m.bottom + m.top, label).toBe(css(ib, it));
          }
  });

  test("if / else-if without else: every arm and the absent case, arms with different margins", () => {
    const chain: TemplateNode = {
      kind: "template",
      op: "if",
      branches: [
        { when: { op: "truthy", path: "a" }, child: block(12, 3) },
        { when: { op: "truthy", path: "b" }, child: block(2, 40) },
      ],
    };
    const { out, codes } = run(stack([block(0, 8), chain, block(5, 0)]));
    const [A, T, C] = out.children as [Node, TemplateNode, Node];
    expect(mOf(A).bottom + mOf(C).top).toBe(8);
    expect(templateChildren(T).map((k) => mOf(A).bottom + mOf(k).top)).toEqual([12, 8]);
    expect(templateChildren(T).map((k) => mOf(k).bottom + mOf(C).top)).toEqual([5, 40]);
    expect(codes).toEqual([]);
  });

  test("a construct next to a construct is left as it was and reported when both have margins", () => {
    const { codes } = run(stack([iff(block(8, 8)), iff(block(8, 8))]));
    expect(codes).toEqual(["W003"]);
  });

  test("absent outcome at an open top: P mb20, wrapper [if(B 0/0), C mt16] is reported", () => {
    const wrapper = stack([iff(block(0, 0)), block(16, 0)], { padTop: 0, padBottom: 1 });
    expect(run(stack([block(0, 20), wrapper])).codes).toEqual(["W003"]);
  });

  test("absent outcome at an open bottom: wrapper [A mb16, if(B 0/0)], D mt20 is reported", () => {
    const wrapper = stack([block(0, 16), iff(block(0, 0))], { padTop: 1, padBottom: 0 });
    expect(run(stack([wrapper, block(20, 0)])).codes).toEqual(["W003"]);
  });

  test("an each with 0 items at an open bottom is reported", () => {
    const wrapper = stack([block(0, 16), each(block(0, 0))], { padTop: 1, padBottom: 0 });
    expect(run(stack([wrapper, block(20, 0)])).codes).toEqual(["W003"]);
  });

  test("two adjacent ifs between margined neighbours are reported", () => {
    expect(run(stack([block(0, 16), iff(block(0, 0)), iff(block(0, 0)), block(16, 0)])).codes).toEqual(["W003"]);
  });

  test("an if before an empty through stack with a margin is reported", () => {
    const through = stack([], { top: 20, padTop: 0, padBottom: 0 });
    expect(run(stack([block(0, 16), iff(block(0, 0)), through, block(0, 0)])).codes).toEqual(["W003"]);
  });

  test("an if whose arm is an if, between margined neighbours, is reported", () => {
    expect(run(stack([block(0, 16), iff(iff(block(24, 0))), block(16, 0)])).codes).toEqual(["W003"]);
  });

  test("an else that can never be empty at an open edge stays quiet", () => {
    const wrapper = stack([block(0, 16), iff(block(0, 0), block(0, 0))], { padTop: 1, padBottom: 0 });
    expect(run(stack([wrapper, block(20, 0)])).codes).toEqual([]);
  });

  test("an if first in an open wrapper is reported: the margin above the wrapper may meet it", () => {
    const open = { padTop: 0, padBottom: 0 };
    expect(run(stack([block(0, 20), stack([iff(block(24, 0)), block(0, 0)], open)])).codes).toContain("W003");
    expect(run(stack([block(0, 20), stack([each(block(8, 0)), block(0, 0)], open)])).codes).toContain("W003");
  });
  test("an if last in an open wrapper is reported: what follows the wrapper may meet it", () => {
    const open = { padTop: 0, padBottom: 0 };
    expect(run(stack([stack([block(0, 0), iff(block(0, 24))], open), block(20, 0)])).codes).toContain("W003");
    expect(run(stack([stack([block(0, 0), iff(block(0, 24), block(0, 0))], open), block(20, 0)])).codes).toContain("W003");
  });
  test("an open wrapper alone in a padded parent: the pass cannot see past the wrapper, so it still reports (conservative)", () => {
    const open = { padTop: 0, padBottom: 0 };
    expect(run(stack([stack([iff(block(24, 0)), block(0, 0)], open)])).codes).toEqual(["W003"]);
    expect(run(stack([stack([block(0, 0), iff(block(0, 24))], open)])).codes).toEqual(["W003"]);
  });
  test("margin-to-padding turns the arms' margins into padding inside the construct", () => {
    const { out } = run(stack([block(0, 16), iff(block(24, 24)), block(16, 0)]));
    const padded = marginToPadding.run(out, testCtx()) as StackNode;
    const [a, t, c] = padded.children;
    expect(a?.kind === "stack" ? a.box.padding.bottom : NaN).toBe(16);
    expect(t!.kind).toBe("template");
    const arm = templateChildren(t as TemplateNode)[0]!;
    expect(arm.kind === "stack" ? [arm.box.padding.top, arm.box.padding.bottom] : []).toEqual([8, 24]);
    expect(c).toEqual(block(0, 0));
  });
});

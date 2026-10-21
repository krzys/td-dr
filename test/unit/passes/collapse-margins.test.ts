import { describe, expect, test } from "vitest";
import { emptyBox, sides, type Border, type Node, type Sides, type StackNode } from "../../../src/ir/index.ts";
import { collapseMargins } from "../../../src/passes/collapse-margins.ts";
import { testCtx } from "../../helpers/index.ts";

const m = (top: number, bottom: number, left = 0): Sides => ({ top, right: left, bottom, left });

const inline = (top: number, bottom: number): Node => ({ kind: "inline", html: "x", style: {}, margin: m(top, bottom) });
const image = (top: number, bottom: number): Node => ({
  kind: "image",
  box: { ...emptyBox(), margin: m(top, bottom) },
  src: "a.png",
  alt: "",
});

type StackOpts = { top?: number; bottom?: number; collapse?: boolean; padTop?: number; padBottom?: number; border?: Border };
const stack = (children: Node[], o: StackOpts = {}): StackNode => ({
  kind: "stack",
  box: {
    ...emptyBox(),
    margin: m(o.top ?? 0, o.bottom ?? 0),
    padding: sides(o.padTop ?? 0, 0, o.padBottom ?? 0, 0),
    ...(o.border ? { border: o.border } : {}),
  },
  children,
  gap: 0,
  collapse: o.collapse ?? true,
});

const row = (top: number, bottom: number, child: Node): Node => ({
  kind: "row",
  box: { ...emptyBox(), margin: m(top, bottom) },
  gap: 0,
  wrap: false,
  cols: [{ width: { auto: true }, valign: "top", child }],
});

const run = (n: Node): Node => collapseMargins.run(n, testCtx());
const mt = (n: Node) => (n.kind === "inline" ? n.margin : "box" in n ? n.box.margin : NaN);
const tb = (n: Node) => [mt(n) as Sides].map((s) => [s.top, s.bottom])[0];
const kids = (n: Node) => (n as StackNode).children;

describe("collapse-margins", () => {
  test("has the right name", () => {
    expect(collapseMargins.name).toBe("collapse-margins");
  });

  test("adjacent siblings take the larger margin", () => {
    const out = run(stack([inline(0, 20), inline(30, 0)], { padTop: 1, padBottom: 1 }));
    expect(kids(out).map(tb)).toEqual([
      [0, 30],
      [0, 0],
    ]);
  });

  test("equal and smaller-following margins", () => {
    const out = run(stack([inline(5, 20), inline(20, 8), inline(3, 0)], { padTop: 1, padBottom: 1 }));
    expect(kids(out).map(tb)).toEqual([
      [5, 20],
      [0, 8],
      [0, 0],
    ]);
  });

  test("first child margin surfaces onto the parent", () => {
    const out = run(stack([inline(25, 0)], { top: 10 }));
    expect(tb(out)).toEqual([25, 0]);
    expect(tb(kids(out)[0]!)).toEqual([0, 0]);
  });

  test("last child margin surfaces onto the parent bottom", () => {
    const out = run(stack([inline(0, 25)], { bottom: 40 }));
    expect(tb(out)).toEqual([0, 40]);
    expect(tb(kids(out)[0]!)).toEqual([0, 0]);
  });

  test("padding stops parent/child collapsing", () => {
    const out = run(stack([inline(25, 25)], { top: 10, bottom: 10, padTop: 1, padBottom: 1 }));
    expect(tb(out)).toEqual([10, 10]);
    expect(tb(kids(out)[0]!)).toEqual([25, 25]);
  });

  test("border stops parent/child collapsing", () => {
    const b = { width: 1, style: "solid" as const, color: "#000" };
    const top = run(stack([inline(25, 25)], { border: { top: b } }));
    expect(tb(top)).toEqual([0, 25]);
    expect(tb(kids(top)[0]!)).toEqual([25, 0]);
    const bottom = run(stack([inline(25, 25)], { border: { bottom: b } }));
    expect(tb(bottom)).toEqual([25, 0]);
    expect(tb(kids(bottom)[0]!)).toEqual([0, 25]);
  });

  test("nested chains surface fully at the root", () => {
    const inner = stack([inline(50, 60)], { top: 5, bottom: 6 });
    const mid = stack([inner], { top: 7, bottom: 8 });
    const root = stack([mid]);
    const out = run(root);
    expect(tb(out)).toEqual([50, 60]);
    const midOut = kids(out)[0]!;
    expect(tb(midOut)).toEqual([0, 0]);
    expect(tb(kids(midOut)[0]!)).toEqual([0, 0]);
    expect(tb(kids(kids(midOut)[0]!)[0]!)).toEqual([0, 0]);
  });

  test("a sibling margin collapses into a nested last child", () => {
    const group = stack([inline(0, 30)]);
    const out = run(stack([group, inline(10, 0)], { padTop: 1, padBottom: 1 }));
    expect(kids(out).map(tb)).toEqual([
      [0, 30],
      [0, 0],
    ]);
  });

  test("flex stack (collapse: false) keeps its children's margins", () => {
    const flex = stack([inline(10, 10), inline(20, 20)], { collapse: false, top: 4, bottom: 4 });
    const out = run(flex);
    expect(out).toEqual(flex);
  });

  test("flex stack's own margins still collapse with siblings and parent", () => {
    const flex = stack([inline(10, 10)], { collapse: false, top: 15, bottom: 20 });
    const out = run(stack([flex, inline(30, 0)], { top: 5 }));
    expect(tb(out)).toEqual([15, 0]);
    const [f, i] = kids(out);
    expect(tb(f!)).toEqual([0, 30]);
    expect(tb(i!)).toEqual([0, 0]);
    expect(tb(kids(f!)[0]!)).toEqual([10, 10]);
  });

  test("row children are left alone, the row itself collapses", () => {
    const r = row(10, 20, inline(40, 40));
    const out = run(stack([image(0, 5), r], { padTop: 1, padBottom: 1 }));
    const [img, rr] = kids(out);
    expect(tb(img!)).toEqual([0, 10]);
    expect(tb(rr!)).toEqual([0, 20]);
    if (rr?.kind !== "row") throw new Error("row expected");
    expect(tb(rr.cols[0]!.child)).toEqual([40, 40]);
  });

  test("a stack inside a row cell collapses on its own", () => {
    const cell = stack([inline(12, 14)]);
    const out = run(row(0, 0, cell));
    if (out.kind !== "row") throw new Error("row expected");
    const c = out.cols[0]!.child;
    expect(tb(c)).toEqual([12, 14]);
    expect(tb(kids(c)[0]!)).toEqual([0, 0]);
  });

  test("raw and conditional nodes block collapsing", () => {
    const raw: Node = { kind: "raw", html: "<hr>" };
    const cond: Node = { kind: "conditional", target: "not-mso", child: inline(9, 9) };
    const out = run(stack([inline(0, 20), raw, inline(30, 0), cond, inline(7, 0)], { padTop: 1, padBottom: 1 }));
    const k = kids(out);
    expect(tb(k[0]!)).toEqual([0, 20]);
    expect(k[1]).toEqual(raw);
    expect(tb(k[2]!)).toEqual([30, 0]);
    expect(tb(k[4]!)).toEqual([7, 0]);
    // conditional contents are still processed, but its own box is opaque
    expect(k[3]!.kind).toBe("conditional");
  });

  test("an Outlook-only block is invisible to the margins around it", () => {
    const cond: Node = { kind: "conditional", target: "mso", child: inline(9, 9) };
    const out = run(stack([inline(0, 20), cond, inline(30, 0)], { padTop: 1, padBottom: 1 }));
    const k = kids(out);
    expect(tb(k[0]!)).toEqual([0, 30]);
    expect(tb(k[2]!)).toEqual([0, 0]);
    expect(k[1]!.kind).toBe("conditional");
  });

  test("opaque first child leaves the parent margin where it is", () => {
    const raw: Node = { kind: "raw", html: "x" };
    const out = run(stack([raw, inline(10, 0)], { top: 3 }));
    expect(tb(out)).toEqual([3, 0]);
    expect(tb(kids(out)[1]!)).toEqual([10, 0]);
  });

  test("inline nodes and images collapse like boxes, horizontal margins untouched", () => {
    const a: Node = { kind: "inline", html: "a", style: {}, margin: { top: 0, right: 4, bottom: 16, left: 8 } };
    const out = run(stack([a, image(24, 0)], { padTop: 1, padBottom: 1 }));
    const [x, y] = kids(out);
    expect((x as Extract<Node, { kind: "inline" }>).margin).toEqual({ top: 0, right: 4, bottom: 24, left: 8 });
    expect(tb(y!)).toEqual([0, 0]);
  });

  test("horizontal margins on a stack survive", () => {
    const s = stack([inline(10, 10)]);
    s.box.margin = m(0, 0, 13);
    const out = run(s) as StackNode;
    expect(out.box.margin).toEqual({ top: 10, right: 13, bottom: 10, left: 13 });
  });

  test("empty stack collapses through between siblings", () => {
    const out = run(stack([inline(0, 10), stack([], { top: 30, bottom: 20 }), inline(15, 0)], { padTop: 1, padBottom: 1 }));
    const [a, e, b] = kids(out);
    expect(tb(a!)).toEqual([0, 30]);
    expect(tb(e!)).toEqual([0, 0]);
    expect(tb(b!)).toEqual([0, 0]);
  });

  test("empty stack with padding is not collapsed through", () => {
    const e = stack([], { top: 5, bottom: 9, padTop: 4 });
    const out = run(stack([inline(0, 10), e, inline(2, 0)], { padTop: 1, padBottom: 1 }));
    const [a, ee, b] = kids(out);
    expect(tb(a!)).toEqual([0, 10]);
    expect(tb(ee!)).toEqual([0, 9]);
    expect(tb(b!)).toEqual([0, 0]);
  });

  test("an empty stack as the only child merges its margins into the parent", () => {
    const out = run(stack([stack([], { top: 8, bottom: 12 })], { top: 2, bottom: 3 }));
    expect(tb(out)).toEqual([12, 0]);
    expect(tb(kids(out)[0]!)).toEqual([0, 0]);
  });

  test("empty stack that comes first keeps its margin for the sibling after it", () => {
    const out = run(stack([stack([], { top: 4, bottom: 4 }), inline(10, 0)], { padTop: 1, padBottom: 1 }));
    const [e, i] = kids(out);
    expect(tb(e!)).toEqual([10, 0]);
    expect(tb(i!)).toEqual([0, 0]);
  });

  test("a lone empty stack as the root merges top and bottom", () => {
    expect(tb(run(stack([], { top: 6, bottom: 9 })))).toEqual([9, 0]);
  });

  test("margins at the root stay on the root", () => {
    const out = run(stack([inline(18, 22)], { top: 0, bottom: 0 }));
    expect(tb(out)).toEqual([18, 22]);
  });

  test("never mutates its input", () => {
    const input = stack([stack([inline(50, 60)], { top: 5, bottom: 6 }), inline(70, 0), stack([])], { top: 1 });
    const snapshot = structuredClone(input);
    const out = run(input);
    expect(input).toEqual(snapshot);
    expect(out).not.toBe(input);
  });

  test("is idempotent", () => {
    const input = stack([stack([inline(50, 60)], { top: 5, bottom: 6 }), inline(70, 0), stack([], { top: 3 })], { top: 1 });
    const once = run(input);
    expect(run(once)).toEqual(once);
  });
});

import { describe, expect, test } from "vitest";
import { emptyBox, mapChildren, sides, type Box, type Node, type StackNode } from "../../../src/ir/index.ts";
import { marginToPadding } from "../../../src/passes/margin-to-padding.ts";
import { testCtx } from "../../helpers/index.ts";

const run = (n: Node) => marginToPadding.run(n, testCtx());
const box = (o: Partial<Box> = {}): Box => ({ ...emptyBox(), ...o });
const stack = (b: Partial<Box>, children: Node[] = [], loc?: StackNode["loc"]): StackNode => ({
  kind: "stack",
  box: box(b),
  children,
  gap: 0,
  collapse: false,
  ...(loc ? { loc } : {}),
});
const img = (b: Partial<Box> = {}): Node => ({ kind: "image", box: box(b), src: "a.png", alt: "" });
const inline = (margin = sides(0)): Node => ({ kind: "inline", html: "<p>x</p>", style: {}, margin });

const zeroMargins = (n: Node): boolean => {
  const own = n.kind === "inline" ? n.margin : n.kind === "raw" || n.kind === "conditional" || n.kind === "template" ? sides(0) : n.box.margin;
  let ok = Object.values(own).every((v) => v === 0);
  mapChildren(n, (c) => {
    ok = ok && zeroMargins(c);
    return c;
  });
  return ok;
};

describe("margin-to-padding", () => {
  test("a painted root (body) folds its margin into padding inside the paint", () => {
    const out = run(stack({ background: "#f4f4f4", margin: sides(21, 0, 0, 0) }, [inline()])) as StackNode;
    expect(out.box.padding.top).toBe(21);
    expect(out.box.background).toBe("#f4f4f4");
    expect(out.box.margin).toEqual(sides(0));
  });

  test("merges into padding on a plain stack", () => {
    const out = run(stack({ padding: sides(1, 2, 3, 4), margin: sides(10, 0, 20, 0) })) as StackNode;
    expect(out.box.padding).toEqual(sides(11, 2, 23, 4));
    expect(out.box.margin).toEqual(sides(0));
  });

  test("merges on a row", () => {
    const out = run({ kind: "row", box: box({ margin: sides(5) }), gap: 0, wrap: false, cols: [] });
    expect(out).toMatchObject({ kind: "row", box: { padding: sides(5), margin: sides(0) } });
  });

  test("zero margins leave the node alone", () => {
    const n = stack({}, [img()]);
    expect(run(n)).toEqual(n);
  });

  test.each([
    ["background", { background: "#fff" }],
    ["border", { border: { top: { width: 1, style: "solid" as const, color: "#000" } } }],
    ["radius", { radius: 4 }],
  ])("%s forces a wrap", (_, extra) => {
    const out = (run(stack({}, [stack({ ...extra, margin: sides(10) }, [], { line: 3, col: 1 })])) as StackNode)
      .children[0] as StackNode;
    expect(out.box.padding).toEqual(sides(10));
    expect(out.box.background).toBeUndefined();
    expect(out.loc).toEqual({ line: 3, col: 1 });
    expect(out.children[0]).toMatchObject({ kind: "stack", box: { margin: sides(0), padding: sides(0), ...extra } });
  });

  test("maxWidth with side margins wraps, without them merges", () => {
    const wrapped = run(stack({ maxWidth: 400, margin: sides(0, 8) })) as StackNode;
    expect(wrapped.children).toHaveLength(1);
    const merged = run(stack({ maxWidth: 400, margin: sides(8, 0) })) as StackNode;
    expect(merged.children).toHaveLength(0);
    expect(merged.box.padding).toEqual(sides(8, 0));
  });

  test("width with side margins wraps", () => {
    const out = run(stack({ width: { pct: 50 }, margin: sides(0, 4) })) as StackNode;
    expect(out.children).toHaveLength(1);
  });

  test("wrapper has no align, inner keeps it", () => {
    const out = run(img({ margin: sides(6), align: "center" })) as StackNode;
    expect(out.box.align).toBeUndefined();
    expect(out.children[0]).toMatchObject({ kind: "image", box: { align: "center", margin: sides(0) } });
  });

  test("image is always wrapped", () => {
    const out = run(img({ margin: sides(2, 4) })) as StackNode;
    expect(out).toMatchObject({ kind: "stack", gap: 0, collapse: false, box: { padding: sides(2, 4) } });
    expect(out.children[0]?.kind).toBe("image");
  });

  test("inline is wrapped and its margin zeroed", () => {
    const out = run(inline(sides(16, 0, 8, 0))) as StackNode;
    expect(out.box.padding).toEqual(sides(16, 0, 8, 0));
    expect(out.children[0]).toMatchObject({ kind: "inline", margin: sides(0) });
  });

  test("column child is wrapped, column width untouched", () => {
    const row: Node = {
      kind: "row",
      box: box(),
      gap: 0,
      wrap: false,
      cols: [{ width: { px: 200 }, valign: "top", child: img({ margin: sides(5) }) }],
    };
    const out = run(row);
    if (out.kind !== "row") throw new Error("row expected");
    expect(out.cols[0]?.width).toEqual({ px: 200 });
    expect(out.cols[0]?.child).toMatchObject({ kind: "stack", box: { padding: sides(5) } });
  });

  test("raw is untouched, conditional recurses", () => {
    const raw: Node = { kind: "raw", html: "<b>" };
    expect(run(raw)).toBe(raw);
    const out = run({ kind: "conditional", target: "mso", child: img({ margin: sides(3) }) });
    expect(out).toMatchObject({ kind: "conditional", child: { kind: "stack", box: { padding: sides(3) } } });
  });

  test("nested margins all end up zero", () => {
    const tree = stack({ margin: sides(4) }, [
      stack({ background: "red", margin: sides(2) }, [inline(sides(1)), img({ margin: sides(3) })]),
      { kind: "conditional", target: "not-mso", child: stack({ margin: sides(9) }) },
    ]);
    expect(zeroMargins(run(tree))).toBe(true);
  });

  test("post-condition holds over a big tree", () => {
    const build = (depth: number, i: number): Node => {
      const m = sides(i % 3, i % 2, (i + 1) % 4, (i + 2) % 3);
      if (depth === 0) return i % 2 ? img({ margin: m }) : inline(m);
      const extra: Partial<Box> = i % 4 === 0 ? { background: "#eee" } : i % 5 === 0 ? { maxWidth: 300 } : {};
      const kids = [0, 1, 2].map((k) => build(depth - 1, i * 3 + k));
      if (i % 3 === 0) {
        return {
          kind: "row",
          box: box({ margin: m, ...extra }),
          gap: 0,
          wrap: false,
          cols: kids.map((child) => ({ width: { auto: true as const }, valign: "top" as const, child })),
        };
      }
      return stack({ margin: m, ...extra }, kids);
    };
    expect(zeroMargins(run(build(5, 1)))).toBe(true);
  });

  test("does not mutate the input and is deterministic", () => {
    const tree = stack({ margin: sides(4), background: "#fff" }, [img({ margin: sides(2) }), inline(sides(1))]);
    const snapshot = structuredClone(tree);
    const a = run(tree);
    expect(tree).toEqual(snapshot);
    expect(run(tree)).toEqual(a);
  });
});

import { describe, expect, test } from "vitest";
import type { StyledNode } from "../../src/style/types.ts";
import { floatOf, floatSpacing, warnFloatWrapStops, warnUnevenFloatMargin } from "../../src/analyze/float.ts";
import { codesOf, el, testCtx, text } from "../helpers/index.ts";

const img = (style: Record<string, string>, parentStyle?: Record<string, string>) => ({
  ...el("img", style),
  ...(parentStyle ? { parentStyle } : {}),
});

describe("floatSpacing", () => {
  test("equal px margins become hspace/vspace", () => {
    const r = floatSpacing(img({ float: "left", "margin-top": "8px", "margin-bottom": "8px", "margin-left": "16px", "margin-right": "16px" }));
    expect(r).toEqual({ attrs: [["hspace", "16"], ["vspace", "8"]], uneven: false });
  });

  test("a percentage margin is unmappable: no attribute, and it counts as lost", () => {
    const m = { "margin-top": "5%", "margin-right": "5%", "margin-bottom": "5%", "margin-left": "5%" };
    expect(floatSpacing(img({ float: "left", ...m }))).toEqual({ attrs: [], uneven: true });
    const ctx = testCtx();
    warnUnevenFloatMargin(img({ float: "left", ...m }), ctx);
    expect(codesOf(ctx)).toEqual(["W005"]);
  });

  test("em margins are unmappable too, zero is fine in any unit", () => {
    expect(floatSpacing(img({ "margin-left": "1em", "margin-right": "1em" }))).toEqual({ attrs: [], uneven: true });
    expect(floatSpacing(img({ "margin-left": "0", "margin-right": "0" }))).toEqual({ attrs: [], uneven: false });
  });
});

describe("floatOf", () => {
  test("a flex or grid item ignores float", () => {
    expect(floatOf(img({ float: "left" }, { display: "flex" }))).toBeUndefined();
    expect(floatOf(img({ float: "left" }, { display: "grid" }))).toBeUndefined();
    expect(floatOf(img({ float: "left" }, { display: "block" }))).toBe("left");
  });
});

describe("warnFloatWrapStops", () => {
  const p = (...kids: StyledNode[]) => el("p", { display: "block" }, [...kids, text("Short.")]);
  const run = (kids: Parameters<typeof el>[2]) => {
    const ctx = testCtx();
    warnFloatWrapStops(el("div", { display: "block" }, kids), ctx);
    return codesOf(ctx);
  };

  test("warns when a block with a floated image has block siblings after it", () => {
    expect(run([p(img({ float: "left" })), el("p", { display: "block" }, [text("Next")])])).toEqual(["W001"]);
  });

  test("silent for the last block, and for flex rows", () => {
    expect(run([el("p", { display: "block" }, [text("Before")]), p(img({ float: "left" }))])).toEqual([]);
    const ctx = testCtx();
    warnFloatWrapStops(el("div", { display: "flex" }, [p(img({ float: "left" })), el("p", { display: "block" }, [text("Next")])]), ctx);
    expect(codesOf(ctx)).toEqual([]);
  });

  const blk = (...kids: StyledNode[]) => el("div", { display: "block" }, kids);
  const para = (...kids: StyledNode[]) => el("p", { display: "block" }, kids);
  const link = (...kids: StyledNode[]) => el("a", { display: "inline" }, kids);
  // every container is analyzed once, like analyzeChildren does
  const all = (root: ReturnType<typeof el>): string[] => {
    const ctx = testCtx();
    const walk = (e: ReturnType<typeof el>): void => {
      warnFloatWrapStops(e, ctx);
      for (const k of e.children) if (k.type === "element") walk(k);
    };
    walk(root);
    return codesOf(ctx);
  };

  test("nested containers report one W001 in total", () => {
    const first = blk(blk(p(img({ float: "left" })), para(text("x"))), para(text("y")));
    expect(all(first)).toEqual(["W001"]);
    const lastChain = blk(blk(para(text("a")), p(img({ float: "left" }))), para(text("y")));
    expect(all(lastChain)).toEqual(["W001"]);
  });

  test("a lone image in a container is left to the image rule", () => {
    expect(all(blk(blk(img({ float: "left" })), para(text("x"))))).toEqual([]);
    expect(all(blk(blk(link(img({ float: "left" }))), para(text("x"))))).toEqual([]);
  });

  test("a linked image in text, or alone in a paragraph, still warns", () => {
    expect(run([p(link(img({ float: "left" }))), para(text("x"))])).toEqual(["W001"]);
    expect(run([para(text("Before "), link(img({ float: "left" })), text(" Short.")), para(text("x"))])).toEqual(["W001"]);
    expect(run([para(el("span", { display: "inline" }, [img({ float: "left" })]), text("Short.")), para(text("x"))])).toEqual(["W001"]);
    expect(run([para(img({ float: "left" })), para(text("x"))])).toEqual(["W001"]);
  });

  test("a float inside an inline-block stays inside that box and cannot wrap into the next block", () => {
    const box = el("span", { display: "inline-block" }, [img({ float: "left" }), text("x")]);
    expect(run([para(box, text(" Short")), para(text("n"))])).toEqual([]);
  });

  test("an image in an anonymous run before a block warns", () => {
    expect(run([img({ float: "left" }), text("Short text"), para(text("next"))])).toEqual(["W001"]);
    expect(run([link(img({ float: "left" })), text("Short text"), para(text("next"))])).toEqual(["W001"]);
    expect(run([img({ float: "left" }), para(text("next"))])).toEqual([]);
  });
});

import { describe, expect, test } from "vitest";
import { buttonRule } from "../../../src/analyze/rules/button.ts";
import type { ButtonNode } from "../../../src/ir/index.ts";
import type { StyledElement } from "../../../src/style/types.ts";
import { codesOf, el, testCtx, text } from "../../helpers/index.ts";

const BTN = {
  display: "inline-block",
  "padding-left": "24px",
  "padding-right": "24px",
  "padding-top": "12px",
  "padding-bottom": "12px",
  "background-color": "#1d4ed8",
  color: "#ffffff",
  "font-size": "16px",
};
const link = (style: Record<string, string> = {}, attrs: Record<string, string> = { href: "https://x.test/" }): StyledElement =>
  el("a", { ...BTN, ...style }, [text("Go")], { attrs });
const run = (e: StyledElement) => {
  const ctx = testCtx();
  const node = buttonRule.analyze(e, ctx, () => {
    throw new Error("no recursion");
  }) as ButtonNode;
  return { node, codes: codesOf(ctx), msgs: ctx.diagnostics.list().map((d) => d.message) };
};
const R6 = { "border-top-left-radius": "6px", "border-top-right-radius": "6px", "border-bottom-right-radius": "6px", "border-bottom-left-radius": "6px" };
const GRADIENT = "linear-gradient(90deg, #f97316, #db2777)";
const BORDER = { "border-top-style": "solid", "border-top-width": "1px" };

describe("buttonRule.matches", () => {
  const ctx = testCtx();
  test("inline-block link with background and horizontal padding", () => {
    expect(buttonRule.matches(link(), ctx)).toBe(true);
  });
  test("block link, and a border instead of a background", () => {
    expect(buttonRule.matches(link({ display: "block" }), ctx)).toBe(true);
    expect(buttonRule.matches(link({ "background-color": "transparent", "border-top-style": "solid", "border-top-width": "2px" }), ctx)).toBe(true);
  });
  test("data-email=button forces it", () => {
    expect(buttonRule.matches(el("a", { display: "inline" }, [], { attrs: { href: "#", "data-email": "button" } }), ctx)).toBe(true);
  });
  test("plain links, no horizontal padding, no paint, no href, other tags do not match", () => {
    expect(buttonRule.matches(el("a", { display: "inline" }, [text("x")], { attrs: { href: "#" } }), ctx)).toBe(false);
    expect(buttonRule.matches(link({ "padding-left": "0", "padding-right": "0" }), ctx)).toBe(false);
    expect(buttonRule.matches(link({ "background-color": "transparent" }), ctx)).toBe(false);
    expect(buttonRule.matches(link({}, {}), ctx)).toBe(false);
    expect(buttonRule.matches(el("div", BTN, [], { attrs: { href: "#" } }), ctx)).toBe(false);
  });
});

describe("buttonRule.analyze", () => {
  test("builds the node", () => {
    const { node, codes } = run(link({ ...R6, "text-decoration": "none" }));
    expect(node).toMatchObject({ kind: "button", href: "https://x.test/", content: "Go" });
    expect(node.box).toMatchObject({ padding: { top: 12, right: 24, bottom: 12, left: 24 }, background: "#1d4ed8", radius: 6 });
    expect(node.style).toMatchObject({ color: "#ffffff", "font-size": "16px", "text-decoration": "none" });
    expect(codes).toEqual(["W003"]);
  });

  test("a set width needs no W003", () => {
    const { node, codes, msgs } = run(link({ ...R6, width: "200px", "box-sizing": "border-box" }));
    expect(node.box.width).toEqual({ px: 200 });
    expect(codes, JSON.stringify(msgs)).toEqual([]);
  });

  test("no radius means no W003", () => {
    expect(run(link()).codes).toEqual([]);
  });

  test("auto margins and an inherited text-align both align it", () => {
    expect(run(link({ "margin-left": "auto", "margin-right": "auto" })).node.box.align).toBe("center");
    const inherited = el("a", { ...BTN, "text-align": "right" }, [text("Go")], { attrs: { href: "#" }, declared: BTN });
    expect(run(inherited).node.box.align).toBe("right");
    // its own text-align only moves the label
    expect(run(link({ "text-align": "right" })).node.box.align).toBeUndefined();
  });

  test("a block link fills its container and does not align", () => {
    const { node } = run(link({ display: "block", "margin-left": "auto", "margin-right": "auto" }));
    expect(node.box.width).toEqual({ pct: 100 });
    expect(node.box.align).toBeUndefined();
  });

  test("a gradient is reported and the background-color is used", () => {
    const { node, codes } = run(link({ "background-image": GRADIENT }));
    expect(node.box.background).toBe("#1d4ed8");
    expect(codes).toEqual(["W001"]);
  });

  test("a gradient without a background-color falls back to its first stop, else nothing", () => {
    const a = run(link({ "background-color": "transparent", "background-image": GRADIENT, ...BORDER }));
    expect(a.node.box.background).toBe("#f97316");
    expect(a.codes).toEqual(["W001"]);
    const b = run(link({ "background-color": "transparent", "background-image": "linear-gradient(var(--a), var(--b))", ...BORDER }));
    expect(b.node.box.background).toBeUndefined();
  });

  test("unsupported markup inside is linted", () => {
    const e = el("a", BTN, [el("span", { position: "absolute" }, [text("x")])], { attrs: { href: "#" } });
    expect(run(e).codes).toContain("E002");
  });

  test("a block link with only vertical padding and a width is a button", () => {
    const e = link({ display: "block", "padding-left": "0", "padding-right": "0", width: "100%" });
    expect(buttonRule.matches(e, testCtx())).toBe(true);
    expect(buttonRule.matches(link({ "padding-left": "0", "padding-right": "0" }), testCtx())).toBe(false);
  });

  test("max-width on a block link stays a fluid cap and keeps the centering", () => {
    const { node, codes } = run(link({ ...R6, display: "block", "max-width": "200px", "margin-left": "auto", "margin-right": "auto" }));
    expect(node.box.width).toEqual({ pct: 100 });
    expect(node.box.maxWidth).toBe(248); // 200 content + 2 * 24 padding
    expect(node.box.align).toBe("center");
    expect(codes).toEqual([]);
  });

  test("a px width under the cap wins", () => {
    const { node } = run(link({ display: "block", width: "100px", "max-width": "200px" }));
    expect(node.box.width).toEqual({ px: 148 });
    expect(node.box.maxWidth).toBeUndefined();
  });

  test("parent text-align centers it even when the link sets its own", () => {
    const e = { ...link({ "text-align": "center" }), parentStyle: { "text-align": "center" } };
    expect(run(e).node.box.align).toBe("center");
  });

  test("an own text-align doesn't move it inside a centered parent", () => {
    const e = { ...link({ "text-align": "left" }), parentStyle: { "text-align": "center" } };
    expect(run(e).node.box.align).toBe("center");
    expect(run(e).codes).toEqual([]);
  });

  test("link attributes are carried on the node, href/class/style/data-email are not", () => {
    const e = el("a", BTN, [text("Go")], { attrs: { href: "#", class: "x", "aria-label": "Go now", target: "_blank" } });
    const r = run(e);
    expect(r.codes).toEqual([]);
    expect(r.node.attrs).toEqual({ "aria-label": "Go now", target: "_blank" });
  });

  test("a background url() image is not called a gradient", () => {
    const r = run(link({ "background-image": "url(x.png)" }));
    expect(r.msgs[0]).toContain("background image dropped");
  });

  test("max-width on an inline button is reported and dropped", () => {
    const r = run(link({ "max-width": "300px" }));
    expect(r.node.box.maxWidth).toBeUndefined();
    expect(r.codes).toEqual(["W001"]);
    expect(r.msgs[0]).toContain("max-width on an inline button");
  });

  test("a percentage-width rounded button says Outlook shows square corners, an unsized one says estimated", () => {
    const pct = run(link({ ...R6, display: "block", width: "50%", "box-sizing": "border-box" }));
    expect(pct.msgs).toEqual(["Outlook shows square corners; give the button a px width"]);
    expect(run(link(R6)).msgs).toEqual(["Outlook button size is estimated; give the button a px width"]);
  });

  test("a link that is only block because a flex parent blockified it gets no invented width", () => {
    const e = el("a", { ...BTN, display: "block" }, [text("Go")], { attrs: { href: "#" }, declared: { ...BTN, display: "inline-block" } });
    const declaredInline = { ...e, declared: Object.fromEntries(Object.entries(e.declared).filter(([k]) => k !== "display")) };
    expect(run(declaredInline).node.box.width).toBeUndefined();
    expect(run(link({ display: "block" })).node.box.width).toEqual({ pct: 100 });
  });

  test("id is carried so in-page anchors survive", () => {
    const e = el("a", BTN, [text("Go")], { attrs: { href: "#", id: "cta" } });
    expect(run(e).node.attrs).toEqual({ id: "cta" });
  });

  test("margins land in box.margin for the slot padding", () => {
    expect(run(link({ "margin-top": "20px", "margin-bottom": "12px" })).node.box.margin).toMatchObject({ top: 20, bottom: 12 });
  });
});

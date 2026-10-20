import { describe, expect, test } from "vitest";
import { analyze } from "../../../src/analyze/analyze.ts";
import { buildBox, reportDropped } from "../../../src/analyze/box.ts";
import { firstStop, isGradientText } from "../../../src/analyze/box-paint.ts";
import { isLinkBox, isPassThrough, looksLikeButton } from "../../../src/analyze/classify.ts";
import { blockRule } from "../../../src/analyze/rules/block.ts";
import { buttonRule } from "../../../src/analyze/rules/button.ts";
import { flexRule } from "../../../src/analyze/rules/flex.ts";
import { imageRule } from "../../../src/analyze/rules/image.ts";
import { inlineRule } from "../../../src/analyze/rules/inline.ts";
import { unsupportedRule } from "../../../src/analyze/rules/unsupported.ts";
import type { StackNode } from "../../../src/ir/index.ts";
import { codesOf, el, testCtx, text } from "../../helpers/index.ts";

const rules = [unsupportedRule, blockRule, inlineRule];

const run = (style: Record<string, string>, opts: { tag?: string; declared?: Record<string, string>; kids?: Parameters<typeof el>[2] } = {}) => {
  const ctx = testCtx();
  const node = analyze(
    el(opts.tag ?? "div", { display: "block", ...style }, opts.kids ?? [], { declared: opts.declared ?? {} }),
    ctx,
    rules,
  ) as StackNode;
  return { node, box: node.box, ctx };
};

describe("link boxes", () => {
  const link = { color: "#1f2937", "text-decoration": "none" };
  const card = el("div", { display: "block", "background-color": "#0b1350", "padding-top": "8px", color: "#ffffff" }, [text("x")]);
  const attrs = { href: "https://x.test/a", target: "_blank", class: "tile", style: "color:#1f2937" };
  const a = (color: string, inner: string, extra = "") => `<a href="https://x.test/a" target="_blank" class="tile" style="color:${color};text-decoration:none${extra}">${inner}</a>`;

  test("a link around a layout container is lowered like a div; its text runs each get the link", () => {
    const box = el("a", { display: "block", "background-color": "#ffffff", "padding-top": "20px", ...link }, [card, text("Download")], { attrs });
    expect(isLinkBox(box)).toBe(true);
    expect(looksLikeButton(box)).toBe(false);
    expect(isPassThrough(box)).toBe(false);
    const ctx = testCtx();
    const node = analyze(box, ctx, [buttonRule, imageRule, ...rules]) as StackNode;
    expect(node.box.background).toBe("#ffffff");
    const [inner, label] = node.children;
    expect(inner?.kind === "stack" && inner.children[0]?.kind === "inline" && inner.children[0].html).toBe(a("#ffffff", "x")); // a lone element goes through the inline rule
    expect(label?.kind === "inline" && label.html).toBe(a("#1f2937", "Download"));
    expect(codesOf(ctx)).toEqual(["I004"]);
  });

  test("flex items keep their element and get the link inside; images get it on their node", () => {
    const icon = el("img", { display: "block", width: "24px", height: "24px" }, [], { attrs: { src: "i.png", alt: "" } });
    const row = el("div", { display: "flex", color: "#111111" }, [icon, el("span", { color: "#111111" }, [text("Go")])]);
    const node = analyze(el("a", { display: "block", ...link }, [row], { attrs }), testCtx(), [imageRule, flexRule, ...rules]) as StackNode;
    const flex = node.children[0];
    expect(flex?.kind).toBe("row");
    if (flex?.kind !== "row") return;
    expect(flex.cols[0]?.child).toMatchObject({ kind: "image", href: "https://x.test/a" });
    expect(flex.cols[1]?.child.kind === "inline" && flex.cols[1].child.html).toContain(a("#111111", "Go"));
  });

  test("a button whose label sits in a plain <div> stays a button", () => {
    const btn = { display: "inline-block", "background-color": "#ff0000", "padding-left": "20px", "padding-right": "20px" };
    const label = el("div", { display: "block" }, [text("Buy now")]);
    expect(isLinkBox(el("a", btn, [label], { attrs }))).toBe(false);
    expect(looksLikeButton(el("a", btn, [label], { attrs }))).toBe(true);
    expect(isLinkBox(el("a", { ...btn, display: "block" }, [label], { attrs }))).toBe(false);
  });

  test("an inline-block link or an explicit button is never a link box", () => {
    const padded = el("div", { display: "block", "padding-top": "10px", "background-color": "#eeeeee" }, [text("A")]);
    expect(isLinkBox(el("a", { display: "inline-block" }, [padded], { attrs }))).toBe(false);
    expect(isLinkBox(el("a", { display: "block" }, [padded], { attrs: { ...attrs, "data-email": "button" } }))).toBe(false);
    expect(isLinkBox(el("a", { display: "block" }, [padded], { attrs }))).toBe(true);
  });

  test("images inside text blocks and inline elements get their own copy of the link", () => {
    const pic = el("img", { display: "inline" }, [], { attrs: { src: "i.png", alt: "", width: "50" } });
    const body = el("div", { display: "block", "padding-top": "10px", color: "#111111" }, [el("p", { display: "block", color: "#111111" }, [pic]), el("span", { color: "#111111" }, [pic])]);
    const ctx = testCtx();
    const node = analyze(el("a", { display: "block", ...link }, [body], { attrs }), ctx, [imageRule, ...rules]) as StackNode;
    const htmls = JSON.stringify(node);
    expect(htmls.match(/<a href=\\"https:\/\/x.test\/a\\"[^>]*><img/g)).toHaveLength(2);
    expect(ctx.diagnostics.list().find((d) => d.code === "I004")?.message).toContain("2 text runs or images");
  });

  test("a link box with nothing to carry the link reports it dropped", () => {
    const empty = el("div", { display: "block", "padding-top": "20px", "background-color": "#eeeeee" }, []);
    const ctx = testCtx();
    analyze(el("a", { display: "block", ...link }, [empty], { attrs }), ctx, rules);
    expect(codesOf(ctx)).toEqual(["W001"]);
  });

  test("copies drop the link's id", () => {
    const two = el("div", { display: "block", "padding-top": "4px", color: "#111111" }, [el("p", { display: "block", color: "#111111" }, [text("a")]), el("p", { display: "block", color: "#111111" }, [text("b")])]);
    const node = analyze(el("a", { display: "block", ...link }, [two], { attrs: { ...attrs, id: "cta" } }), testCtx(), [imageRule, ...rules]);
    expect(JSON.stringify(node)).not.toContain("cta");
  });

  test("links around text, inline elements or an image stay text", () => {
    expect(isLinkBox(el("a", { display: "block" }, [text("x"), el("span", {}, [text("y")])], { attrs }))).toBe(false);
    expect(isLinkBox(el("a", { display: "block" }, [el("img", { display: "block" })], { attrs }))).toBe(false);
    expect(isLinkBox(el("a", { display: "block" }, [el("p", { display: "block" }, [text("x")])], { attrs }))).toBe(false);
    expect(isLinkBox(el("a", { display: "block" }, [card]))).toBe(false); // no href
  });
});

describe("blockRule", () => {
  test("matches containers only", () => {
    const ctx = testCtx();
    expect(blockRule.matches(el("div", { display: "block" }), ctx)).toBe(true);
    expect(blockRule.matches(el("section", { display: "block" }), ctx)).toBe(true);
    expect(blockRule.matches(el("p", { display: "block" }), ctx)).toBe(false);
    expect(blockRule.matches(el("div", { display: "flex" }), ctx)).toBe(false);
  });

  test("builds a collapsing stack with analyzed children", () => {
    const { node } = run({}, { kids: [el("p", { display: "block" }, [text("a")]), el("div", { display: "block" })] });
    expect(node).toMatchObject({ kind: "stack", gap: 0, collapse: true, loc: { line: 1 } });
    expect(node.children.map((c) => c.kind)).toEqual(["inline", "stack"]);
  });

  test("padding in px, % is E006", () => {
    const a = run({ "padding-top": "10px", "padding-left": "24px" });
    expect(a.box.padding).toEqual({ top: 10, right: 0, bottom: 0, left: 24 });
    const b = run({ "padding-left": "4%" });
    expect(b.box.padding.left).toBe(0);
    expect(codesOf(b.ctx)).toEqual(["E006"]);
  });

  describe("margins", () => {
    test("px ones are kept and silent", () => {
      const { box, ctx } = run({ "margin-top": "20px", "margin-bottom": "8px" });
      expect(box.margin).toEqual({ top: 20, right: 0, bottom: 8, left: 0 });
      expect(codesOf(ctx)).toEqual([]);
    });
    test("mixed auto and px", () => {
      const { box } = run({ "margin-left": "auto", "margin-top": "12px" });
      expect(box.align).toBe("right");
      expect(box.margin.top).toBe(12);
    });
    test("negative is E005, % is E006", () => {
      expect(codesOf(run({ "margin-top": "-8px" }).ctx)).toEqual(["E005"]);
      expect(codesOf(run({ "margin-left": "10%" }).ctx)).toEqual(["E006"]);
    });
    test("auto turns into align", () => {
      expect(run({ "margin-left": "auto", "margin-right": "auto" }).box.align).toBe("center");
      expect(run({ "margin-left": "auto" }).box.align).toBe("right");
      expect(run({ "margin-right": "auto" }).box.align).toBe("left");
      expect(run({ "margin-top": "auto" }).box.align).toBeUndefined();
    });
    test("body margins are ignored without a word", () => {
      const { box, ctx } = run({ "margin-top": "8px", "margin-left": "-3px" }, { tag: "body" });
      expect(box.margin).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
      expect(codesOf(ctx)).toEqual([]);
    });
  });

  describe("border", () => {
    test("per side, none/hidden/zero width are skipped", () => {
      const { box } = run({
        "border-top-width": "2px", "border-top-style": "dashed", "border-top-color": "#ff0000",
        "border-left-width": "1px", "border-left-style": "none",
        "border-right-width": "0px", "border-right-style": "solid",
        "border-bottom-width": "1px", "border-bottom-style": "hidden",
      });
      expect(box.border).toEqual({ top: { width: 2, style: "dashed", color: "#ff0000" } });
    });
    test("no borders means no border key", () => {
      expect(run({}).box.border).toBeUndefined();
    });
    test("double is solid plus W001", () => {
      const { box, ctx } = run({ "border-top-width": "3px", "border-top-style": "double", "border-top-color": "#000000" });
      expect(box.border?.top?.style).toBe("solid");
      expect(codesOf(ctx)).toEqual(["W001"]);
    });
  });

  test("background colour, not transparent ones", () => {
    expect(run({ "background-color": "#eeeeee" }).box.background).toBe("#eeeeee");
    expect(run({ "background-color": "transparent" }).box.background).toBeUndefined();
    expect(run({ "background-color": "rgba(0, 0, 0, 0)" }).box.background).toBeUndefined();
    expect(run({ "background-color": "rgba(0, 0, 0, 0.5)" }).box.background).toBe("rgba(0, 0, 0, 0.5)");
  });

  describe("radius", () => {
    const corners = (a: string, b: string, c: string, d: string) => ({
      "border-top-left-radius": a, "border-top-right-radius": b, "border-bottom-right-radius": c, "border-bottom-left-radius": d,
    });
    test("equal corners", () => {
      const { box, ctx } = run(corners("8px", "8px", "8px", "8px"));
      expect(box.radius).toBe(8);
      expect(codesOf(ctx)).toEqual([]);
    });
    test("percentage radius is reported, not silently dropped", () => {
      const { box, ctx } = run(corners("50%", "50%", "50%", "50%"));
      expect(box.radius).toBeUndefined();
      expect(codesOf(ctx)).toContain("W001");
    });
    test("different corners are kept per corner", () => {
      const { box, ctx } = run(corners("0px", "0px", "12px", "12px"));
      expect(box.radius).toBe(12);
      expect(box.radii).toEqual([0, 0, 12, 12]);
      expect(codesOf(ctx)).toEqual([]);
    });

    test("equal corners stay a single radius", () => {
      expect(run(corners("6px", "6px", "6px", "6px")).box.radii).toBeUndefined();
    });
  });

  describe("sizes", () => {
    test("max-width adds padding and border unless border-box", () => {
      const pad = { "padding-left": "20px", "padding-right": "20px", "max-width": "600px" };
      expect(run(pad).box.maxWidth).toBe(640);
      expect(run({ ...pad, "box-sizing": "border-box" }).box.maxWidth).toBe(600);
      expect(run({ "max-width": "none" }).box.maxWidth).toBeUndefined();
      expect(codesOf(run({ "max-width": "80%" }).ctx)).toEqual(["E006"]);
    });
    test("width px is border-box", () => {
      expect(run({ width: "300px", "padding-left": "10px", "border-left-width": "2px", "border-left-style": "solid", "border-left-color": "#000000" }).box.width).toEqual({ px: 312 });
      expect(run({ width: "300px", "box-sizing": "border-box", "padding-left": "10px" }).box.width).toEqual({ px: 300 });
    });
    test("width auto is absent, % passes through", () => {
      expect(run({ width: "auto" }).box.width).toBeUndefined();
      const { box, ctx } = run({ width: "50%" });
      expect(box.width).toEqual({ pct: 50 });
      expect(codesOf(ctx)).toEqual([]);
    });
    test("% width with content-box padding is E006", () => {
      expect(codesOf(run({ width: "50%", "padding-left": "8px" }).ctx)).toEqual(["E006"]);
      expect(codesOf(run({ width: "50%", "padding-left": "8px", "box-sizing": "border-box" }).ctx)).toEqual([]);
    });
  });

  describe("dropped properties", () => {
    test("unconsumed non-inherited ones get W001 naming them", () => {
      const { ctx } = run({ height: "100%", opacity: "0.5" }, { declared: { height: "100%", opacity: "0.5" } });
      const msgs = ctx.diagnostics.list().map((d) => [d.code, d.message]);
      expect(msgs).toEqual([
        ["W001", "height: 100% is dropped"],
        ["W001", "opacity: 0.5 is dropped"],
      ]);
    });
    test("a px height is a min-height unless the box clips", () => {
      const fixed = run({ height: "100px", "padding-top": "10px" }, { declared: { height: "100px" } });
      expect(fixed.box.minHeight).toBe(110);
      expect(codesOf(fixed.ctx)).toEqual([]);
      expect(run({ height: "100px", "min-height": "150px" }, { declared: { height: "100px", "min-height": "150px" } }).box.minHeight).toBe(150);
      const clipped = run({ height: "100px", overflow: "hidden" }, { declared: { height: "100px", overflow: "hidden" } });
      expect(clipped.box.minHeight).toBeUndefined();
      expect(clipped.ctx.diagnostics.list().map((d) => d.message)).toContain("height: 100px is dropped");
    });
    test("an hr keeps its height although the UA sheet clips it", () => {
      const hr = run({ height: "4px", overflow: "hidden" }, { declared: { height: "4px" }, tag: "hr" });
      expect(hr.box.minHeight).toBe(4);
    });
    test("inherited and consumed ones are fine", () => {
      const declared = { color: "#111111", "font-size": "14px", "padding-top": "4px", display: "block", "background-color": "#fff" };
      expect(codesOf(run({}, { declared }).ctx)).toEqual([]);
    });
    test("body keeps W001 for height but margins stay silent", () => {
      const { ctx } = run({ height: "100%", "margin-top": "8px" }, { tag: "body", declared: { height: "100%", "margin-top": "8px" } });
      expect(ctx.diagnostics.list().map((d) => d.message)).toEqual(["height: 100% is dropped"]);
    });
    test("shorthand reset longhands are not a loss", () => {
      const declared = { "background-color": "#fff", "background-image": "none", "background-repeat": "repeat", "background-position": "0% 0%" };
      expect(codesOf(run({}, { declared }).ctx)).toEqual([]);
    });
    test("only authored properties count", () => {
      expect(codesOf(run({ height: "20px" }).ctx)).toEqual([]);
    });
  });
});

test("width px with max-width 100% becomes a capped fluid box", () => {
  const ctx = testCtx();
  const box = buildBox(el("div", { display: "block", width: "360px", "max-width": "100%" }), ctx);
  expect(box.maxWidth).toBe(360);
  expect(box.width).toBeUndefined();
  expect(codesOf(ctx)).toEqual([]);
});

describe("background images", () => {
  const box = (style: Record<string, string>) => {
    const ctx = testCtx();
    return { box: buildBox(el("div", { display: "block", ...style }), ctx), ctx };
  };
  const PHOTO = "url(https://x.test/600x560.png)";

  test("a url photo keeps its css, size, position and repeat, and quotes the url", () => {
    const { box: b, ctx } = box({
      "background-color": "#d873b0", "background-image": PHOTO, "background-size": "cover",
      "background-position": "center top", "background-repeat": "no-repeat",
    });
    expect(b.backgroundImage).toEqual({
      css: "url('https://x.test/600x560.png')", url: "https://x.test/600x560.png",
      size: "cover", position: "center top", repeat: "no-repeat",
    });
    expect(b.background).toBe("#d873b0");
    expect(codesOf(ctx)).toEqual([]);
  });

  test("shorthand resets are not carried", () => {
    const { box: b } = box({ "background-color": "#fff", "background-image": PHOTO, "background-position": "0% 0%", "background-repeat": "repeat", "background-size": "auto" });
    expect(b.backgroundImage).toEqual({ css: "url('https://x.test/600x560.png')", url: "https://x.test/600x560.png" });
  });

  test("a photo without a colour is reported", () => {
    const { box: b, ctx } = box({ "background-image": PHOTO });
    expect(b.background).toBeUndefined();
    expect(codesOf(ctx)).toEqual(["W001"]);
  });

  test("a gradient without a colour falls back to its first stop and says so", () => {
    const { box: b, ctx } = box({ "background-image": "linear-gradient(160deg, #6b5e4c 0%, #2d3a40 100%)" });
    expect(b.background).toBe("#6b5e4c");
    expect(b.backgroundImage).toEqual({ css: "linear-gradient(160deg, #6b5e4c 0%, #2d3a40 100%)" });
    expect(ctx.diagnostics.list().map((d) => d.message)).toEqual(["Outlook shows the gradient's first colour, #6b5e4c"]);
  });

  test("a gradient over a colour keeps the colour, no W001", () => {
    const { box: b, ctx } = box({ "background-color": "#0b0b3d", "background-image": "linear-gradient(#0b0b3d, #4a63e8)" });
    expect(b.background).toBe("#0b0b3d");
    expect(codesOf(ctx)).toEqual([]);
  });

  test("stacked layers stay CSS; a translucent first stop is no fallback", () => {
    const grid = "linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px),\n  linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px)";
    const { box: b, ctx } = box({ "background-image": grid, "background-size": "24px 24px" });
    expect(b.background).toBeUndefined();
    expect(b.backgroundImage?.css).toBe("linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px)");
    expect(b.backgroundImage?.size).toBe("24px 24px");
    expect(codesOf(ctx)).toEqual(["W001"]);
  });

  test("an <img> can't carry an image, so it stays dropped", () => {
    const ctx = testCtx();
    const declared = { "background-image": PHOTO, "min-height": "40px" };
    const e = el("img", { display: "block", ...declared }, [], { declared });
    expect(buildBox(e, ctx).backgroundImage).toBeUndefined();
    reportDropped(e, ctx);
    expect(ctx.diagnostics.list().map((d) => d.message)).toEqual([`background-image: ${PHOTO} is dropped`, "min-height: 40px is dropped"]);
  });

  test("background-size: 100% is carried (it is not the shorthand reset)", () => {
    const { box: b, ctx } = box({ "background-color": "#123456", "background-image": PHOTO, "background-size": "100%" });
    expect(b.backgroundImage?.size).toBe("100%");
    expect(codesOf(ctx)).toEqual([]);
  });

  test("a background-image that is neither a url nor a gradient is reported", () => {
    expect(codesOf(box({ "background-image": "element(#x)" }).ctx)).toEqual(["W001"]);
    const set = box({ "background-image": "image-set(url(a.png) 1x)" });
    expect(set.box.backgroundImage).toBeUndefined();
    expect(codesOf(set.ctx)).toEqual(["W001"]);
  });

  test("min-height in px; content-box adds padding and border", () => {
    expect(box({ "min-height": "560px", "box-sizing": "border-box", "padding-top": "24px" }).box.minHeight).toBe(560);
    expect(box({ "min-height": "300px", "padding-top": "40px", "padding-bottom": "40px" }).box.minHeight).toBe(380);
    expect(box({}).box.minHeight).toBeUndefined();
    expect(codesOf(box({ "min-height": "50vh" }).ctx)).toEqual(["E006"]);
  });

  test("firstStop reads the topmost layer's first plain colour", () => {
    expect(firstStop("linear-gradient(to right, #fff 0%, #000)")).toBe("#fff");
    expect(firstStop("radial-gradient(circle at top, red, blue)")).toBe("red");
    expect(firstStop("linear-gradient(var(--a), #000)")).toBeUndefined();
  });

  test("firstStop skips a conic gradient's from angle and centre", () => {
    expect(firstStop("conic-gradient(from 45deg, #2f5d3a, #c2410c)")).toBe("#2f5d3a");
    expect(firstStop("conic-gradient(from 0.25turn at 50% 30%, red 0deg, blue 90deg)")).toBe("red");
    expect(firstStop("conic-gradient(at center, #fff 10%, #000)")).toBe("#fff");
    expect(firstStop("conic-gradient(#2f5d3a 0deg 90deg, #c2410c 90deg)")).toBe("#2f5d3a");
  });

  test("firstStop only offers a colour that works as an Outlook fallback", () => {
    expect(firstStop("linear-gradient(#1e293bcc, #000)")).toBeUndefined();
    expect(firstStop("linear-gradient(currentColor, #000)")).toBeUndefined();
    expect(firstStop("linear-gradient(hsl(200 50% 40%), #000)")).toBeUndefined();
    expect(firstStop("linear-gradient(90deg, rgb(10, 20, 30) 0%, #000)")).toBe("rgb(10, 20, 30)");
  });

  test("an unusable first stop gives no fallback and W001 says so", () => {
    const { box: b, ctx } = box({ "background-image": "linear-gradient(#1e293bcc, #000)" });
    expect(b.background).toBeUndefined();
    expect(ctx.diagnostics.list().map((d) => d.message)).toEqual([expect.stringContaining("isn't a plain")]);
  });

  test("min-height with centered or end alignment in a wrapping flex row is W003; a column spreads its items instead", () => {
    const col = box({ display: "flex", "flex-direction": "column", "justify-content": "flex-end", "min-height": "400px" });
    expect(codesOf(col.ctx)).toEqual([]);
    // a one-line row moves as one table; wrapping or items placed on their own can't
    expect(codesOf(box({ display: "flex", "align-items": "center", "min-height": "200px" }).ctx)).toEqual([]);
    expect(codesOf(box({ display: "flex", "flex-wrap": "wrap", "align-items": "center", "min-height": "200px" }).ctx)).toEqual(["W003"]);
    expect(codesOf(box({ display: "flex", "min-height": "200px" }).ctx)).toEqual([]);
  });

  test("min-height on a stretching flex row with painted items, or a column with growing items, is W003", () => {
    const run = (style: Record<string, string>, kids: Array<Record<string, string>>) => {
      const ctx = testCtx();
      buildBox(el("div", { display: "flex", "min-height": "300px", ...style }, kids.map((k) => el("div", { display: "block", ...k }))), ctx);
      return codesOf(ctx);
    };
    expect(run({}, [{ "background-color": "#f00" }])).toEqual(["W003"]);
    expect(run({ "align-items": "stretch" }, [{ "background-color": "#f00" }])).toEqual(["W003"]);
    expect(run({}, [{ "background-color": "transparent" }])).toEqual([]);
    expect(run({ "align-items": "flex-start" }, [{ "background-color": "#f00" }])).toEqual([]);
    expect(run({ "flex-direction": "column" }, [{ "flex-grow": "1" }])).toEqual(["W003"]);
    expect(run({ "flex-direction": "column" }, [{ "flex-grow": "0" }])).toEqual([]);
  });

  test("gradient text is background-clip: text on a gradient", () => {
    const g = { "background-image": "linear-gradient(90deg, #2f3cff, #e86bb8)" };
    const clip = { "background-clip": "text", color: "transparent" };
    expect(isGradientText(el("span", { ...g, ...clip }))).toBe(true);
    expect(isGradientText(el("span", { ...g, "-webkit-background-clip": "text", "-webkit-text-fill-color": "transparent" }))).toBe(true);
    expect(isGradientText(el("span", { ...g, "background-clip": "text", color: "#fff" }))).toBe(false);
    expect(isGradientText(el("span", g))).toBe(false);
  });
});

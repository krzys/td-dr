import { describe, expect, test } from "vitest";
import { analyze } from "../../../src/analyze/analyze.ts";
import { buttonRule } from "../../../src/analyze/rules/button.ts";
import { blockRule } from "../../../src/analyze/rules/block.ts";
import { flexRule } from "../../../src/analyze/rules/flex.ts";
import { imageRule } from "../../../src/analyze/rules/image.ts";
import { inlineRule } from "../../../src/analyze/rules/inline.ts";
import { unsupportedRule } from "../../../src/analyze/rules/unsupported.ts";
import type { ImageNode, StackNode } from "../../../src/ir/index.ts";
import type { StyledElement } from "../../../src/style/types.ts";
import { codesOf, el, testCtx, text } from "../../helpers/index.ts";

const rules = [unsupportedRule, imageRule, flexRule, blockRule, inlineRule];
const run = (e: StyledElement) => {
  const ctx = testCtx();
  const node = analyze(e, ctx, rules);
  // a box does not carry a height; the block rule says so, and these tests are about radius and overflow
  const messages = ctx.diagnostics.list().map((d) => `${d.code} ${d.message}`).filter((m) => !/^W001 height: /.test(m));
  return { node, ctx, messages };
};

const corners = (v: string) => ({
  "border-top-left-radius": v, "border-top-right-radius": v, "border-bottom-right-radius": v, "border-bottom-left-radius": v,
});
const img = (attrs: Record<string, string>, style: Record<string, string> = {}): StyledElement =>
  el("img", { display: "block", ...style }, [], { attrs: { src: "a.png", alt: "A", ...attrs } });
const block = (style: Record<string, string>, kids: StyledElement[] = []): StyledElement => el("div", { display: "block", ...style }, kids);

describe("percentage radius", () => {
  test("50% of a px-sized box resolves against its border box", () => {
    const { node, messages } = run(block({ width: "40px", height: "40px", "box-sizing": "border-box", ...corners("50%") }));
    expect((node as StackNode).box).toMatchObject({ radius: 20 });
    expect(messages).toEqual([]);
  });

  test("content-box width and height gain the padding and border", () => {
    const { node } = run(block({ width: "40px", height: "40px", "padding-left": "4px", "padding-right": "4px", "padding-top": "4px", "padding-bottom": "4px", ...corners("50%") }));
    expect((node as StackNode).box.radius).toBe(24);
  });

  test("an image resolves against its attrs plus its border", () => {
    const { node, ctx } = run(img({ width: "32", height: "32" }, { ...corners("50%"), "border-top-width": "2px", "border-top-style": "solid", "border-top-color": "#fff", "border-right-width": "2px", "border-right-style": "solid", "border-right-color": "#fff", "border-bottom-width": "2px", "border-bottom-style": "solid", "border-bottom-color": "#fff", "border-left-width": "2px", "border-left-style": "solid", "border-left-color": "#fff" }));
    expect((node as ImageNode).box.radius).toBe(18);
    expect(codesOf(ctx)).toEqual([]);
  });

  test("a non-square box gets the smaller of the two radii and one W003", () => {
    const { node, messages } = run(block({ width: "100px", height: "40px", ...corners("50%") }));
    expect((node as StackNode).box.radius).toBe(20);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/^W003 .*elliptical/);
  });

  test("unknown size: one W001 for the element, not one per corner", () => {
    const { node, messages } = run(block(corners("50%")));
    expect((node as StackNode).box.radius).toBeUndefined();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/^W001 border-radius: 50% needs a box with a px width and height/);
  });

  test("a percentage width is not a known size either", () => {
    expect(run(block({ width: "50%", height: "40px", ...corners("50%") })).messages).toHaveLength(1);
  });

  test("a px radius with different horizontal and vertical values keeps the smaller one", () => {
    const { node, messages } = run(block(corners("8px 4px")));
    expect((node as StackNode).box.radius).toBe(4);
    expect(messages[0]).toMatch(/^W003/);
  });
});

describe("icon boxes", () => {
  const icon = (extra: Record<string, string> = {}) => ({
    width: "56px", height: "56px", "background-color": "#3a2434", display: "flex", "align-items": "center", "justify-content": "center", ...corners("50%"), ...extra,
  });
  const link = (style: Record<string, string>) => el("a", style, [img({ width: "24", height: "24" })], { attrs: { href: "https://x.test" } });

  test("a fixed-size painted link centres its image in a frame of that size", () => {
    const { node, messages } = run(link(icon()));
    expect(node).toMatchObject({ kind: "image", href: "https://x.test", width: 24, height: 24, box: { background: "#3a2434", radius: 28, padding: { top: 16, right: 16, bottom: 16, left: 16 } } });
    expect(messages).toEqual([]);
  });

  test("border-box ring: the border comes out of the inner space", () => {
    const ring = { "box-sizing": "border-box", "border-top-width": "4px", "border-top-style": "solid", "border-top-color": "#ddf", "border-right-width": "4px", "border-right-style": "solid", "border-right-color": "#ddf", "border-bottom-width": "4px", "border-bottom-style": "solid", "border-bottom-color": "#ddf", "border-left-width": "4px", "border-left-style": "solid", "border-left-color": "#ddf" };
    const div = el("div", icon(ring), [img({ width: "20", height: "20" })]);
    const { node, messages } = run(div);
    expect(node).toMatchObject({ kind: "image", box: { radius: 28, padding: { top: 14, right: 14, bottom: 14, left: 14 }, border: { top: { width: 4 } } } });
    expect(messages).toEqual([]);
  });

  test("an odd leftover splits with the extra pixel on the right and bottom", () => {
    const { node } = run(link(icon({ width: "55px", height: "55px" })));
    expect((node as ImageNode).box.padding).toEqual({ top: 15, right: 16, bottom: 16, left: 15 });
  });

  test("a link that is not centred keeps the old path and its dropped-size warnings", () => {
    const { messages } = run(link(icon({ display: "block" })));
    expect(messages.some((m) => /width: 56px on a link around an image is dropped/.test(m))).toBe(true);
  });

  test("a div with an image is only an image when it is an icon box", () => {
    expect(imageRule.matches(el("div", { display: "block" }, [img({ width: "24", height: "24" })]), testCtx())).toBe(false);
    expect(imageRule.matches(el("div", icon(), [img({ width: "24", height: "24" })]), testCtx())).toBe(true);
  });
});

describe("overflow: hidden", () => {
  const rounded = { ...corners("8px"), "background-color": "#eee", overflow: "hidden" };
  const photo = (extra: Record<string, string> = {}) => img({ width: "250", height: "200" }, { width: "100%", ...extra });
  const child = (n: unknown, i: number) => (n as StackNode).children[i] as ImageNode;

  test("a first image takes the top corners and overflow is no longer dropped", () => {
    const { node, messages } = run(block({ ...corners("16px"), overflow: "hidden" }, [photo(), block({ "padding-top": "8px" }, [el("p", { display: "block" }, [text("x")])])]));
    expect(child(node, 0).box).toMatchObject({ radius: 16, radii: [16, 16, 0, 0] });
    expect(messages).toEqual([]);
  });

  test("a last image takes the bottom corners; a lone image takes all four", () => {
    const last = run(block(rounded, [block({}, []), photo()]));
    expect(child(last.node, 1).box.radii).toEqual([0, 0, 8, 8]);
    const lone = run(block(rounded, [photo()]));
    expect(child(lone.node, 0).box).toMatchObject({ radius: 8 });
    expect(child(lone.node, 0).box.radii).toBeUndefined();
    expect(lone.messages).toEqual([]);
  });

  test("a painted first block wears the corners too", () => {
    const { node } = run(block({ ...corners("16px"), overflow: "hidden" }, [block({ "background-color": "#f6e4d9" }), block({})]));
    expect(((node as StackNode).children[0] as StackNode).box).toMatchObject({ radii: [16, 16, 0, 0] });
  });

  test("the container's border comes off the image's radius", () => {
    const side = (s: string) => ({ [`border-${s}-width`]: "2px", [`border-${s}-style`]: "solid", [`border-${s}-color`]: "#000" });
    const { node } = run(block({ ...rounded, ...side("top"), ...side("left"), ...side("right"), ...side("bottom") }, [photo()]));
    expect(child(node, 0).box.radius).toBe(6);
  });

  test("padding keeps the image off the corners, so overflow stays W001 and says what changes", () => {
    const { messages } = run(block({ ...rounded, "padding-left": "8px" }, [photo()]));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/^W001 overflow: hidden is dropped: content that sticks out .* rounded corners/);
  });

  test("an image that does not fill the width is not clipped by the corners", () => {
    const { messages } = run(block(rounded, [img({ width: "100", height: "50" })]));
    expect(messages[0]).toMatch(/^W001 overflow: hidden is dropped/);
  });

  test("text as the first child: W001 with the visible change", () => {
    const { messages } = run(block({ overflow: "hidden" }, [el("p", { display: "block" }, [text("long")])]));
    expect(messages).toEqual(["W001 overflow: hidden is dropped: content that sticks out of this box will show instead of being cut off"]);
  });

  test("overflow: visible stays silent", () => {
    expect(run(block({ overflow: "visible" }, [])).messages).toEqual([]);
  });

  test("a no-wrap box clips its line (box.clip) and warns about Outlook once", () => {
    const { node, messages } = run(block({ overflow: "hidden", "white-space": "nowrap" }, [el("p", { display: "block" }, [text("a very long line")])]));
    expect((node as StackNode).box.clip).toBe(true);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/^W003 overflow: hidden cuts the line off .* Outlook/);
  });

  test("a flex strip with nowrap clips too", () => {
    const strip = el("div", { display: "flex", overflow: "hidden", "white-space": "nowrap" }, [img({ width: "20", height: "20" }), img({ width: "20", height: "20" })]);
    const { node } = run(strip);
    expect(node).toMatchObject({ kind: "row", box: { clip: true } });
  });

  const long = (style: Record<string, string>) => ({ overflow: "hidden", "white-space": "nowrap", ...style });
  const noClip = (e: StyledElement, ...rest: typeof rules) => {
    const ctx = testCtx();
    const node = analyze(e, ctx, [unsupportedRule, imageRule, ...rest, blockRule, inlineRule]);
    const msgs = ctx.diagnostics.list().map((d) => `${d.code} ${d.message}`);
    expect(JSON.stringify(node)).not.toContain('"clip"');
    expect(msgs.some((m) => m.startsWith("W003 overflow"))).toBe(false);
    return msgs;
  };

  test("a button cannot clip: W001, never the W003 that claims a clip", () => {
    const a = el("a", { display: "inline-block", "background-color": "#06f", "padding-left": "16px", "padding-right": "16px", "padding-top": "8px", "padding-bottom": "8px", ...long({ width: "80px" }) }, [text("Long button text")], { attrs: { href: "https://x.test" } });
    const msgs = noClip(a, buttonRule);
    expect(msgs.some((m) => /^W001 overflow: hidden is dropped/.test(m))).toBe(true);
  });

  test("an image inside a nowrap parent is not clipped either", () => {
    const msgs = noClip(img({ width: "30", height: "30" }, long({})));
    expect(msgs.some((m) => /^W001 overflow: hidden is dropped/.test(m))).toBe(true);
  });

  test("an icon box div keeps overflow as W001 (the image rule never emits a clip)", () => {
    const icon = el("div", long({ width: "56px", height: "56px", "background-color": "#333", display: "flex", "align-items": "center", "justify-content": "center" }), [img({ width: "24", height: "24" })]);
    const msgs = noClip(icon);
    expect(msgs.some((m) => /^W001 overflow: hidden is dropped/.test(m))).toBe(true);
  });

  test("a text block (a <p>) is passed through: no clip is claimed", () => {
    noClip(el("p", { display: "block", ...long({ width: "100px" }) }, [text("a very long line")]));
  });

  test("a flex item with nowrap + overflow gets box.clip", () => {
    const item = block(long({ width: "100px", "background-color": "#eee" }), [el("p", { display: "block" }, [text("long text long text")])]);
    const { node } = run(el("div", { display: "flex" }, [item, block({}, [])]));
    expect(JSON.stringify(node)).toContain('"clip":true');
  });

  test("a painted last child with a margin leaves the bottom corners W001", () => {
    const foot = block({ "background-color": "#0b1350", "margin-left": "12px", "margin-right": "12px", "padding-top": "8px" }, [el("p", { display: "block" }, [text("x")])]);
    const { node, messages } = run(block({ ...rounded, "border-top-left-radius": "16px", "border-top-right-radius": "16px", "border-bottom-left-radius": "16px", "border-bottom-right-radius": "16px" }, [photo(), foot]));
    expect(child(node, 0).box.radii).toEqual([16, 16, 0, 0]);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/^W001 overflow: hidden is dropped: .*rounded bottom-right, bottom-left corner/);
  });

  test("an unpainted last child touches no corner, so the photo alone makes overflow silent", () => {
    const { messages } = run(block(rounded, [photo(), block({ "padding-top": "8px" }, [el("p", { display: "block" }, [text("x")])])]));
    expect(messages).toEqual([]);
  });
});

describe("icon link centred by line-height", () => {
  const corners28 = { "border-top-left-radius": "28px", "border-top-right-radius": "28px", "border-bottom-right-radius": "28px", "border-bottom-left-radius": "28px" };
  const link = (style: Record<string, string>) =>
    el("a", { display: "inline-block", width: "56px", height: "56px", "background-color": "#3a2434", ...corners28, ...style }, [img({ width: "24", height: "24" })], { attrs: { href: "https://x.test" } });

  test("text-align:center + line-height as tall as the box is an icon box", () => {
    const { node, messages } = run(link({ "text-align": "center", "line-height": "56px" }));
    expect(node).toMatchObject({ kind: "image", box: { radius: 28, padding: { top: 16, right: 16, bottom: 16, left: 16 } } });
    expect(messages).toEqual([]);
  });

  test("not centred: the sizes are dropped and the 28px radius does not move onto the 24px icon", () => {
    const { node, messages } = run(link({}));
    expect((node as ImageNode).box.radius).toBeUndefined();
    expect(messages.some((m) => /^W001 width: 56px on a link around an image is dropped/.test(m))).toBe(true);
    expect(messages.some((m) => /^W001 border-radius on a link around an image is dropped because the link's size is/.test(m))).toBe(true);
  });
});

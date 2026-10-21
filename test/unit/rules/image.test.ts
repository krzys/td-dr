import { describe, expect, test } from "vitest";
import { imageRule } from "../../../src/analyze/rules/image.ts";
import type { StyledElement, StyledNode } from "../../../src/style/types.ts";
import { codesOf, el, testCtx, text } from "../../helpers/index.ts";

const img = (attrs: Record<string, string>, style: Record<string, string> = {}): StyledElement =>
  el("img", style, [], { attrs: { src: "a.png", alt: "A", ...attrs } });
const noRecurse = (): never => {
  throw new Error("image rule must not recurse");
};
const run = (e: StyledElement) => {
  const ctx = testCtx();
  const node = imageRule.analyze(e, ctx, noRecurse);
  return { node, ctx, codes: codesOf(ctx) };
};

describe("imageRule", () => {
  test("matches img and link-wrapped img only", () => {
    const ctx = testCtx();
    expect(imageRule.matches(img({}), ctx)).toBe(true);
    expect(imageRule.matches(el("a", {}, [text(" "), img({}), text("\n")]), ctx)).toBe(true);
    expect(imageRule.matches(el("a", {}, [text("hi"), img({})]), ctx)).toBe(false);
    expect(imageRule.matches(el("div", {}, [img({})]), ctx)).toBe(false);
  });

  test("attrs only", () => {
    const { node, codes } = run(img({ width: "200", height: "100" }));
    expect(node).toMatchObject({ kind: "image", src: "a.png", alt: "A", width: 200, height: 100 });
    expect(codes).toEqual([]);
  });

  test("css only", () => {
    const { node } = run(img({}, { width: "120px", height: "60px" }));
    expect(node).toMatchObject({ width: 120, height: 60 });
  });

  test("css wins over attrs", () => {
    const { node } = run(img({ width: "200", height: "100" }, { width: "120px", height: "60px" }));
    expect(node).toMatchObject({ width: 120, height: 60 });
  });

  test("fluid via width:100% and max-width:100%", () => {
    const a = run(img({}, { width: "100%" }));
    expect(a.node).toMatchObject({ fluid: true });
    expect(a.node).not.toHaveProperty("width");
    expect(a.codes).toEqual([]);
    const b = run(img({ width: "600" }, { "max-width": "100%" }));
    expect(b.node).toMatchObject({ fluid: true, width: 600 });
    expect(b.codes).toEqual([]);
  });

  test("height auto drops the height", () => {
    const { node } = run(img({ width: "200", height: "100" }, { height: "auto" }));
    expect(node).not.toHaveProperty("height");
  });

  test("missing alt, src, width are reported", () => {
    const { node, ctx, codes } = run(el("img", {}, [], { attrs: {} }));
    expect(node).toMatchObject({ kind: "image", src: "", alt: "" });
    expect(codes).toEqual(["W001", "W001", "W001"]);
    expect(ctx.diagnostics.list().map((d) => d.message)).toEqual([
      "image without src",
      "image has no alt text",
      "Outlook needs a width attribute; give the image a width",
    ]);
  });

  test("link-wrapped image takes href and the link's margin", () => {
    const a = el("a", { "margin-left": "auto", "margin-right": "auto" }, [text("\n "), img({ width: "100" }), text("\n")], {
      attrs: { href: "https://x.test" },
    });
    const { node, codes } = run(a);
    expect(node).toMatchObject({ kind: "image", href: "https://x.test", width: 100, box: { align: "center" } });
    expect(codes).toEqual([]);
  });

  test("margin auto on img gives align center", () => {
    const { node } = run(img({ width: "100" }, { "margin-left": "auto", "margin-right": "auto" }));
    expect(node).toMatchObject({ box: { align: "center" } });
  });

  test("a percentage width fills its column, with a W003 since block flow differs", () => {
    const { node, codes } = run(img({}, { width: "50%" }));
    expect(node).toMatchObject({ fluid: true });
    expect(codes).toEqual(["W003"]);
  });

  test("padding on img is dropped with a warning", () => {
    const { node, codes } = run(img({ width: "100" }, { "padding-top": "4px" }));
    expect(codes).toEqual(["W001"]);
    expect(node).toMatchObject({ box: { padding: { top: 0 } } });
  });

  test("fluid hero: width:100% with px max-width caps at that width", () => {
    const { node, codes } = run(img({}, { width: "100%", "max-width": "600px" }));
    expect(node).toMatchObject({ fluid: true, width: 600 });
    expect(codes).toEqual([]);
  });

  test("px max-width below width wins", () => {
    const { node } = run(img({}, { width: "800px", "max-width": "600px" }));
    expect(node).toMatchObject({ width: 600 });
    expect(node).not.toHaveProperty("fluid");
  });

  test("unsupported units are E006", () => {
    expect(run(img({ width: "100" }, { "max-width": "50%" })).codes).toEqual(["E006"]);
    expect(run(img({ width: "100" }, { height: "50%" })).codes).toEqual(["E006"]);
    expect(run(img({}, { width: "10em" })).codes).toContain("E006");
  });

  test("img margin beats link margin", () => {
    const a = el("a", { "margin-left": "auto", "margin-right": "auto" }, [img({ width: "100" }, { "margin-left": "auto" })]);
    expect(run(a).node).toMatchObject({ box: { align: "right" } });
  });

  test("a with comment child and img matches, two imgs do not", () => {
    const ctx = testCtx();
    const comment: StyledNode = { type: "comment", data: "x" };
    expect(imageRule.matches(el("a", {}, [comment, img({})]), ctx)).toBe(true);
    expect(imageRule.matches(el("a", {}, [img({}), img({})]), ctx)).toBe(false);
  });

  test("link border, background and radius merge into the image box; padding warns", () => {
    const a = el(
      "a",
      {
        "padding-top": "10px",
        "border-top-style": "solid",
        "border-top-width": "2px",
        "border-top-color": "#000",
        "background-color": "#f00",
        "border-top-left-radius": "4px",
        "border-top-right-radius": "4px",
        "border-bottom-left-radius": "4px",
        "border-bottom-right-radius": "4px",
      },
      [img({ width: "100" })],
      { attrs: { href: "https://x.test" } },
    );
    const { node, codes } = run(a);
    expect(node).toMatchObject({ box: { background: "#f00", radius: 4, border: { top: { width: 2 } }, padding: { top: 0 } } });
    expect(codes).toEqual(["W001"]);
  });

  test("link width is reported, not stripped silently", () => {
    const a = el("a", { width: "300px" }, [img({ width: "100" })]);
    expect(run(a).codes).toEqual(["W001"]);
  });

  test("float on an img is the node's float; as its own block it warns that nothing wraps", () => {
    const { node, codes } = run(img({ width: "100" }, { float: "right" }));
    expect(node).toMatchObject({ kind: "image", float: "right" });
    expect(node).not.toHaveProperty("line");
    expect(codes).toEqual(["W001"]);
  });

  test("link around a floated img keeps the link and the float", () => {
    const a = el("a", {}, [img({ width: "100" }, { float: "left" })], { attrs: { href: "https://x.test" } });
    const { node, codes } = run(a);
    expect(node).toMatchObject({ kind: "image", float: "left", href: "https://x.test" });
    expect(codes).toEqual(["W001"]);
  });

  test("uneven margin on a lowered floated img is not W005: it becomes cell padding", () => {
    const { codes } = run(img({ width: "100" }, { float: "left", "margin-right": "16px" }));
    expect(codes).toEqual(["W001"]);
  });

  test("width=100% attribute is fluid without a width warning", () => {
    const { node, codes } = run(img({ width: "100%" }));
    expect(node).toMatchObject({ fluid: true });
    expect(codes).toEqual([]);
  });

  test("other percent or invalid width attribute is W001", () => {
    const { codes } = run(img({ width: "50%" }));
    expect(codes).toEqual(["W001", "W001"]);
  });

  test("empty alt is decorative; link without href has no href", () => {
    const { codes } = run(img({ alt: "", width: "10" }));
    expect(codes).toEqual([]);
    const { node } = run(el("a", {}, [img({ width: "10" })]));
    expect(node).not.toHaveProperty("href");
  });

  test("email boilerplate raises nothing", () => {
    const { codes } = run(
      img(
        { width: "600", height: "240" },
        { display: "block", "border-top-width": "0", "outline-style": "none", "text-decoration-line": "none", "vertical-align": "top", "-ms-interpolation-mode": "bicubic", "max-width": "100%", height: "auto" },
      ),
    );
    expect(codes).toEqual([]);
  });

  test("width attr plus width:100% without max-width is fluid and the attr is dropped", () => {
    const { node, codes } = run(img({ width: "600" }, { width: "100%" }));
    expect(node).toMatchObject({ fluid: true });
    expect(node).not.toHaveProperty("width");
    expect(codes).toEqual([]);
  });

  test("a real outline or underline on the img is reported, resets are not", () => {
    const { codes } = run(img({ width: "10" }, { "outline-style": "solid", "outline-width": "3px", "text-decoration-line": "underline" }));
    expect(codes.length).toBeGreaterThan(0);
    expect(codes.every((c) => c === "W001")).toBe(true);
  });

  test("link paint overridden by img paint is reported per property", () => {
    const a = el("a", { "background-color": "#f00", "border-top-left-radius": "4px", "border-top-right-radius": "4px", "border-bottom-left-radius": "4px", "border-bottom-right-radius": "4px" }, [
      img({ width: "10" }, { "background-color": "#00f", "border-top-left-radius": "2px", "border-top-right-radius": "2px", "border-bottom-left-radius": "2px", "border-bottom-right-radius": "2px" }),
    ]);
    const { node, codes } = run(a);
    expect(codes).toEqual(["W001", "W001"]);
    expect(node).toMatchObject({ box: { background: "#00f", radius: 2 } });
  });

  test("link border dropped when the img has its own", () => {
    const side = { "border-top-style": "solid", "border-top-width": "1px", "border-top-color": "#000" };
    const { codes } = run(el("a", side, [img({ width: "10" }, side)]));
    expect(codes).toEqual(["W001"]);
  });

  test("link margin dropped when the img has its own position", () => {
    const a = el("a", { "margin-bottom": "20px" }, [img({ width: "10" }, { "margin-left": "auto" })]);
    expect(run(a).codes).toEqual(["W001"]);
    const b = el("a", { "margin-left": "auto", "margin-right": "auto" }, [img({ width: "10" }, { "margin-top": "4px" })]);
    expect(run(b).codes).toEqual(["W001"]);
  });

  test("link height is reported", () => {
    expect(run(el("a", { height: "40px" }, [img({ width: "10" })])).codes).toEqual(["W001"]);
  });

  test("width:0 and height:0 warn instead of being ignored silently", () => {
    expect(run(img({ width: "100" }, { width: "0px" })).codes).toEqual(["W001"]);
    expect(run(img({ width: "100", height: "50" }, { height: "0" })).codes).toEqual(["W001"]);
  });
});

import { describe, expect, test } from "vitest";
import { emit } from "../../src/emit/emit.ts";
import { checkEmitReady, emptyBox, sides, type Box, type Node } from "../../src/ir/index.ts";
import { testCtx } from "../helpers/index.ts";
import { lintEmail } from "../harness/golden-lint.test.ts";

const inline = (html: string): Node => ({ kind: "inline", html, style: {}, margin: sides(0) });
const stack = (box: Partial<Box>, resolvedWidth?: number, children: Node[] = [inline("hi")]): Node => ({
  kind: "stack",
  box: { ...emptyBox(), ...box },
  children,
  gap: 0,
  collapse: false,
  ...(resolvedWidth === undefined ? {} : { resolvedWidth }),
});
const run = (n: Node): string => {
  // inside a plain root: the shell paints the root's own background
  const { html } = emit(checkEmitReady(stack({}, 600, [n])), testCtx());
  expect(lintEmail(html)).toEqual([]);
  return html;
};
const PHOTO = { css: "url('https://x.test/a.jpg')", url: "https://x.test/a.jpg" };

describe("emit backgrounds", () => {
  test("a photo gets bgcolor, background attr, css and a VML frame around a padded inner table", () => {
    const html = run(stack({ background: "#1d3557", backgroundImage: { ...PHOTO, size: "cover", position: "center" }, minHeight: 300, padding: sides(20) }, 600));
    expect(html).toContain('bgcolor="#1d3557" background="https://x.test/a.jpg" height="300" valign="top"');
    expect(html).toContain("background-color:#1d3557;background-image:url('https://x.test/a.jpg');background-size:cover;background-position:center;height:300px;");
    expect(html).toContain('<!--[if mso]><v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;height:300px;">');
    expect(html).toContain('<v:fill type="frame" src="https://x.test/a.jpg" color="#1d3557"/><v:textbox inset="0,0,0,0"><![endif]-->');
    expect(html).toContain("<!--[if mso]></v:textbox></v:rect><![endif]-->");
    // the padding moved to the inner cell, so the photo covers the padded area too
    expect(html).toContain('<td style="padding:20px;">hi</td>');
  });

  test("a photo without min-height skips VML and says so", () => {
    const ctx = testCtx();
    const { html } = emit(checkEmitReady(stack({}, 600, [stack({ background: "#000000", backgroundImage: PHOTO }, 600)])), ctx);
    expect(html).not.toContain("v:rect");
    expect(html).toContain('background="https://x.test/a.jpg"');
    expect(ctx.diagnostics.list().map((d) => [d.code, d.message])).toEqual([["W001", expect.stringContaining("set a px min-height")]]);
  });

  test("cover or no-repeat is a frame, a plain repeating image a tile", () => {
    expect(run(stack({ backgroundImage: { ...PHOTO, size: "cover" }, minHeight: 100 }, 600))).toContain('type="frame"');
    expect(run(stack({ backgroundImage: { ...PHOTO, repeat: "no-repeat" }, minHeight: 100 }, 600))).not.toContain('type="tile"');
    expect(run(stack({ backgroundImage: PHOTO, minHeight: 100 }, 600))).toContain('type="tile"');
  });

  test("a photo box always has a px width to size the rect: a tree without one never reaches the emitter", () => {
    const unresolved = stack({}, 600, [stack({ background: "#000000", backgroundImage: PHOTO, minHeight: 100 })]);
    expect(() => checkEmitReady(unresolved)).toThrow("stack has no resolvedWidth (resolve-widths didn't run)");
    const { html } = emit(checkEmitReady(stack({}, 600, [stack({ background: "#000000", backgroundImage: PHOTO, minHeight: 100 }, 320)])), testCtx());
    expect(html).toContain('style="width:320px;height:100px;"');
  });

  test("a stretched card keeps its photo, bgcolor and height; Outlook gets W001 instead of VML", () => {
    const card = (box: Partial<Box>): Node => stack(box, 300, [inline("card")]);
    const col = (child: Node) => ({ width: { grow: 1 }, valign: "top" as const, child, stretch: true, resolved: { px: 300, pct: 50 } });
    const row: Node = {
      kind: "row", box: emptyBox(), gap: 0, wrap: false, resolvedWidth: 600,
      cols: [col(card({ background: "#223344", backgroundImage: PHOTO, minHeight: 200 })), col(card({ background: "#eeeeee" }))],
    };
    const ctx = testCtx();
    const { html } = emit(checkEmitReady(stack({}, 600, [row])), ctx);
    expect(html).toContain('bgcolor="#223344" background="https://x.test/a.jpg"');
    expect(html).toContain("background-image:url('https://x.test/a.jpg');");
    expect(html).toContain('height="200"');
    expect(html).not.toContain("v:rect");
    expect(ctx.diagnostics.list().map((d) => d.code)).toEqual(["W001"]);
  });

  test("a gradient is css only, over the fallback colour", () => {
    const css = "linear-gradient(160deg, #6b5e4c 0%, #1e293b 100%)";
    const html = run(stack({ background: "#6b5e4c", backgroundImage: { css } }, 600));
    expect(html).toContain(`bgcolor="#6b5e4c"`);
    expect(html).toContain(`background-image:${css};`);
    expect(html).not.toContain("v:rect");
    expect(html).not.toContain(' background="');
  });

  test("min-height is the painted box: a padded cell's height is the content height", () => {
    const html = run(stack({ background: "#1e3a8a", minHeight: 300, padding: sides(40) }, 600));
    expect(html).toContain('height="220"');
    expect(html).toContain("height:220px;");
  });

  test("border widths come off the VML shape", () => {
    const b = { width: 2, style: "solid" as const, color: "#000000" };
    const html = run(stack({ backgroundImage: PHOTO, minHeight: 300, border: { top: b, right: b, bottom: b, left: b } }, 600));
    expect(html).toContain("width:596px;height:296px;");
  });
});

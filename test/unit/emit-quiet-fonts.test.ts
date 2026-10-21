import { describe, expect, test } from "vitest";
import { compile } from "../../src/index.ts";
import { markQuiet, saysNothing } from "../../src/style/props.ts";

const body = (input: string): string => {
  const html = compile(`<div style="max-width:600px;margin:0 auto">${input}</div>`, { strict: false }).html;
  return html.slice(html.indexOf("<body"));
};
const FONT = "font:16px/24px Arial,sans-serif";
const styleOf = (html: string, tag: string): string[] => (new RegExp(`<${tag} style="([^"]*)"`).exec(html)?.[1] ?? "").split(";");

describe("initial font longhands", () => {
  test("a font shorthand's initial longhands are left out of cells and blocks", () => {
    const out = body(`<p style="${FONT};margin:0">Hi</p><div style="${FONT}">There</div>`);
    expect(out).toContain("font-size:16px");
    expect(out).not.toMatch(/font-style|font-variant|font-weight|font-optical-sizing/);
  });

  test("normal stays under an ancestor that says another value", () => {
    const out = body(`<div style="font-weight:bold;font-style:italic"><p style="${FONT};margin:0">Hi</p></div>`);
    expect(styleOf(out, "p")).toEqual(expect.arrayContaining(["font-style:normal", "font-weight:normal"]));
  });

  test("so does font-variant:normal under a font-variant longhand", () => {
    const out = body(`<div style="font-variant-caps:small-caps"><p style="font-variant:normal;margin:0">Hi</p></div>`);
    expect(out).toContain("font-variant:normal");
  });

  test("tags clients style themselves keep what they say", () => {
    const out = body(`<h2 style="${FONT};margin:0">Head</h2><p style="margin:0">a <b style="font-weight:400">b</b> <em style="font-style:normal">c</em></p>`);
    expect(styleOf(out, "h2")).toEqual(expect.arrayContaining(["font-style:normal", "font-variant:normal", "font-weight:normal"]));
    expect(out).toContain('<b style="font-weight:400">');
    expect(out).toContain('<em style="font-style:normal">');
    expect(out).not.toContain("font-optical-sizing");
  });

  test("a screen that drops one puts the initial value back", () => {
    const out = compile(`<style>p{font-weight:bold;margin:0} @media (max-width:600px){p{font-weight:normal}}</style><p>Hi</p>`, { strict: false });
    expect(out.diagnostics.map((d) => d.code)).not.toContain("E017");
    expect(out.html).toMatch(/@media[^{]*max-width: ?600px[^{]*\{[^}]*\{[^}]*font-weight:normal !important/);
  });
});

describe("markQuiet / saysNothing", () => {
  test("the mark follows a value other than the initial one", () => {
    const bold: Record<string, string> = { "font-weight": "700" };
    markQuiet(bold);
    expect(saysNothing("span", bold, "font-weight", "normal")).toBe(false);
    const plain: Record<string, string> = { "font-weight": "400", "font-style": "normal" };
    markQuiet(plain);
    expect(plain).toEqual({ "font-weight": "400", "font-style": "normal" });
    expect(saysNothing("span", plain, "font-weight", "400")).toBe(true);
    expect(saysNothing(undefined, plain, "font-style", "normal")).toBe(true);
  });

  test("only for the quiet properties, at their initial value, off the tags clients style", () => {
    expect(saysNothing("span", {}, "color", "#000")).toBe(false);
    expect(saysNothing("span", {}, "font-weight", "bold")).toBe(false);
    expect(saysNothing("th", {}, "font-weight", "normal")).toBe(false);
    expect(saysNothing("h1", {}, "font-optical-sizing", "auto")).toBe(true);
    expect(saysNothing("i", {}, "font-style", "normal")).toBe(false);
  });
});

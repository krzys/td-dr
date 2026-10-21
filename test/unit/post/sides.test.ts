import { describe, expect, test } from "vitest";
import { compile } from "../../../src/index.ts";
import { compactSides, compactStyle } from "../../../src/post/sides.ts";

describe("compactStyle", () => {
  test("four sides say their shorthand in the fewest values, where the first of them was", () => {
    expect(compactStyle("color:red;padding-top:6px;padding-right:10px;padding-bottom:6px;padding-left:10px;width:5px")).toBe("color:red;padding:6px 10px;width:5px");
    expect(compactStyle("margin-top:0;margin-right:auto;margin-bottom:0;margin-left:auto")).toBe("margin:0 auto");
    expect(compactStyle("padding-top:1px;padding-right:2px;padding-bottom:3px;padding-left:2px")).toBe("padding:1px 2px 3px");
    expect(compactStyle("padding-top:1px;padding-right:2px;padding-bottom:3px;padding-left:4px")).toBe("padding:1px 2px 3px 4px");
    expect(compactStyle("padding-left:0;padding-top:0;padding-right:0;padding-bottom:0")).toBe("padding:0");
  });

  test("four equal border sides, or one width, style and colour, are one border", () => {
    const side = (s: string) => `border-${s}:1px solid #111827;`;
    expect(compactStyle(`width:50%;${["top", "right", "bottom", "left"].map(side).join("")}`)).toBe("width:50%;border:1px solid #111827;");
    const parts = ["width:1px", "style:solid", "color:#a5f3fc"];
    expect(compactStyle(["top", "right", "bottom", "left"].flatMap((s) => parts.map((p) => `border-${s}-${p}`)).join(";"))).toBe("border:1px solid #a5f3fc");
    // a side that differs keeps the colours apart, the rest folds
    const odd = ["top", "right", "bottom", "left"].flatMap((s) => ["width:1px", "style:solid", `color:${s === "top" ? "red" : "blue"}`].map((p) => `border-${s}-${p}`)).join(";");
    expect(compactStyle(odd)).toBe("border-width:1px;border-style:solid;border-color:red blue blue");
  });

  test("left as it is where something else sets those longhands or the sides don't all say", () => {
    for (const s of [
      "padding-top:1px;padding-right:1px;padding-bottom:1px",
      "padding:0;padding-top:1px;padding-right:1px;padding-bottom:1px;padding-left:1px",
      "padding-top:1px;padding-right:1px;padding-bottom:1px;padding-left:1px;padding-left:2px",
      "border-top:1px solid red;border-right:1px solid red;border-bottom:1px solid red;border-left:1px solid blue",
      "border-top:1px solid red;border-right:1px solid red;border-bottom:1px solid red;border-left:1px solid red;border-top-color:blue",
      "border-image:url(x.png) 30;border-top:1px solid red;border-right:1px solid red;border-bottom:1px solid red;border-left:1px solid red",
      "padding-top:1px !important;padding-right:1px;padding-bottom:1px;padding-left:1px",
      "padding-top:\u{e000}pad\u{e001};padding-right:1px;padding-bottom:1px;padding-left:1px",
    ]) {
      expect(compactStyle(s)).toBe(s);
    }
    // width and style fold, colours with spaces don't make one border
    const rgb = ["top", "right", "bottom", "left"].flatMap((s) => ["width:1px", "style:solid", "color:rgb(1, 2, 3)"].map((p) => `border-${s}-${p}`)).join(";");
    expect(compactStyle(rgb)).toBe("border-width:1px;border-style:solid;border-color:rgb(1, 2, 3)");
  });

  test("Outlook-only markup and other attributes keep what they say", () => {
    const four = "padding-top:1px;padding-right:1px;padding-bottom:1px;padding-left:1px";
    const html = `<!--[if mso]><td style="${four}"><![endif]--><td title="${four}" style="${four}">x</td>`;
    expect(compactSides(html)).toBe(`<!--[if mso]><td style="${four}"><![endif]--><td title="${four}" style="padding:1px">x</td>`);
  });
});

describe("in a compile", () => {
  test("a bordered box on a screen that changes one side: the base says border, the screen's rule overrides the side", () => {
    const input = `<style>.card{border:1px solid #444444;padding:16px}@media (max-width:600px){.card{border-top-color:#ff0000}}</style><div style="max-width:600px"><div class="card">Hi</div></div>`;
    const { html, diagnostics } = compile(input);
    expect(html).toMatch(/<td class="[^"]+" style="[^"]*border:1px solid #444444;/);
    expect(html).not.toMatch(/style="[^"]*border-top:1px solid #444444/);
    expect(html).toMatch(/\{ ?border-top:1px solid #ff0000 !important;? ?\}/);
    expect(diagnostics.filter((d) => d.severity !== "info")).toEqual([]);
  });
});

test("four corners are one border-radius, but not elliptical ones", () => {
  const corners = (v: (c: string) => string) => ["top-left", "top-right", "bottom-right", "bottom-left"].map((c) => `border-${c}-radius:${v(c)}`).join(";");
  expect(compactStyle(corners(() => "6px"))).toBe("border-radius:6px");
  expect(compactStyle(corners((c) => (c.startsWith("top") ? "8px" : "0")))).toBe("border-radius:8px 8px 0 0");
  expect(compactStyle(corners(() => "6px 3px"))).toBe(corners(() => "6px 3px"));
});

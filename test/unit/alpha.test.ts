import { describe, expect, test } from "vitest";
import { compile } from "../../src/index.ts";
import { flatten, parseColor } from "../../src/style/alpha.ts";

describe("parseColor", () => {
  test.each([
    ["#fff", [255, 255, 255, 1]],
    ["#0f172bb3", [15, 23, 43, 0.702]],
    ["rgba(79, 57, 246, 0.5)", [79, 57, 246, 0.5]],
    ["rgb(0 0 0 / 25%)", [0, 0, 0, 0.25]],
    ["white", [255, 255, 255, 1]],
    ["Navy", [0, 0, 128, 1]],
    ["rebeccapurple", [102, 51, 153, 1]],
    ["lightgoldenrodyellow", [250, 250, 210, 1]],
    ["hsl(0, 100%, 50%)", [255, 0, 0, 1]],
    ["hsl(120 100 50)", [0, 255, 0, 1]],
    ["hsla(120, 100%, 25%, 0.5)", [0, 128, 0, 0.5]],
    ["hsl(240 100% 50% / 25%)", [0, 0, 255, 0.25]],
    ["hsl(0.5turn 100% 50%)", [0, 255, 255, 1]],
    ["hsl(180deg, 100%, 50%)", [0, 255, 255, 1]],
    ["hsla(0,0%,0%,.5)", [0, 0, 0, 0.5]],
  ])("%s", (c, rgba) => {
    const got = parseColor(c)!;
    expect(got.slice(0, 3)).toEqual(rgba.slice(0, 3));
    expect(got[3]).toBeCloseTo(rgba[3]!, 3);
  });

  test("every CSS named colour is known", () => {
    for (const n of ["red", "tomato", "darkslategrey", "yellowgreen", "whitesmoke", "grey", "aqua"]) expect(parseColor(n), n).toBeDefined();
  });

  test("unknown colours aren't guessed", () => {
    for (const c of ["notacolour", "hsl(red, 1%, 2%)", "hsl(120,100,50)", "hsla(120, 100, 50, .5)", "hsl(120, 100% 50%)", "hsl(120 100% 50%, .5)", "var(--x)", "currentcolor"]) expect(parseColor(c), c).toBeUndefined();
  });
});

describe("flatten", () => {
  test("blends over the colour behind", () => expect(flatten("rgba(0, 0, 0, 0.5)", [255, 255, 255])).toBe("#808080"));
  test("opaque and fully transparent colours are left as written", () => {
    expect(flatten("#123456", [255, 255, 255])).toBe("#123456");
    expect(flatten("rgba(0, 0, 0, 0)", [255, 255, 255])).toBe("rgba(0, 0, 0, 0)");
  });
});

describe("pipeline", () => {
  const body = (h: string) => h.slice(h.indexOf("<body"));

  test("translucent text over a solid background is solid in the output", () => {
    const { html, diagnostics } = compile('<div style="background:#ffffff;padding:8px"><p style="color:rgba(0,0,0,.5)">x</p></div>');
    expect(body(html)).toContain("#808080");
    expect(body(html)).not.toMatch(/rgba\(/);
    expect(diagnostics.filter((d) => d.code === "W006")).toEqual([]);
  });

  test("a translucent background over its parent's becomes the colour you'd see", () => {
    const { html, diagnostics } = compile('<div style="background:#000000;padding:8px"><div style="background:rgba(255,255,255,0.5);padding:8px">x</div></div>');
    expect(body(html)).toContain("#808080");
    expect(diagnostics.map((d) => d.code)).not.toContain("W001");
  });

  test("an inherited translucent colour blends over the child's own background", () => {
    const { html } = compile('<div style="background:#ffffff;color:rgba(0,0,0,0.5);padding:8px"><p>a</p><div style="background:#000000;padding:8px"><p>b</p></div></div>');
    expect(body(html)).toContain("#808080");
    expect(body(html)).toContain("#000000;");
    expect(body(html)).not.toMatch(/rgba\(/);
  });

  test("a named background is a known backdrop", () => {
    const { html, diagnostics } = compile('<div style="background:navy;color:rgba(255,255,255,.5);padding:8px">x</div>');
    expect(body(html)).toContain("color:#8080c0");
    expect(body(html)).not.toMatch(/rgba\(/);
    expect(diagnostics.map((d) => d.code)).not.toContain("W006");
  });

  test("hsla text over the white page is flattened", () => {
    const { html, diagnostics } = compile('<div style="color:hsla(0,0%,0%,.5);padding:8px">x</div>');
    expect(body(html)).toContain("color:#808080");
    expect(body(html)).not.toMatch(/hsla\(/);
    expect(diagnostics.map((d) => d.code)).not.toContain("W006");
  });

  test("a translucent colour that can't be flattened is reported at the source, not as a compiler bug", () => {
    const { diagnostics } = compile('<div style="background:linear-gradient(#000,#fff);padding:8px"><p style="color:rgba(0,0,0,0.5)">x</p></div>', { strict: false });
    const w = diagnostics.filter((d) => d.code === "W001" && /translucent/i.test(d.message));
    expect(w.length).toBe(1);
    expect(w[0]?.hint).toBeTruthy();
    expect(w[0]?.loc).toEqual({ line: 1, col: 64 });
    expect(diagnostics.map((d) => d.code)).not.toContain("W006");
  });

  test("a translucent colour on an opaque-flattenable background raises nothing extra", () => {
    const { diagnostics } = compile('<div style="background:#fff;padding:8px"><p style="color:rgba(0,0,0,.5)">x</p></div>');
    expect(diagnostics.filter((d) => /translucent/i.test(d.message))).toEqual([]);
  });

  test("over a gradient nothing is flattened", () => {
    const { html } = compile('<div style="background:linear-gradient(#000,#fff);padding:8px"><p style="color:rgba(0,0,0,0.5)">x</p></div>', { strict: false });
    expect(body(html)).toMatch(/rgba\(0, ?0, ?0, ?0\.5\)/);
  });
});

describe("a translucent background over a gradient", () => {
  test("is reported once", async () => {
    const { compile } = await import("../../src/index.ts");
    const r = compile('<div style="background-image:linear-gradient(#f00,#00f)"><div style="background-color:rgba(0,0,0,.5);padding:8px">x</div></div>');
    expect(r.diagnostics.filter((d) => d.code === "W001" && /ranslucent/.test(d.message))).toHaveLength(1);
  });
});

import { describe, expect, test } from "vitest";
import { compile } from "../../src/index.ts";

const body = (h: string) => h.slice(h.indexOf("<body"));

describe("rtl output", () => {
  test("dir=rtl puts direction:rtl on the cell that holds the text", () => {
    const { html } = compile('<div dir="rtl" style="padding-inline-start:20px"><p>Hello</p></div>');
    expect(body(html)).toMatch(/<td[^>]*style="[^"]*direction:rtl[^"]*"[^>]*><p[^>]*>Hello/);
    expect(body(html)).not.toContain('dir="rtl"');
  });

  test("so does direction:rtl, and an inner direction:ltr wins back", () => {
    const { html } = compile('<div style="direction:rtl"><p>a</p><p style="direction:ltr">b</p></div>');
    expect(body(html)).toMatch(/direction:rtl[^"]*"[^>]*><p[^>]*>a/);
    expect(body(html)).toMatch(/direction:ltr[^"]*"[^>]*><p[^>]*>b/);
  });

  test("a flex row in rtl is laid out left to right, so it says so", () => {
    const r = compile('<div dir="rtl" style="display:flex;gap:8px"><div>A</div><div>B</div></div>');
    const d = r.diagnostics.find((x) => x.code === "W001" && /rtl/i.test(x.message));
    expect(d?.hint).toBeTruthy();
    expect(d?.loc).toEqual({ line: 1, col: 1 });
  });

  test("a single flex item or a ltr row has nothing to say", () => {
    expect(compile('<div dir="rtl" style="display:flex"><div>A</div></div>', { lang: "en" }).diagnostics).toEqual([]);
    expect(compile('<div style="display:flex;gap:8px"><div>A</div><div>B</div></div>', { lang: "en" }).diagnostics).toEqual([]);
  });

  test("outlook-only items don't make a row of two", () => {
    expect(compile('<div dir="rtl" style="display:flex"><div>A</div><div data-email="outlook-only">B</div></div>', { lang: "en" }).diagnostics).toEqual([]);
  });

  test("dir=auto is not supported and says so", () => {
    const d = compile('<p>x</p>\n<div dir="auto"><p>Hello</p></div>').diagnostics.filter((x) => x.code === "W001");
    expect(d).toHaveLength(1);
    expect(d[0]?.loc?.line).toBe(2);
    expect(d[0]?.hint).toBeTruthy();
  });
});

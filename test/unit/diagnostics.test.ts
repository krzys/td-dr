import { describe, expect, test } from "vitest";
import { collapse, type Diagnostic } from "../../src/diagnostics/diagnostic.ts";
import { compile } from "../../src/index.ts";

const w = (message: string, line?: number, col = 1): Diagnostic => ({ code: "W001", severity: "warning", message, ...(line !== undefined && { loc: { line, col } }) });

describe("repeated diagnostics", () => {
  test("the same one at the same place is said once", () => {
    expect(collapse([w("a", 3), w("a", 3), w("b", 3)])).toEqual([w("a", 3), w("b", 3)]);
  });

  test("the same one at several places is one, at the earliest, counted, with every place kept", () => {
    expect(collapse([w("a", 9), w("b", 2), w("a", 4), w("a", 9)])).toEqual([
      { ...w("a (2 places)", 4), locs: [{ line: 4, col: 1 }, { line: 9, col: 1 }] },
      w("b", 2),
    ]);
  });

  test("a different hint or code keeps them apart, a place-less copy joins its group", () => {
    const hinted = { ...w("a", 1), hint: "h" };
    expect(collapse([w("a", 1), hinted, { ...w("a", 1), code: "W002" }, w("a")])).toEqual([w("a", 1), hinted, { ...w("a", 1), code: "W002" }]);
  });

  test("compile says a property dropped on many elements once", () => {
    const html = ["a", "b", "c"].map((t) => `<div style="scroll-snap-align:start">${t}</div>`).join("\n");
    const ds = compile(html).diagnostics.filter((d) => d.message.startsWith("scroll-snap"));
    expect(ds).toHaveLength(1);
    expect(ds[0]).toMatchObject({ message: "scroll-snap-align: start is dropped (3 places)", loc: { line: 1 } });
    expect(ds[0]!.locs?.map((l) => l.line)).toEqual([1, 2, 3]);
  });
});

describe("one diagnostic per shorthand", () => {
  const e = (message: string): Diagnostic => ({ code: "E006", severity: "error", message, loc: { line: 1, col: 1 } });

  test("the four sides said apart at one place are said once, as the shorthand", () => {
    const sides = ["top", "right", "bottom", "left"].map((s, i) => e(`padding-${s}: ${i % 2 ? "8%" : "5%"} is not supported, use px`));
    expect(collapse([...sides, e("width: 9ch is not supported")])).toEqual([e("padding: 5% 8% is not supported, use px"), e("width: 9ch is not supported")]);
    const borders = ["top", "right", "bottom", "left"].map((s) => ({ ...e(`border-${s}-style: inset is drawn as solid`), code: "W001", severity: "warning" as const }));
    expect(collapse(borders).map((d) => d.message)).toEqual(["border-style: inset is drawn as solid"]);
  });

  test("three sides stay apart, and so do sides at other places", () => {
    const three = ["top", "right", "bottom"].map((s) => e(`margin-${s}: 5% is not supported, use px`));
    expect(collapse(three)).toEqual(three);
    const apart = ["top", "right", "bottom", "left"].map((s, i) => ({ ...e(`margin-${s}: 5% is not supported, use px`), loc: { line: i + 1, col: 1 } }));
    expect(collapse(apart)).toHaveLength(4);
  });

  test("the sides listed in one message are written as the shorthand", () => {
    const one = e("Translucent colour kept as written (border-top-color: rgba(24, 32, 41, 0.12); border-right-color: rgba(24, 32, 41, 0.12); border-bottom-color: rgba(24, 32, 41, 0.12); border-left-color: rgba(24, 32, 41, 0.12)): it sits over a photo");
    expect(collapse([one])[0]!.message).toBe("Translucent colour kept as written (border-color: rgba(24, 32, 41, 0.12)): it sits over a photo");
  });

  test("a prefixed copy said next to the standard property is left out", () => {
    const w1 = (m: string): Diagnostic => ({ ...e(m), code: "W001", severity: "warning" });
    expect(collapse([w1("-webkit-mask: url(a.png) is dropped"), w1("mask: url(a.png) is dropped"), w1("-webkit-line-clamp: 2 is dropped")])).toEqual([
      w1("mask: url(a.png) is dropped"),
      w1("-webkit-line-clamp: 2 is dropped"),
    ]);
  });

  test("compile says padding: 5% 8% once", () => {
    const ds = compile('<div style="padding:5% 8%">a</div>', { lang: "en" }).diagnostics.filter((d) => d.code === "E006");
    expect(ds.map((d) => d.message)).toEqual(["padding: 5% 8% is not supported, use px"]);
  });
});

describe("the UA sheet's own styles", () => {
  test("a plain <hr> says nothing about its inset border, an authored inset one does", () => {
    const codes = (html: string) => compile(html, { lang: "en" }).diagnostics.filter((d) => d.message.includes("inset"));
    expect(codes("<p>a</p><hr><p>b</p>")).toEqual([]);
    expect(codes('<p>a</p><hr style="border:2px inset #888888"><p>b</p>').map((d) => d.message)).toEqual(["border-style: inset is drawn as solid"]);
  });
});

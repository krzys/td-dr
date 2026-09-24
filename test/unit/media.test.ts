import { describe, expect, test } from "vitest";
import { hoverSubject } from "../../src/style/selectors.ts";
import { matchesList, parseMedia, rangesOf, wantsDark } from "../../src/style/media.ts";
import type { Env } from "../../src/style/types.ts";

const at = (viewport: number, dark = false): Env => ({ viewport, dark, hover: false });
const holds = (q: string, viewport: number, dark = false): boolean => matchesList(parseMedia(q), at(viewport, dark));

describe("media query evaluation", () => {
  test("media types", () => {
    for (const q of ["all", "screen", "only screen", "screen and (min-width: 0)"]) expect(holds(q, 500), q).toBe(true);
    for (const q of ["print", "speech", "only print"]) expect(holds(q, 500), q).toBe(false);
    expect(holds("not print", 500)).toBe(true);
    expect(holds("not screen", 500)).toBe(false);
  });

  test("min-width and max-width are inclusive", () => {
    expect(holds("(max-width: 600px)", 600)).toBe(true);
    expect(holds("(max-width: 600px)", 601)).toBe(false);
    expect(holds("(min-width: 600px)", 599)).toBe(false);
    expect(holds("(min-width: 600px)", 600)).toBe(true);
    expect(holds("(min-width: 600px)", Infinity)).toBe(true);
    expect(holds("(max-width: 600px)", Infinity)).toBe(false);
  });

  test("em and rem are 16px", () => {
    expect(holds("(max-width: 40em)", 640)).toBe(true);
    expect(holds("(max-width: 40rem)", 641)).toBe(false);
  });

  test("range forms", () => {
    expect(holds("(width <= 600px)", 600)).toBe(true);
    expect(holds("(width < 600px)", 600)).toBe(false);
    expect(holds("(width < 600px)", 599)).toBe(true);
    expect(holds("(width >= 600px)", 600)).toBe(true);
    expect(holds("(width > 600px)", 600)).toBe(false);
    expect(holds("(400px <= width <= 600px)", 399)).toBe(false);
    expect(holds("(400px <= width <= 600px)", 400)).toBe(true);
    expect(holds("(400px <= width < 600px)", 600)).toBe(false);
    expect(holds("(600px >= width)", 600)).toBe(true);
  });

  test("fractional values round to whole px", () => {
    expect(holds("(max-width: 599.98px)", 599)).toBe(true);
    expect(holds("(max-width: 599.98px)", 600)).toBe(false);
    expect(holds("(min-width: 600.02px)", 600)).toBe(false);
    expect(holds("(min-width: 600.02px)", 601)).toBe(true);
  });

  test("and, comma lists and not", () => {
    expect(holds("(min-width: 400px) and (max-width: 600px)", 500)).toBe(true);
    expect(holds("(min-width: 400px) and (max-width: 600px)", 700)).toBe(false);
    expect(holds("(max-width: 300px), (min-width: 700px)", 800)).toBe(true);
    expect(holds("(max-width: 300px), (min-width: 700px)", 500)).toBe(false);
    expect(holds("not (min-width: 600px)", 500)).toBe(true);
    expect(holds("not screen and (min-width: 600px)", 500)).toBe(true);
  });

  test("prefers-color-scheme", () => {
    expect(holds("(prefers-color-scheme: dark)", 500, true)).toBe(true);
    expect(holds("(prefers-color-scheme: dark)", 500, false)).toBe(false);
    expect(holds("(prefers-color-scheme: light)", 500, false)).toBe(true);
    expect(holds("not (prefers-color-scheme: light)", 500, true)).toBe(true);
    expect(wantsDark(parseMedia("(prefers-color-scheme: dark)")[0]!)).toBe(true);
    expect(wantsDark(parseMedia("not (prefers-color-scheme: light)")[0]!)).toBe(true);
    expect(wantsDark(parseMedia("(prefers-color-scheme: light)")[0]!)).toBe(false);
    expect(wantsDark(parseMedia("not (prefers-color-scheme: dark)")[0]!)).toBe(false);
  });

  test("unsupported features never match and say what they were", () => {
    for (const q of ["(orientation: landscape)", "(min-height: 400px)", "(hover: hover)", "(pointer: coarse)", "(min-resolution: 2dppx)", "(prefers-reduced-motion: reduce)", "(color)"]) {
      const [parsed] = parseMedia(q);
      expect(parsed?.unsupported, q).toBe(q);
      expect(holds(q, 500), q).toBe(false);
    }
    expect(parseMedia("screen and (orientation: landscape)")[0]?.unsupported).toBe("(orientation: landscape)");
    expect(parseMedia("(min-width: 600px) and (prefers-color-scheme: dark)")[0]?.unsupported).toContain("prefers-color-scheme");
    expect(parseMedia("(min-width: 600px) or (max-width: 300px)")[0]?.unsupported).toBeTruthy();
    expect(parseMedia("(min-width: 600px) and")[0]?.unsupported).toBeTruthy();
  });

  test("one bad query in a list leaves the others", () => {
    expect(holds("(orientation: landscape), (max-width: 600px)", 500)).toBe(true);
  });
});

describe("ranges", () => {
  const ranges = (...qs: string[]) => rangesOf(qs.flatMap(parseMedia));

  test("one max-width", () => {
    expect(ranges("(max-width: 600px)")).toEqual([{ min: 0, max: 600 }]);
  });

  test("two max-widths", () => {
    expect(ranges("(max-width: 600px)", "(max-width: 400px)")).toEqual([{ min: 401, max: 600 }, { min: 0, max: 400 }]);
  });

  test("mobile-first", () => {
    expect(ranges("(min-width: 600px)")).toEqual([{ min: 0, max: 599 }]);
  });

  test("a band", () => {
    expect(ranges("(min-width: 400px) and (max-width: 600px)")).toEqual([{ min: 400, max: 600 }, { min: 0, max: 399 }]);
  });

  test("neighbours every query answers alike are merged", () => {
    expect(ranges("(min-width: 400px) and (max-width: 300px)")).toEqual([{ min: 0, max: 399 }]);
    expect(ranges("(max-width: 600px)", "(max-width: 600px) and (min-width: 0)")).toEqual([{ min: 0, max: 600 }]);
  });

  test("no width queries, no ranges", () => {
    expect(ranges("(prefers-color-scheme: dark)", "print", "(orientation: landscape)")).toEqual([]);
  });
});

describe("hoverSubject", () => {
  test("shapes", () => {
    expect(hoverSubject("a:hover > b")).toBeUndefined();
    expect(hoverSubject("a > :hover")).toBe("a > *");
    expect(hoverSubject('[title=":hover"]')).toBeUndefined();
    expect(hoverSubject(":is(a b):hover")).toBe(":is(a b)");
    expect(hoverSubject("a:hover:focus")).toBeUndefined();
    expect(hoverSubject("A:HOVER")).toBe("A");
  });
});

describe("more ranges", () => {
  const ranges = (...qs: string[]) => rangesOf(qs.flatMap(parseMedia));

  test("not screen and (max-width) still has its edge", () => {
    expect(ranges("not screen and (max-width: 600px)")).toEqual([{ min: 0, max: 600 }]);
    expect(ranges("not (max-width: 600px)")).toEqual([{ min: 0, max: 600 }]);
  });

  test("a min-width nested in a max-width is its own band", () => {
    expect(ranges("(max-width: 600px)", "(min-width: 400px) and (max-width: 600px)")).toEqual([{ min: 400, max: 600 }, { min: 0, max: 399 }]);
  });

  test("range syntax and em edges", () => {
    expect(ranges("(width > 600px)")).toEqual([{ min: 0, max: 600 }]);
    expect(ranges("(min-width: 37.5em)")).toEqual([{ min: 0, max: 599 }]);
  });
});

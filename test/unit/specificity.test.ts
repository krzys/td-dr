import { describe, expect, test } from "vitest";
import { isDynamicSelector } from "../../src/style/selectors.ts";
import { compareSpecificity, specificity } from "../../src/style/specificity.ts";

describe("specificity", () => {
  const table: Array<[string, readonly [number, number, number]]> = [
    ["*", [0, 0, 0]],
    ["p", [0, 0, 1]],
    ["div p", [0, 0, 2]],
    [".a", [0, 1, 0]],
    ["p.a.b", [0, 2, 1]],
    ["#x", [1, 0, 0]],
    ["#x .a p", [1, 1, 1]],
    ['a[href^="http:,x"]', [0, 1, 1]],
    ["li:first-child", [0, 1, 1]],
    ["p::before", [0, 0, 2]],
    ["p:after", [0, 0, 2]],
    [":is(#a, .b) p", [1, 0, 1]],
    [":not(.a, #b)", [1, 0, 0]],
    [":where(#a) p", [0, 0, 1]],
    ["a:has(> img.x)", [0, 1, 2]],
    ["li:nth-child(2n+1)", [0, 1, 1]],
    ["li:nth-child(2 of .a)", [0, 2, 1]],
    ["table > tbody + tr ~ td", [0, 0, 4]],
    [".a, #b", [1, 0, 0]],
  ];
  test.each(table)("%s", (sel, expected) => {
    expect(specificity(sel)).toEqual(expected);
  });

  test("compare", () => {
    expect(compareSpecificity([1, 0, 0], [0, 9, 9])).toBeGreaterThan(0);
    expect(compareSpecificity([0, 1, 0], [0, 1, 0])).toBe(0);
  });

  test("dynamic selectors", () => {
    expect(isDynamicSelector("a:hover")).toBe(true);
    expect(isDynamicSelector("p::selection")).toBe(true);
    expect(isDynamicSelector("a:focus-within")).toBe(true);
    expect(isDynamicSelector("p:first-child")).toBe(false);
    expect(isDynamicSelector('a[title=":hover"]')).toBe(false);
  });
});

import { describe, expect, test } from "vitest";
import { evalSupports } from "../../src/style/supports.ts";

const ok = (sel: string): boolean => !sel.includes(":hover");
const run = (cond: string) => evalSupports(cond, ok);

describe("evalSupports", () => {
  test("colour functions td;dr lowers count as supported", () => {
    expect(run("(color: color-mix(in lab, red, red))")).toBe(true);
    expect(run("(color: oklch(50% 0.1 120))")).toBe(true);
    expect(run("(background-color: lab(50% 10 10))")).toBe(true);
  });

  test("layout td;dr lowers counts as supported", () => {
    expect(run("(display: flex)")).toBe(true);
    expect(run("(display:grid)")).toBe(true);
    expect(run("(gap: 1rem)")).toBe(true);
  });

  test("vendor sniffing is false", () => {
    expect(run("(-webkit-hyphens: none)")).toBe(false);
    expect(run("(-moz-orient: inline)")).toBe(false);
    expect(run("(-webkit-appearance: -apple-pay-button)")).toBe(false);
    expect(run("(appearance: -apple-pay-button)")).toBe(false);
  });

  test("not / and / or, with unknowns short-circuited", () => {
    expect(run("not (-webkit-hyphens: none)")).toBe(true);
    expect(run("(display: flex) and (gap: 0)")).toBe(true);
    expect(run("(-moz-orient: inline) and (margin-trim: inline)")).toBe(false);
    expect(run("(display: flex) or (margin-trim: inline)")).toBe(true);
    expect(run("(not (-webkit-appearance: -apple-pay-button))  or (contain-intrinsic-size: 1px)")).toBe(true);
  });

  test("Tailwind's @property fallback sniff is false", () => {
    const tw = "((-webkit-hyphens: none) and (not (margin-trim: inline))) or ((-moz-orient: inline) and (not (color:rgb(from red r g b))))";
    expect(run(tw)).toBe(false);
  });

  test("anything else is undecided", () => {
    expect(run("(margin-trim: inline)")).toBeUndefined();
    expect(run("not (margin-trim: inline)")).toBeUndefined();
    expect(run("(display: flex) and (margin-trim: inline)")).toBeUndefined();
    expect(run("font-tech(color-COLRv1)")).toBeUndefined();
  });

  test("selector() asks whether the selector can be inlined", () => {
    expect(run("selector(p > a)")).toBe(true);
    expect(run("selector(a:hover)")).toBe(false);
    expect(run("not selector(a:hover)")).toBe(true);
  });

  test("unknown functions and blocks are false, like browsers do", () => {
    expect(run("foo(bar)")).toBe(false);
    expect(run("(foo bar baz)")).toBe(false);
  });

  test("a condition that doesn't parse is null", () => {
    expect(run("display: flex")).toBeNull();
    expect(run("(display: flex) and (gap: 0) or (x: y)")).toBeNull();
    expect(run("")).toBeNull();
  });
});

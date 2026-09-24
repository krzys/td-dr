import { describe, expect, test } from "vitest";
import { nestSelector } from "../../src/style/nesting.ts";

describe("nestSelector", () => {
  test("& is replaced by the parent", () => {
    expect(nestSelector(".a", "&.b")).toBe(".a.b");
    expect(nestSelector(".a", "& .b")).toBe(".a .b");
    expect(nestSelector(".card.featured", "&[data-v-1] .title")).toBe(".card.featured[data-v-1] .title");
  });

  test("a selector without & is relative to the parent", () => {
    expect(nestSelector(".a", ".b")).toBe(".a .b");
    expect(nestSelector(".a", "> .b")).toBe(".a > .b");
    expect(nestSelector(".a", "+ p")).toBe(".a + p");
  });

  test("& anywhere counts, not only at the start", () => {
    expect(nestSelector(".a", ".x &")).toBe(".x .a");
    expect(nestSelector(".a", ":not(&) p")).toBe(":not(.a) p");
  });

  test("a complex parent is wrapped in :is() unless & leads", () => {
    expect(nestSelector(".a .b", ".x &")).toBe(".x :is(.a .b)");
    expect(nestSelector(".a > .b", "&.c")).toBe(".a > .b.c");
  });

  test("a type-selector parent after other parts is wrapped", () => {
    expect(nestSelector("div", ".x&")).toBe(".x:is(div)");
    expect(nestSelector("div", "&.x")).toBe("div.x");
  });

  test("& inside strings is left alone", () => {
    expect(nestSelector(".a", '[title="&"]')).toBe('.a [title="&"]');
    expect(nestSelector(".a", "&[title='x&y']")).toBe(".a[title='x&y']");
  });
});

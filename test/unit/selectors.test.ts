import { describe, expect, test } from "vitest";
import { classifySelector, subjectOf } from "../../src/style/selectors.ts";

describe("classifySelector", () => {
  test("plain selectors are static", () => {
    expect(classifySelector("p > a.b", false)).toBe("static");
    expect(classifySelector(":where(select:is([multiple], [size])) optgroup", false)).toBe("static");
    expect(classifySelector("p:first-child", false)).toBe("static");
  });

  test("things the email never shows are noise", () => {
    for (const s of [
      ":host",
      ":host(.x) p",
      ":-moz-focusring:where(:not(iframe))",
      ":-moz-ui-invalid",
      "::-webkit-datetime-edit-year-field",
      "input::-webkit-inner-spin-button",
      "::file-selector-button",
      "::placeholder",
      "input::placeholder",
      "::backdrop",
      "p::selection",
      "button:hover::placeholder",
    ]) {
      expect(classifySelector(s, true), s).toBe("noise");
    }
  });

  test("::before/::after are noise only without content", () => {
    expect(classifySelector("::before", false)).toBe("noise");
    expect(classifySelector("p:after", false)).toBe("noise");
    expect(classifySelector("p::before", true)).toBe("dynamic");
    expect(classifySelector("p::first-line", false)).toBe("dynamic");
  });

  test("list markers are visible, so dynamic", () => {
    expect(classifySelector("li::marker", true)).toBe("dynamic");
    expect(classifySelector("p::first-letter", true)).toBe("dynamic");
  });

  test("state pseudo-classes are dynamic", () => {
    expect(classifySelector("a:hover", false)).toBe("dynamic");
    expect(classifySelector(".x:focus-visible span", false)).toBe("dynamic");
  });

  test("quoted text doesn't count", () => {
    expect(classifySelector('a[title=":hover"]', false)).toBe("static");
    expect(classifySelector('a[title="::placeholder"]', false)).toBe("static");
  });
});

describe("subjectOf", () => {
  test("drops state and pseudo-elements, keeps the rest", () => {
    expect(subjectOf("a:hover")).toBe("a:where(*)");
    expect(subjectOf(".x > :focus span")).toBe(".x > :where(*) span");
    expect(subjectOf("p::before")).toBe("p:where(*)");
    expect(subjectOf('a[title=":hover"]:hover')).toBe('a[title=":hover"]:where(*)');
  });
});

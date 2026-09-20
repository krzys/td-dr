import { describe, expect, it, test } from "vitest";
import {
  ALL_FEATURE_SLUGS,
  featuresFor,
  featuresForAtRule,
  featuresForSelector,
} from "../../../src/targets/features.ts";
import data from "../../../src/targets/data/caniemail.json" with { type: "json" };

const slugs = new Set(data.data.map((f: { slug: string }) => f.slug));

describe("features", () => {
  it("only references slugs that exist in the vendored data", () => {
    expect(ALL_FEATURE_SLUGS.length).toBeGreaterThan(30);
    for (const s of ALL_FEATURE_SLUGS) expect(slugs.has(s), s).toBe(true);
  });

  it.each([
    ["background-color", "#fff", ["css-background-color"]],
    ["background-image", "url(a.png)", ["css-background-image"]],
    ["background-image", "linear-gradient(red, blue)", ["css-background-image", "css-linear-gradient"]],
    ["background", "radial-gradient(red, blue)", ["css-background", "css-radial-gradient"]],
    ["border-top-left-radius", "4px", ["css-border-radius"]],
    ["box-shadow", "0 0 3px #000", ["css-box-shadow"]],
    ["max-width", "600px", ["css-max-width"]],
    ["padding-left", "8px", ["css-padding"]],
    ["margin-bottom", "8px", ["css-margin"]],
    ["display", "flex", ["css-display-flex"]],
    ["display", "inline-flex", ["css-display-flex"]],
    ["display", "none", ["css-display-none"]],
    ["display", "block", []],
    ["position", "absolute", ["css-position"]],
    ["position", "static", []],
    ["line-height", "1.4", ["css-line-height"]],
    ["color", "var(--x)", ["css-variables"]],
    ["color", "rgba(0,0,0,.5)", ["css-rgba"]],
    ["font-size", "1.2rem", ["css-unit-rem"]],
    ["font-size", "1.2em", ["css-unit-em"]],
    ["color", "red !important", ["css-important"]],
    ["unknown-prop", "x", []],
  ])("%s: %s", (prop, value, expected) => {
    expect(featuresFor(prop, value)).toEqual(expected);
  });

  it("maps at-rules and selectors", () => {
    expect(featuresForAtRule("media")).toEqual(["css-at-media"]);
    expect(featuresForAtRule("@MEDIA")).toEqual(["css-at-media"]);
    expect(featuresForAtRule("charset")).toEqual([]);
    expect(featuresForSelector("a:hover")).toEqual(["css-pseudo-class-hover"]);
    expect(featuresForSelector("p::before")).toEqual(["css-pseudo-element-before"]);
    expect(featuresForSelector("td")).toEqual([]);
  });
});

describe("fix round 1 features", () => {
  it("does not add plain focus for prefixed pseudo-classes", () => {
    expect(featuresForSelector("a:focus-within")).toEqual(["css-pseudo-class-focus-within"]);
    expect(featuresForSelector("a:focus-visible")).toEqual(["css-pseudo-class-focus-visible"]);
    expect(featuresForSelector("a:focus")).toEqual(["css-pseudo-class-focus"]);
    expect(featuresForSelector("li:first-of-type")).toEqual(["css-pseudo-class-first-of-type"]);
    expect(featuresForSelector("input::placeholder")).toEqual(["css-pseudo-element-placeholder"]);
  });
  it("maps animation/transition/gap/flex longhands", () => {
    expect(featuresFor("animation-name", "spin")).toEqual(["css-animation"]);
    expect(featuresFor("transition-property", "opacity")).toEqual(["css-transition"]);
    expect(featuresFor("row-gap", "4px")).toEqual(["css-gap"]);
    expect(featuresFor("flex-direction", "row")).toEqual(["css-flex-direction"]);
    expect(featuresFor("flex-wrap", "wrap")).toEqual(["css-flex-wrap"]);
  });
});

describe("fix round 2 features", () => {
  it.each([
    ["background-image", "none"],
    ["background", "#fff"],
    ["transform", "none"],
    ["box-shadow", "none"],
    ["text-shadow", "none"],
    ["text-decoration", "none"],
    ["animation-name", "none"],
    ["transition-property", "none"],
    ["transition", "none"],
    ["position", ""],
    ["position", "inherit"],
  ])("%s: %s maps to no unsupported slug", (prop, value) => {
    const out = featuresFor(prop, value);
    expect(out.filter((s) => s !== "css-background")).toEqual([]);
  });

  it("background-image url maps to the slug", () => {
    expect(featuresFor("background-image", "url(a.png)")).toEqual(["css-background-image"]);
  });

  it.each([
    ["background-color", "css-background-color"],
    ["background", "css-background"],
    ["border-radius", "css-border-radius"],
    ["border-top-left-radius", "css-border-radius"],
    ["border-top-right-radius", "css-border-radius"],
    ["border-bottom-left-radius", "css-border-radius"],
    ["border-bottom-right-radius", "css-border-radius"],
    ["box-shadow", "css-box-shadow", "0 0 2px #000"],
    ["opacity", "css-opacity"],
    ["width", "css-width"],
    ["height", "css-height"],
    ["max-width", "css-max-width"],
    ["min-width", "css-min-width"],
    ["max-height", "css-max-height"],
    ["min-height", "css-min-height"],
    ["padding", "css-padding"],
    ["padding-top", "css-padding"],
    ["padding-right", "css-padding"],
    ["padding-bottom", "css-padding"],
    ["padding-left", "css-padding"],
    ["margin", "css-margin"],
    ["margin-top", "css-margin"],
    ["margin-right", "css-margin"],
    ["margin-bottom", "css-margin"],
    ["margin-left", "css-margin"],
    ["top", "css-left-right-top-bottom"],
    ["right", "css-left-right-top-bottom"],
    ["bottom", "css-left-right-top-bottom"],
    ["left", "css-left-right-top-bottom"],
    ["text-transform", "css-text-transform"],
    ["letter-spacing", "css-letter-spacing"],
    ["line-height", "css-line-height"],
    ["font-weight", "css-font-weight"],
    ["text-decoration", "css-text-decoration", "underline"],
    ["text-decoration-line", "css-text-decoration-line", "underline"],
    ["text-decoration-color", "css-text-decoration-color"],
    ["text-decoration-style", "css-text-decoration-style"],
    ["text-decoration-thickness", "css-text-decoration-thickness"],
    ["text-shadow", "css-text-shadow", "1px 1px #000"],
    ["transform", "css-transform", "rotate(1deg)"],
    ["animation", "css-animation", "spin 1s"],
    ["animation-name", "css-animation", "spin"],
    ["animation-duration", "css-animation"],
    ["animation-timing-function", "css-animation"],
    ["animation-delay", "css-animation"],
    ["animation-iteration-count", "css-animation"],
    ["animation-direction", "css-animation"],
    ["animation-fill-mode", "css-animation"],
    ["animation-play-state", "css-animation"],
    ["transition", "css-transition", "all 1s"],
    ["transition-property", "css-transition", "opacity"],
    ["transition-duration", "css-transition"],
    ["transition-timing-function", "css-transition"],
    ["transition-delay", "css-transition"],
    ["gap", "css-gap"],
    ["row-gap", "css-gap"],
    ["column-gap", "css-gap"],
    ["flex-direction", "css-flex-direction"],
    ["flex-wrap", "css-flex-wrap"],
  ] as Array<[string, string, string?]>)("BY_PROP %s -> %s", (prop, slug, value = "1px") => {
    expect(featuresFor(prop, value)).toContain(slug);
  });
});

describe("!important is a flag, not part of the value", () => {
  test.each([
    ["box-shadow", "none !important", ["css-important"]],
    ["text-decoration", "none !important", ["css-important"]],
    ["transform", "none !important", ["css-important"]],
  ])("%s: %s", (p: string, v: string, want: string[]) => expect(featuresFor(p, v).sort()).toEqual(want));
  test("the property still maps", () => expect(featuresFor("display", "flex !important")).toEqual(expect.arrayContaining(["css-display-flex", "css-important"])));
});

describe("alpha colours", () => {
  test("the slash syntax counts as rgba", () => {
    expect(featuresFor("color", "rgb(0 0 0 / 50%)")).toContain("css-rgba");
    expect(featuresFor("color", "rgb(0 0 0)")).not.toContain("css-rgba");
  });
  test("transition isn't an animation", () => {
    expect(featuresFor("transition", "opacity 1s")).toEqual(["css-transition"]);
  });
});

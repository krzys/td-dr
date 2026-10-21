import { describe, expect, it, test } from "vitest";
import {
  ALL_FEATURE_SLUGS,
  ALL_IMAGE_SLUGS,
  ALL_TAG_SLUGS,
  featuresFor,
  featuresForAtRule,
  featuresForImage,
  featuresForSelector,
  featuresForTag,
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

// css-* slugs no table returns, on purpose. Anything else in the data must be mapped.
const SELECTOR_SYNTAX = "selectors are matched and inlined (style/match.ts); the head rules kept are enhancement over those inline styles";
const MEDIA_FEATURE = "@media is resolved by style/media.ts, which reports the queries it drops; the ones kept are enhancement";
const EXCLUDED: Readonly<Record<string, string>> = {
  "css-comments": "stylesheets are parsed and rewritten: comments never reach the output",
  "css-unit-px": "the unit everything lowers to, supported everywhere",
  "css-unit-percent": "supported everywhere; would tag most declarations",
  "css-font-size": "its one caveat is rem, which css-unit-rem reports",
  "css-inert-attribute": "an HTML attribute, not CSS; email has nothing to focus but links",
  "css-selector-adjacent-sibling": SELECTOR_SYNTAX,
  "css-selector-chaining": SELECTOR_SYNTAX,
  "css-selector-child": SELECTOR_SYNTAX,
  "css-selector-class": SELECTOR_SYNTAX,
  "css-selector-descendant": SELECTOR_SYNTAX,
  "css-selector-general-sibling": SELECTOR_SYNTAX,
  "css-selector-grouping": SELECTOR_SYNTAX,
  "css-selector-id": SELECTOR_SYNTAX,
  "css-selector-type": SELECTOR_SYNTAX,
  "css-selector-universal": SELECTOR_SYNTAX,
  "css-at-media-device-pixel-ratio": MEDIA_FEATURE,
  "css-at-media-hover": MEDIA_FEATURE,
  "css-at-media-orientation": MEDIA_FEATURE,
  "css-at-media-prefers-color-scheme": MEDIA_FEATURE,
  "css-at-media-prefers-reduced-motion": MEDIA_FEATURE,
};

describe("coverage of the vendored data", () => {
  const mapped = new Set(ALL_FEATURE_SLUGS);
  const css = [...slugs].filter((s) => s.startsWith("css-"));

  it("maps every css slug or excludes it with a reason", () => {
    expect(css.filter((s) => !mapped.has(s) && !(s in EXCLUDED))).toEqual([]);
  });
  it("excludes only slugs that exist and aren't mapped", () => {
    for (const [s, why] of Object.entries(EXCLUDED)) {
      expect(slugs.has(s), s).toBe(true);
      expect(mapped.has(s), s).toBe(false);
      expect(why.length, s).toBeGreaterThan(10);
    }
  });
  it("maps every image slug or excludes it with a reason", () => {
    const images = new Set(ALL_IMAGE_SLUGS);
    const why: Readonly<Record<string, string>> = { "image-base64": "an encoding, not a format: a data: URI maps to its format's slug" };
    expect([...slugs].filter((s) => s.startsWith("image-") && !images.has(s) && !(s in why))).toEqual([]);
  });
  it("image and tag tables only use slugs that exist", () => {
    for (const s of [...ALL_IMAGE_SLUGS, ...ALL_TAG_SLUGS]) expect(slugs.has(s), s).toBe(true);
  });
});

describe("curated mappings", () => {
  it.each([
    ["text-wrap", "balance", ["css-text-wrap"]],
    ["text-underline-offset", "3px", ["css-text-underline-offset"]],
    ["writing-mode", "vertical-rl", ["css-writing-mode"]],
    ["text-emphasis", "dot", ["css-text-emphasis"]],
    ["list-style-image", "url(dot.png)", ["css-list-style-image"]],
    ["list-style-image", "none", []],
    ["list-style", "square url(dot.png)", ["css-list-style", "css-list-style-image"]],
    ["border-spacing", "4px", ["css-border-spacing"]],
    ["border-spacing", "0", []],
    ["border-spacing", "0 0", []],
    ["white-space", "pre", ["css-white-space"]],
    ["white-space", "normal", []],
    ["white-space", "nowrap", []],
    ["visibility", "hidden", ["css-visibility"]],
    ["visibility", "visible", []],
    ["clip-path", "circle(50%)", ["css-clip-path"]],
    ["clip-path", "none", []],
    ["column-count", "2", ["css-column-count", "css-column-layout-properties"]],
    ["inline-size", "10px", ["css-block-inline-size", "css-inline-size"]],
    ["z-index", "2", ["css-z-index"]],
    ["z-index", "auto", []],
    ["overflow-wrap", "anywhere", ["css-overflow-wrap"]],
    ["word-wrap", "break-word", ["css-word-wrap"]],
    ["font-family", "system-ui, sans-serif", ["css-sytem-ui"]],
    ["font-family", "Arial, sans-serif", []],
    ["font-family", "Inter, ui-sans-serif", ["css-sytem-ui"]],
    ["font-family", '"ui-rounded Pro", Arial', []],
    ["font-family", '"system-ui", Arial', []],
    ["display", "flow-root", ["css-display"]],
    ["display", "inline flex", ["css-display-flex", "css-display"]],
    ["border-top-width", "2px", ["css-border"]],
    ["color", "light-dark(#000, #fff)", ["css-function-light-dark"]],
    ["width", "30ch", ["css-width", "css-unit-ch"]],
    ["width", "min(100%, 600px)", ["css-width", "css-function-min"]],
    ["grid-template-columns", "minmax(0, 1fr)", ["css-grid-template"]],
    ["width", "fit-content", ["css-width", "css-intrinsic-size"]],
    ["color", "oklch(70% 0.1 200)", ["css-modern-color"]],
    ["color", "rgb(0 128 0)", ["css-rgb"]],
    ["font-size", "12pt", ["css-unit-pt"]],
    ["color", "initial", ["css-unit-initial"]],
  ])("%s: %s", (prop, value, expected) => {
    expect(featuresFor(prop, value).sort()).toEqual([...expected].sort());
  });

  it.each([
    ["li:nth-last-child(2)", ["css-pseudo-class-nth-last-child"]],
    ["li:nth-last-of-type(2)", ["css-pseudo-class-nth-last-of-type"]],
    ["p:only-of-type", ["css-pseudo-class-only-of-type"]],
    ["div:has(> img)", ["css-pseudo-class-has"]],
    ["p:lang(fr)", ["css-pseudo-class-lang"]],
    ["& .x", ["css-nesting"]],
    ["[data-x] > &", ["css-selector-attribute", "css-nesting"]],
    ['a[href*="&utm"]', ["css-selector-attribute"]],
  ])("selector %s", (s, expected) => {
    expect(featuresForSelector(s)).toEqual(expected);
  });

  it.each([
    ["https://img.test/a.webp", ["image-webp"]],
    ["https://img.test/a.AVIF?w=600", ["image-avif"]],
    ["logo.svg#x", ["image-svg"]],
    ["data:image/svg+xml;utf8,<svg/>", ["image-svg"]],
    ["data:image/png;base64,AAAA", ["image-png"]],
    ["https://img.test/photo.jpeg", ["image-jpg"]],
    ["https://img.test/photo.jfif", ["image-jpg"]],
    ["data:image/pjpeg;base64,AAAA", ["image-jpg"]],
    ["data:image/x-png;base64,AAAA", ["image-png"]],
    ["https://img.test/{{brand.logo}}", []],
    ["https://img.test/render?id=3", []],
  ])("image %s", (src, expected) => {
    expect(featuresForImage(src)).toEqual(expected);
  });

  it.each([
    ["progress", ["html-progress"]],
    ["MARQUEE", ["html-marquee"]],
    ["ol", ["html-lists"]],
    ["mark", ["html-semantics"]],
    ["details", []],
    ["video", []],
    ["x-widget", []],
  ])("tag %s", (tag, expected) => {
    expect(featuresForTag(tag)).toEqual(expected);
  });
});

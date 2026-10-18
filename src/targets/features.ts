// CSS longhand/value/at-rule/selector -> caniemail slugs. Explicit on purpose:
// slugs don't line up 1:1 with property names (see docs/support.md#targets-and-client-data).

const alias = (slug: string, props: string[]): Array<[string, string[]]> => props.map((p) => [p, [slug]]);

// property -> slugs it always maps to
const BY_PROP: Record<string, string[]> = Object.fromEntries([
  ...alias("css-background-color", ["background-color"]),
  ...alias("css-background", ["background"]),
  ...alias("css-border-radius", [
    "border-radius",
    "border-top-left-radius",
    "border-top-right-radius",
    "border-bottom-left-radius",
    "border-bottom-right-radius",
  ]),
  ...alias("css-box-shadow", ["box-shadow"]),
  ...alias("css-opacity", ["opacity"]),
  ...alias("css-width", ["width"]),
  ...alias("css-height", ["height"]),
  ...alias("css-max-width", ["max-width"]),
  ...alias("css-min-width", ["min-width"]),
  ...alias("css-max-height", ["max-height"]),
  ...alias("css-min-height", ["min-height"]),
  ...alias("css-padding", ["padding", "padding-top", "padding-right", "padding-bottom", "padding-left"]),
  ...alias("css-margin", ["margin", "margin-top", "margin-right", "margin-bottom", "margin-left"]),
  ...alias("css-left-right-top-bottom", ["top", "right", "bottom", "left"]),
  ...alias("css-text-transform", ["text-transform"]),
  ...alias("css-letter-spacing", ["letter-spacing"]),
  ...alias("css-line-height", ["line-height"]),
  ...alias("css-font-weight", ["font-weight"]),
  ...alias("css-text-decoration", ["text-decoration"]),
  ...alias("css-text-decoration-line", ["text-decoration-line"]),
  ...alias("css-text-decoration-color", ["text-decoration-color"]),
  ...alias("css-text-decoration-style", ["text-decoration-style"]),
  ...alias("css-text-decoration-thickness", ["text-decoration-thickness"]),
  ...alias("css-text-shadow", ["text-shadow"]),
  ...alias("css-transform", ["transform"]),
  // caniemail has no per-longhand animation/transition slugs
  ...alias("css-animation", [
    "animation",
    "animation-name",
    "animation-duration",
    "animation-timing-function",
    "animation-delay",
    "animation-iteration-count",
    "animation-direction",
    "animation-fill-mode",
    "animation-play-state",
  ]),
  ...alias("css-transition", [
    "transition",
    "transition-property",
    "transition-duration",
    "transition-timing-function",
    "transition-delay",
  ]),
  ...alias("css-gap", ["gap", "row-gap", "column-gap"]),
  ...alias("css-flex-direction", ["flex-direction"]),
  ...alias("css-flex-wrap", ["flex-wrap"]),
]);

// property -> [value pattern, slug] for properties where only some values matter
const BY_VALUE: Record<string, Array<[RegExp, string]>> = {
  display: [
    [/^(inline-)?flex\b/i, "css-display-flex"],
    [/^(inline-)?grid\b/i, "css-display-grid"],
    [/^none\b/i, "css-display-none"],
  ],
  position: [[/^(relative|absolute|fixed|sticky)\b/i, "css-position"]],
  "background-image": [[/\burl\(|-gradient\(/i, "css-background-image"]],
};

const GRADIENTS: Array<[RegExp, string]> = [
  [/\blinear-gradient\(/i, "css-linear-gradient"],
  [/\bradial-gradient\(/i, "css-radial-gradient"],
  [/\bconic-gradient\(/i, "css-conic-gradient"],
];
const GRADIENT_PROPS = new Set(["background", "background-image"]);

// patterns that apply to any property's value
const ANY_VALUE: Array<[RegExp, string]> = [
  [/\bvar\(/i, "css-variables"],
  [/\b(rgba|hsla)\(|\b(rgb|hsl)\([^)]*\//i, "css-rgba"], // rgb(0 0 0 / 50%) has alpha too
  [/\bcalc\(/i, "css-unit-calc"],
  [/(?:^|[\s(,])-?[\d.]+rem\b/i, "css-unit-rem"],
  [/(?:^|[\s(,])-?[\d.]+em\b/i, "css-unit-em"],
];

// no-op values: these props only count as used when set to something other than none/initial
const NOOP_PROPS = new Set([
  "box-shadow",
  "text-shadow",
  "transform",
  "text-decoration",
  "text-decoration-line",
  "animation",
  "animation-name",
  "transition",
  "transition-property",
]);
const NOOP_VALUE = /^(none|initial|inherit|unset|revert)$/i;

// NOTE: the cascade keeps `!important` as a separate flag and strips it from the
// value, so callers must pass `${value} !important` for css-important to fire.
export const featuresFor = (prop: string, value: string): string[] => {
  const p = prop.trim().toLowerCase();
  const important = /!\s*important\s*$/i.test(value);
  const v = value.replace(/!\s*important\s*$/i, "").trim();
  const out = new Set<string>(NOOP_PROPS.has(p) && NOOP_VALUE.test(v) ? [] : BY_PROP[p]);
  if (important) out.add("css-important");
  for (const [re, slug] of BY_VALUE[p] ?? []) if (re.test(v)) out.add(slug);
  if (GRADIENT_PROPS.has(p)) {
    for (const [re, slug] of GRADIENTS) if (re.test(v)) out.add(slug);
  }
  for (const [re, slug] of ANY_VALUE) if (re.test(v)) out.add(slug);
  return [...out];
};

const AT_RULES: Record<string, string> = {
  media: "css-at-media",
  "font-face": "css-at-font-face",
  import: "css-at-import",
  keyframes: "css-at-keyframes",
  supports: "css-at-supports",
};

export const featuresForAtRule = (name: string): string[] => {
  const slug = AT_RULES[name.trim().replace(/^@/, "").replace(/^-\w+-/, "").toLowerCase()];
  return slug ? [slug] : [];
};

const NOT_IDENT = "(?![\\w-])";
const sel = (re: string, slug: string): [RegExp, string] => [new RegExp(re + NOT_IDENT, "i"), slug];
const SELECTORS: Array<[RegExp, string]> = [
  sel(":hover", "css-pseudo-class-hover"),
  sel(":active", "css-pseudo-class-active"),
  sel(":focus", "css-pseudo-class-focus"),
  sel(":focus-within", "css-pseudo-class-focus-within"),
  sel(":focus-visible", "css-pseudo-class-focus-visible"),
  sel(":visited", "css-pseudo-class-visited"),
  sel(":checked", "css-pseudo-class-checked"),
  sel(":target", "css-pseudo-class-target"),
  sel(":link", "css-pseudo-class-link"),
  sel(":first-child", "css-pseudo-class-first-child"),
  sel(":last-child", "css-pseudo-class-last-child"),
  sel(":only-child", "css-pseudo-class-only-child"),
  sel(":first-of-type", "css-pseudo-class-first-of-type"),
  sel(":last-of-type", "css-pseudo-class-last-of-type"),
  sel(":nth-of-type(?=\\()", "css-pseudo-class-nth-of-type"),
  sel(":nth-child(?=\\()", "css-pseudo-class-nth-child"),
  [/:not\(/i, "css-pseudo-class-not"],
  sel("::?before", "css-pseudo-element-before"),
  sel("::?after", "css-pseudo-element-after"),
  sel("::?first-line", "css-pseudo-element-first-line"),
  sel("::?first-letter", "css-pseudo-element-first-letter"),
  sel("::placeholder", "css-pseudo-element-placeholder"),
  sel("::marker", "css-pseudo-element-marker"),
  [/\[[^\]]+\]/, "css-selector-attribute"],
];

export const featuresForSelector = (sel: string): string[] =>
  SELECTORS.filter(([re]) => re.test(sel)).map(([, slug]) => slug);

// every slug the tables can return, for the "exists in the data" test
export const ALL_FEATURE_SLUGS: string[] = [
  ...new Set([
    ...Object.values(BY_PROP).flat(),
    ...Object.values(BY_VALUE).flatMap((t) => t.map(([, s]) => s)),
    ...GRADIENTS.map(([, s]) => s),
    ...ANY_VALUE.map(([, s]) => s),
    ...Object.values(AT_RULES),
    ...SELECTORS.map(([, s]) => s),
  ]),
];

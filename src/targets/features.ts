// CSS longhand/value/at-rule/selector -> caniemail slugs. Explicit on purpose:
// slugs don't line up 1:1 with property names (see docs/support.md#targets-and-client-data).

const alias = (slug: string, props: string[]): Array<[string, string[]]> => props.map((p) => [p, [slug]]);
// a property can stand for more than one slug (column-count, inline-size)
const merge = (entries: Array<[string, string[]]>): Record<string, string[]> => {
  const out: Record<string, string[]> = {};
  for (const [p, slugs] of entries) out[p] = [...(out[p] ?? []), ...slugs];
  return out;
};

// property -> slugs it always maps to
const BY_PROP: Record<string, string[]> = merge([
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
  // lowered by the layout IR on input; mapped so the self-lint catches a leak
  ...alias("css-align-items", ["align-items"]),
  ...alias("css-justify-content", ["justify-content"]),
  ...alias("css-grid-template", ["grid-template", "grid-template-areas", "grid-template-columns", "grid-template-rows"]),
  ...alias("css-box-sizing", ["box-sizing"]),
  ...alias("css-float", ["float"]),
  ...alias("css-clear", ["clear"]),
  // logical properties: the cascade renames them to physical ones (style/shorthands.ts)
  ...alias("css-block-inline-size", ["block-size", "inline-size"]),
  ...alias("css-inline-size", ["inline-size"]),
  ...alias("css-max-block-size", ["max-block-size"]),
  ...alias("css-max-inline-size", ["max-inline-size"]),
  ...alias("css-min-block-size", ["min-block-size"]),
  ...alias("css-min-inline-size", ["min-inline-size"]),
  ...alias("css-margin-inline-block", ["margin-inline", "margin-block"]),
  ...alias("css-margin-block-start-end", ["margin-block-start", "margin-block-end"]),
  ...alias("css-margin-inline-start-end", ["margin-inline-start", "margin-inline-end"]),
  ...alias("css-padding-inline-block", ["padding-inline", "padding-block"]),
  ...alias("css-padding-block-start-end", ["padding-block-start", "padding-block-end"]),
  ...alias("css-padding-inline-start-end", ["padding-inline-start", "padding-inline-end"]),
  ...alias("css-inset", ["inset", "inset-block", "inset-inline", "inset-block-start", "inset-block-end", "inset-inline-start", "inset-inline-end"]),
  ...alias("css-border-inline-block", ["border-inline", "border-block"]),
  ...alias("css-border-inline-block-individual", [
    ...["inline", "block"].flatMap((a) => ["color", "style", "width", "start", "end"].map((x) => `border-${a}-${x}`)),
  ]),
  ...alias("css-border-inline-block-longhand", [
    ...["inline", "block"].flatMap((a) => ["start", "end"].flatMap((e) => ["color", "style", "width"].map((x) => `border-${a}-${e}-${x}`))),
  ]),
  ...alias("css-border-radius-logical", ["start-start", "start-end", "end-start", "end-end"].map((c) => `border-${c}-radius`)),
  // box
  ...alias("css-border", [
    "border",
    ...["width", "style", "color"].map((x) => `border-${x}`),
    ...["top", "right", "bottom", "left"].flatMap((s) => [`border-${s}`, ...["width", "style", "color"].map((x) => `border-${s}-${x}`)]),
  ]),
  ...alias("css-border-image", ["border-image", ...["source", "slice", "width", "outset", "repeat"].map((x) => `border-image-${x}`)]),
  ...alias("css-border-collapse", ["border-collapse"]),
  ...alias("css-border-spacing", ["border-spacing"]),
  ...alias("css-outline", ["outline", "outline-width", "outline-style", "outline-color"]),
  ...alias("css-outline-offset", ["outline-offset"]),
  ...alias("css-overflow", ["overflow", "overflow-x", "overflow-y", "overflow-block", "overflow-inline"]),
  ...alias("css-aspect-ratio", ["aspect-ratio"]),
  ...alias("css-object-fit", ["object-fit"]),
  ...alias("css-object-position", ["object-position"]),
  ...alias("css-z-index", ["z-index"]),
  ...alias("css-visibility", ["visibility"]),
  ...alias("css-clip-path", ["clip-path", "-webkit-clip-path"]),
  ...alias("css-mask-image", ["mask", "mask-image", "-webkit-mask", "-webkit-mask-image"]),
  ...alias("css-shape-outside", ["shape-outside"]),
  ...alias("css-shape-margin", ["shape-margin"]),
  ...alias("css-resize", ["resize"]),
  ...alias("css-scroll-snap", ["scroll-snap-type", "scroll-snap-align", "scroll-snap-stop"]),
  ...alias("css-table-layout", ["table-layout"]),
  ...alias("css-caption-side", ["caption-side"]),
  ...alias("css-empty-cells", ["empty-cells"]),
  // background longhands (the shorthand expands into them)
  ...alias("css-background-position", ["background-position", "background-position-x", "background-position-y"]),
  ...alias("css-background-repeat", ["background-repeat"]),
  ...alias("css-background-size", ["background-size"]),
  ...alias("css-background-clip", ["background-clip", "-webkit-background-clip"]),
  ...alias("css-background-origin", ["background-origin"]),
  ...alias("css-background-blend-mode", ["background-blend-mode"]),
  // paint and effects
  ...alias("css-filter", ["filter"]),
  ...alias("css-backdrop-filter", ["backdrop-filter", "-webkit-backdrop-filter"]),
  ...alias("css-mix-blend-mode", ["mix-blend-mode"]),
  ...alias("css-accent-color", ["accent-color"]),
  ...alias("css-color-scheme", ["color-scheme"]),
  ...alias("css-cursor", ["cursor"]),
  ...alias("css-user-select", ["user-select", "-webkit-user-select"]),
  // text
  ...alias("css-font", ["font"]),
  ...alias("css-font-kerning", ["font-kerning"]),
  ...alias("css-font-size-adjust", ["font-size-adjust"]),
  ...alias("css-font-stretch", ["font-stretch", "font-width"]),
  ...alias("css-text-align", ["text-align"]),
  ...alias("css-text-align-last", ["text-align-last"]),
  ...alias("css-text-indent", ["text-indent"]),
  ...alias("css-text-justify", ["text-justify"]),
  ...alias("css-text-overflow", ["text-overflow"]),
  ...alias("css-text-wrap", ["text-wrap", "text-wrap-mode", "text-wrap-style"]),
  ...alias("css-text-underline-offset", ["text-underline-offset"]),
  ...alias("css-text-underline-position", ["text-underline-position"]),
  ...alias("css-text-decoration-skip-ink", ["text-decoration-skip-ink"]),
  ...alias("css-text-emphasis", ["text-emphasis", "text-emphasis-style", "text-emphasis-color"]),
  ...alias("css-text-emphasis-position", ["text-emphasis-position"]),
  ...alias("css-text-orientation", ["text-orientation"]),
  ...alias("css-writing-mode", ["writing-mode"]),
  ...alias("css-direction", ["direction"]),
  ...alias("css-vertical-align", ["vertical-align"]),
  ...alias("css-white-space", ["white-space"]),
  ...alias("css-white-space-collapse", ["white-space-collapse"]),
  ...alias("css-word-break", ["word-break"]),
  ...alias("css-word-spacing", ["word-spacing"]),
  ...alias("css-word-wrap", ["word-wrap"]),
  ...alias("css-overflow-wrap", ["overflow-wrap"]),
  ...alias("css-hyphens", ["hyphens", "-webkit-hyphens"]),
  ...alias("css-hyphenate-character", ["hyphenate-character", "-webkit-hyphenate-character"]),
  ...alias("css-hyphenate-limit-chars", ["hyphenate-limit-chars"]),
  ...alias("css-tab-size", ["tab-size"]),
  ...alias("css-orphans", ["orphans"]),
  ...alias("css-widows", ["widows"]),
  ...alias("css-column-count", ["column-count"]),
  ...alias("css-column-layout-properties", [
    "columns",
    "column-count",
    "column-fill",
    "column-rule",
    "column-rule-color",
    "column-rule-style",
    "column-rule-width",
    "column-span",
    "column-width",
  ]),
  ...alias("css-list-style", ["list-style"]),
  ...alias("css-list-style-type", ["list-style-type"]),
  ...alias("css-list-style-position", ["list-style-position"]),
  ...alias("css-list-style-image", ["list-style-image"]),
]);

// property -> [value pattern, slug] for properties where only some values matter
const BY_VALUE: Record<string, Array<[RegExp, string]>> = {
  display: [
    [/^(inline[-\s])?flex\b/i, "css-display-flex"],
    [/^(inline[-\s])?grid\b/i, "css-display-grid"],
    [/^none\b/i, "css-display-none"],
    // the values caniemail's partial notes name; block/inline-block/table are fine everywhere
    [/^(flow-root|contents|revert|unset)$|^(inline|block|run-in)\s/i, "css-display"],
  ],
  position: [[/^(relative|absolute|fixed|sticky)\b/i, "css-position"]],
  "background-image": [[/\burl\(|-gradient\(/i, "css-background-image"]],
  "list-style": [[/\burl\(/i, "css-list-style-image"]],
  // the generic keyword, a whole item of the list: "ui-rounded Pro" is a family name
  "font-family": [[/(?:^|,)\s*(system-ui|ui-(serif|sans-serif|monospace|rounded))\s*(?:,|$)/i, "css-sytem-ui"]],
};

const GRADIENTS: Array<[RegExp, string]> = [
  [/\blinear-gradient\(/i, "css-linear-gradient"],
  [/\bradial-gradient\(/i, "css-radial-gradient"],
  [/\bconic-gradient\(/i, "css-conic-gradient"],
];
const GRADIENT_PROPS = new Set(["background", "background-image"]);

const unit = (u: string): RegExp => new RegExp(`(?:^|[\\s(,])-?[\\d.]+${u}\\b`, "i");
const fn = (name: string): RegExp => new RegExp(`(?<![\\w-])${name}\\(`, "i");

// patterns that apply to any property's value
const ANY_VALUE: Array<[RegExp, string]> = [
  [/\bvar\(/i, "css-variables"],
  [/\b(rgba|hsla)\(|\b(rgb|hsl)\([^)]*\//i, "css-rgba"], // rgb(0 0 0 / 50%) has alpha too
  [fn("rgb"), "css-rgb"],
  [fn("(ok)?(lch|lab)"), "css-modern-color"],
  [fn("light-dark"), "css-function-light-dark"],
  [/\bcalc\(/i, "css-unit-calc"],
  [fn("clamp"), "css-function-clamp"],
  [fn("min"), "css-function-min"],
  [fn("max"), "css-function-max"],
  [/(?<![\w-])(fit|min|max)-content\b/i, "css-intrinsic-size"],
  [/^initial$/i, "css-unit-initial"],
  [unit("rem"), "css-unit-rem"],
  [unit("em"), "css-unit-em"],
  [unit("ch"), "css-unit-ch"],
  [unit("ex"), "css-unit-ex"],
  [unit("vw"), "css-unit-vw"],
  [unit("vh"), "css-unit-vh"],
  [unit("vmin"), "css-unit-vmin"],
  [unit("vmax"), "css-unit-vmax"],
  [unit("pt"), "css-unit-pt"],
  [unit("pc"), "css-unit-pc"],
  [unit("in"), "css-unit-in"],
  [unit("cm"), "css-unit-cm"],
  [unit("mm"), "css-unit-mm"],
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

// the value that leaves the feature off (its initial value, or the usual reset): `white-space: normal`
// is no use of white-space. Global keywords count too, like for NOOP_PROPS.
const OFF_VALUES: Array<[string, string[]]> = [
  ["none", ["list-style-image", "clip-path", "-webkit-clip-path", "filter", "backdrop-filter", "-webkit-backdrop-filter", "mask", "mask-image", "-webkit-mask", "-webkit-mask-image", "shape-outside", "resize", "scroll-snap-type", "scroll-snap-align", "border-image", "border-image-source", "float", "clear", "font-size-adjust", "text-emphasis", "text-emphasis-style", "column-span", "column-rule", "column-rule-style", "user-select", "-webkit-user-select"]],
  ["normal", ["white-space", "word-break", "word-spacing", "overflow-wrap", "word-wrap", "mix-blend-mode", "background-blend-mode", "color-scheme", "font-stretch", "font-width"]],
  ["auto", ["z-index", "cursor", "table-layout", "aspect-ratio", "accent-color", "user-select", "-webkit-user-select", "font-kerning", "text-underline-offset", "text-underline-position", "text-decoration-skip-ink", "text-align-last", "text-justify", "text-wrap-style", "hyphenate-character", "-webkit-hyphenate-character", "hyphenate-limit-chars", "columns", "column-count", "column-width", "inset", "background-size", "scroll-snap-stop"]],
  ["visible", ["visibility", "overflow", "overflow-x", "overflow-y", "overflow-block", "overflow-inline"]],
  ["0(px)?", ["text-indent", "outline-offset", "shape-margin", "word-spacing"]],
  ["0(px)?( 0(px)?)?", ["border-spacing"]],
  ["none|0(px)?|0(px)? none|none 0(px)?", ["outline", "outline-style", "outline-width"]],
  ["manual", ["hyphens", "-webkit-hyphens"]],
  ["wrap", ["text-wrap", "text-wrap-mode"]],
  ["clip", ["text-overflow"]],
  ["outside", ["list-style-position"]],
  ["horizontal-tb", ["writing-mode"]],
  ["mixed", ["text-orientation"]],
  ["top", ["caption-side"]],
  ["show", ["empty-cells"]],
  ["fill", ["object-fit"]],
  ["50% 50%|center( center)?", ["object-position"]],
  ["8", ["tab-size"]],
  ["2", ["orphans", "widows"]],
  ["collapse", ["white-space-collapse"]],
  ["content-box", ["box-sizing"]],
  // not off, but nothing to lose: where nowrap is ignored the line wraps like any text (bulletproof-buttons)
  ["nowrap", ["white-space"]],
  ["0(%|px)?( 0(%|px)?)?|left top|top left", ["background-position"]],
  ["repeat", ["background-repeat"]],
  ["border-box", ["background-clip", "-webkit-background-clip"]],
  ["padding-box", ["background-origin"]],
];
const offs: Record<string, string[]> = {};
for (const [off, props] of OFF_VALUES) for (const p of props) (offs[p] ??= []).push(off);
const OFF: Record<string, RegExp> = Object.fromEntries(
  Object.entries(offs).map(([p, o]) => [p, new RegExp(`^(${[...o, "initial|inherit|unset|revert"].join("|")})$`, "i")]),
);

const isOff = (p: string, v: string): boolean => (NOOP_PROPS.has(p) && NOOP_VALUE.test(v)) || (OFF[p]?.test(v) ?? false);

// NOTE: the cascade keeps `!important` as a separate flag and strips it from the
// value, so callers must pass `${value} !important` for css-important to fire.
export const featuresFor = (prop: string, value: string): string[] => {
  const p = prop.trim().toLowerCase();
  const important = /!\s*important\s*$/i.test(value);
  const v = value.replace(/!\s*important\s*$/i, "").trim();
  const out = new Set<string>(isOff(p, v) ? [] : BY_PROP[p]);
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
  sel(":nth-last-child(?=\\()", "css-pseudo-class-nth-last-child"),
  sel(":nth-last-of-type(?=\\()", "css-pseudo-class-nth-last-of-type"),
  sel(":only-of-type", "css-pseudo-class-only-of-type"),
  sel(":default", "css-pseudo-class-default"),
  [/:lang\(/i, "css-pseudo-class-lang"],
  [/:has\(/i, "css-pseudo-class-has"],
  [/:not\(/i, "css-pseudo-class-not"],
  sel("::?before", "css-pseudo-element-before"),
  sel("::?after", "css-pseudo-element-after"),
  sel("::?first-line", "css-pseudo-element-first-line"),
  sel("::?first-letter", "css-pseudo-element-first-letter"),
  sel("::placeholder", "css-pseudo-element-placeholder"),
  sel("::marker", "css-pseudo-element-marker"),
  [/\[[^\]]+\]/, "css-selector-attribute"],
  [/^(?:[^[&]|\[[^\]]*\])*&/, "css-nesting"], // not inside an attribute selector: a[href*="&utm"]
];

export const featuresForSelector = (sel: string): string[] =>
  SELECTORS.filter(([re]) => re.test(sel)).map(([, slug]) => slug);

// image format, from the file extension or a data: URI's type
const IMAGE_TYPES: Record<string, string> = {
  png: "image-png",
  "x-png": "image-png",
  apng: "image-apng",
  jpg: "image-jpg",
  jpeg: "image-jpg",
  jpe: "image-jpg",
  jfif: "image-jpg",
  pjpeg: "image-jpg",
  gif: "image-gif",
  svg: "image-svg",
  "svg+xml": "image-svg",
  webp: "image-webp",
  avif: "image-avif",
  bmp: "image-bmp",
  ico: "image-ico",
  "x-icon": "image-ico",
  "vnd.microsoft.icon": "image-ico",
  tif: "image-tiff",
  tiff: "image-tiff",
  heif: "image-heif",
  heic: "image-heif",
  hdr: "image-hdr",
  mp4: "image-mp4",
};

export const featuresForImage = (src: string): string[] => {
  const s = src.trim().toLowerCase();
  const type = /^data:(?:image|video)\/([\w.+-]+)/.exec(s)?.[1] ?? /\.([a-z0-9]+)(?:[?#]|$)/.exec(s.split(/[?#]/)[0] ?? "")?.[1];
  const slug = type ? IMAGE_TYPES[type] : undefined;
  return slug ? [slug] : [];
};

// Elements, for the ones that reach the output as themselves. <picture>, the form controls
// and embedded media (svg, video, audio, object) aren't here: the sanitizer and E008 handle them.
const TAGS: Record<string, string> = {
  ...Object.fromEntries(["ul", "ol", "li", "dl", "dt", "dd"].map((t) => [t, "html-lists"])),
  ...Object.fromEntries(["h1", "h2", "h3", "h4", "h5", "h6"].map((t) => [t, "html-h1-h6"])),
  // <details>/<summary> are html-semantics too, but get their own W001
  ...Object.fromEntries(["article", "aside", "figcaption", "figure", "footer", "header", "main", "mark", "nav", "section", "time"].map((t) => [t, "html-semantics"])),
  ...Object.fromEntries(
    ["abbr", "acronym", "address", "bdi", "blockquote", "code", "del", "dfn", "dialog", "div", "hr", "img", "marquee", "meter", "p", "pre", "progress", "rp", "rt", "ruby", "small", "span", "strike", "strong", "table", "wbr"].map((t) => [t, `html-${t}`]),
  ),
};

export const featuresForTag = (tag: string): string[] => {
  const slug = TAGS[tag.toLowerCase()];
  return slug ? [slug] : [];
};

// every CSS slug the tables can return, for the "exists in the data" and coverage tests
export const ALL_FEATURE_SLUGS: string[] = [
  ...new Set([
    ...Object.values(BY_PROP).flat(),
    ...Object.values(BY_VALUE).flatMap((t) => t.map(([, s]) => s)),
    ...GRADIENTS.map(([, s]) => s),
    ...ANY_VALUE.map(([, s]) => s),
    ...Object.values(AT_RULES),
    ...SELECTORS.map(([, s]) => s),
    "css-important",
  ]),
];

export const ALL_IMAGE_SLUGS: string[] = [...new Set(Object.values(IMAGE_TYPES))];
export const ALL_TAG_SLUGS: string[] = [...new Set(Object.values(TAGS))];

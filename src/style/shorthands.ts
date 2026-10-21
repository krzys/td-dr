import { hasVar } from "./vars.ts";
import { splitTokens } from "./units.ts";

type Pairs = Array<readonly [string, string]>;

const GLOBAL = new Set(["inherit", "initial", "unset", "revert"]);
const SIDES = ["top", "right", "bottom", "left"] as const;
const CORNERS = ["top-left", "top-right", "bottom-right", "bottom-left"] as const;

const sides = (f: (s: string) => string): string[] => SIDES.map(f);
const borderSide = (s: string): string[] => [`border-${s}-width`, `border-${s}-style`, `border-${s}-color`];

const BLOCK = ["top", "bottom"] as const;
const INLINE = ["inline-start", "inline-end"] as const;

const LONGHANDS: Readonly<Record<string, readonly string[]>> = {
  margin: sides((s) => `margin-${s}`),
  padding: sides((s) => `padding-${s}`),
  inset: SIDES,
  "margin-block": BLOCK.map((s) => `margin-${s}`),
  "margin-inline": INLINE.map((s) => `margin-${s}`),
  "padding-block": BLOCK.map((s) => `padding-${s}`),
  "padding-inline": INLINE.map((s) => `padding-${s}`),
  "inset-block": BLOCK,
  "inset-inline": INLINE.map((s) => `inset-${s}`),
  "border-block-width": BLOCK.map((s) => `border-${s}-width`),
  "border-block-style": BLOCK.map((s) => `border-${s}-style`),
  "border-block-color": BLOCK.map((s) => `border-${s}-color`),
  "border-inline-width": INLINE.map((s) => `border-${s}-width`),
  "border-inline-style": INLINE.map((s) => `border-${s}-style`),
  "border-inline-color": INLINE.map((s) => `border-${s}-color`),
  "border-block": BLOCK.flatMap(borderSide),
  "border-block-start": borderSide("top"),
  "border-block-end": borderSide("bottom"),
  "border-inline": INLINE.flatMap(borderSide),
  "border-inline-start": borderSide("inline-start"),
  "border-inline-end": borderSide("inline-end"),
  "border-width": sides((s) => `border-${s}-width`),
  "border-style": sides((s) => `border-${s}-style`),
  "border-color": sides((s) => `border-${s}-color`),
  border: SIDES.flatMap(borderSide),
  "border-top": borderSide("top"),
  "border-right": borderSide("right"),
  "border-bottom": borderSide("bottom"),
  "border-left": borderSide("left"),
  "border-radius": CORNERS.map((c) => `border-${c}-radius`),
  background: ["background-color", "background-image", "background-position", "background-repeat", "background-size", "background-attachment"],
  font: ["font-style", "font-variant", "font-weight", "font-size", "line-height", "font-family"],
  flex: ["flex-grow", "flex-shrink", "flex-basis"],
  "flex-flow": ["flex-direction", "flex-wrap"],
  gap: ["row-gap", "column-gap"],
  "grid-gap": ["row-gap", "column-gap"], // legacy names
  "grid-row-gap": ["row-gap"],
  "grid-column-gap": ["column-gap"],
  "place-items": ["align-items", "justify-items"],
  "place-self": ["align-self", "justify-self"],
  "list-style": ["list-style-type", "list-style-position", "list-style-image"],
};

// Writing mode is always horizontal-tb, so block sides and sizes are just renames.
// Inline start/end depend on direction, which only the cascade knows (see toPhysical).
const RENAME: Readonly<Record<string, string>> = {
  "inline-size": "width",
  "block-size": "height",
  "min-inline-size": "min-width",
  "min-block-size": "min-height",
  "max-inline-size": "max-width",
  "max-block-size": "max-height",
  "inset-block-start": "top",
  "inset-block-end": "bottom",
  "margin-block-start": "margin-top",
  "margin-block-end": "margin-bottom",
  "padding-block-start": "padding-top",
  "padding-block-end": "padding-bottom",
  "border-block-start-width": "border-top-width",
  "border-block-start-style": "border-top-style",
  "border-block-start-color": "border-top-color",
  "border-block-end-width": "border-bottom-width",
  "border-block-end-style": "border-bottom-style",
  "border-block-end-color": "border-bottom-color",
};

export type Direction = "ltr" | "rtl";

const FLOW_RELATIVE = /^(padding-|margin-|border-|inset-)inline-(start|end)(-width|-style|-color)?$/;

// padding-inline-start → padding-left (ltr) / padding-right (rtl); anything else unchanged.
export const toPhysical = (prop: string, dir: Direction): string => {
  const m = FLOW_RELATIVE.exec(prop);
  if (!m) return prop;
  const side = (m[2] === "start") === (dir === "ltr") ? "left" : "right";
  return `${m[1] === "inset-" ? "" : m[1]}${side}${m[3] ?? ""}`;
};

export const isFlowRelative = (prop: string): boolean => FLOW_RELATIVE.test(prop);

const PENDING = "\u0000";
const SLASH_OK = new Set(["border-radius", "font", "background"]);
const COMMA_OK = new Set(["font"]);

const splitTopLevel = (v: string): string[] => {
  const out: string[] = [];
  let depth = 0;
  let quote = "";
  let cur = "";
  for (const ch of v) {
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
};

const hasTopLevelComma = (v: string): boolean => {
  let depth = 0;
  let quote = "";
  for (const ch of v) {
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) return true;
  }
  return false;
};

const zip = (names: readonly string[], values: readonly string[]): Pairs => names.map((n, i) => [n, values[i] ?? ""] as const);

// CSS 1-4 value syntax, in top/right/bottom/left order.
const four = (t: readonly string[]): string[] | undefined => {
  const [a, b, c, d] = t;
  if (a === undefined || t.length > 4) return undefined;
  return [a, b ?? a, c ?? a, d ?? b ?? a];
};

const boxOf = (prop: string) => (t: string[]): Pairs | undefined => {
  const v = four(t);
  return v && zip(LONGHANDS[prop]!, v);
};

// `padding-block: 1px 2px` is start then end
const pairOf = (prop: string) => (t: string[]): Pairs | undefined =>
  t.length === 1 || t.length === 2 ? zip(LONGHANDS[prop]!, [t[0]!, t[1] ?? t[0]!]) : undefined;

const PAIRS = [
  "margin-block", "margin-inline", "padding-block", "padding-inline", "inset-block", "inset-inline",
  "border-block-width", "border-block-style", "border-block-color", "border-inline-width", "border-inline-style", "border-inline-color",
];

const BORDER_STYLES = new Set(["none", "hidden", "dotted", "dashed", "solid", "double", "groove", "ridge", "inset", "outset"]);
const isNumeric = (t: string): boolean => /^[+-]?[\d.]/.test(t);

const borderParts = (t: string[]): { width: string; style: string; color: string } | undefined => {
  let width: string | undefined;
  let style: string | undefined;
  let color: string | undefined;
  if (t.length === 0 || t.length > 3) return undefined;
  for (const tok of t) {
    const l = tok.toLowerCase();
    if (BORDER_STYLES.has(l)) {
      if (style) return undefined;
      style = l;
    } else if (isNumeric(tok) || l === "thin" || l === "medium" || l === "thick") {
      if (width) return undefined;
      width = tok;
    } else {
      if (color) return undefined;
      color = tok;
    }
  }
  // no style means none, and a border with no style has no width
  const s = style ?? "none";
  return { width: width ?? (s === "none" || s === "hidden" ? "0" : "medium"), style: s, color: color ?? "currentcolor" };
};

const borderOf = (names: readonly string[]) => (t: string[]): Pairs | undefined => {
  const p = borderParts(t);
  return p && names.flatMap((s) => [[`border-${s}-width`, p.width], [`border-${s}-style`, p.style], [`border-${s}-color`, p.color]] as const);
};

const radius = (t: string[]): Pairs | undefined => {
  const slash = t.indexOf("/");
  const v = four(slash < 0 ? t : t.slice(0, slash));
  return v && zip(LONGHANDS["border-radius"]!, v);
};

const REPEAT = new Set(["repeat", "repeat-x", "repeat-y", "no-repeat", "space", "round"]);
const POSITION = new Set(["left", "right", "top", "bottom", "center"]);
const ATTACHMENT = new Set(["scroll", "fixed", "local"]);
const BOXES = new Set(["border-box", "padding-box", "content-box"]);
const IMAGE = /^(?:url|image-set|(?:repeating-)?(?:linear|radial|conic)-gradient)\(/i;

// Colour and image always come out (reset to transparent/none when not written),
// the other parts only when written. Box keywords (clip/origin) are ignored.
const background = (t: string[]): Pairs | undefined => {
  let color: string | undefined;
  let image: string | undefined;
  let attachment: string | undefined;
  const repeat: string[] = [];
  const pos: string[] = [];
  const size: string[] = [];
  let inSize = false;
  for (const tok of t) {
    const l = tok.toLowerCase();
    if (tok === "/") {
      inSize = true;
      continue;
    }
    if (inSize && (l === "auto" || l === "cover" || l === "contain" || isNumeric(tok))) size.push(tok);
    else {
      inSize = false;
      if (IMAGE.test(tok) || l === "none") image = tok;
      else if (REPEAT.has(l)) repeat.push(tok);
      else if (POSITION.has(l) || isNumeric(tok)) pos.push(tok);
      else if (ATTACHMENT.has(l)) attachment = tok;
      else if (!BOXES.has(l)) color = tok;
    }
  }
  const out: Array<readonly [string, string | undefined]> = [
    ["background-color", color ?? "transparent"],
    ["background-image", image ?? "none"],
    ["background-position", pos.join(" ") || undefined],
    ["background-repeat", repeat.join(" ") || undefined],
    ["background-size", size.join(" ") || undefined],
    ["background-attachment", attachment],
  ];
  return out.filter((p): p is readonly [string, string] => p[1] !== undefined);
};

// `background: linear-gradient(…), url(hero.jpg) center/cover, #222`: one layer per comma,
// longhands joined back with commas, and only the last layer may carry the colour.
const backgroundLayers = (v: string): Pairs | undefined => {
  const parsed = splitTopLevel(v).map((l) => background(splitTokens(l)));
  if (parsed.some((l) => l === undefined)) return undefined;
  const all = parsed as Pairs[];
  const get = (l: Pairs, p: string): string | undefined => l.find(([n]) => n === p)?.[1];
  const last = all.at(-1)!;
  if (all.slice(0, -1).some((l) => get(l, "background-color") !== "transparent")) return undefined;
  // a last layer that is only a colour adds no image layer
  const colourOnly = all.length > 1 && get(last, "background-image") === "none" && last.length === 2;
  const layers = colourOnly ? all.slice(0, -1) : all;
  const joined = (p: string, initial: string): string | undefined => {
    const vals = layers.map((l) => get(l, p));
    return vals.every((x) => x === undefined) ? undefined : vals.map((x) => x ?? initial).join(", ");
  };
  const out: Array<readonly [string, string | undefined]> = [
    ["background-color", get(last, "background-color") ?? "transparent"],
    ["background-image", joined("background-image", "none")],
    ["background-position", joined("background-position", "0% 0%")],
    ["background-repeat", joined("background-repeat", "repeat")],
    ["background-size", joined("background-size", "auto")],
    ["background-attachment", joined("background-attachment", "scroll")],
  ];
  return out.filter((p): p is readonly [string, string] => p[1] !== undefined);
};

const FONT_WEIGHT = /^(?:bold|bolder|lighter|[1-9]00)$/;
const FONT_SIZE_KW = /^(?:(?:xx?-)?(?:small|large)|xxx-large|medium|smaller|larger)$/;
const STRETCH = /^(?:(?:ultra|extra|semi)-)?(?:condensed|expanded)$/;

const font = (t: string[]): Pairs | undefined => {
  let style = "normal";
  let variant = "normal";
  let weight = "normal";
  let i = 0;
  for (; i < t.length; i++) {
    const tok = t[i]!;
    const l = tok.toLowerCase();
    if (l === "normal" || STRETCH.test(l)) continue;
    if (l === "italic" || l === "oblique") style = l;
    else if (l === "small-caps") variant = l;
    else if (FONT_WEIGHT.test(l)) weight = l;
    else break;
  }
  const size = t[i];
  if (size === undefined || !(isNumeric(size) || FONT_SIZE_KW.test(size.toLowerCase()))) return undefined; // system fonts etc.
  let lineHeight = "normal";
  i++;
  if (t[i] === "/") {
    lineHeight = t[i + 1] ?? "";
    i += 2;
  }
  const family = t.slice(i).join(" ");
  if (!family || !lineHeight) return undefined;
  return zip(LONGHANDS["font"]!, [style, variant, weight, size, lineHeight, family]);
};

const NUM = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;

const flex = (t: string[]): Pairs | undefined => {
  const names = LONGHANDS["flex"]!;
  if (t.length === 0 || t.length > 3) return undefined;
  const first = t[0]!.toLowerCase();
  if (t.length === 1 && first === "none") return zip(names, ["0", "0", "auto"]);
  if (t.length === 1 && first === "auto") return zip(names, ["1", "1", "auto"]);
  const nums = t.filter((x) => NUM.test(x));
  let basis = t.find((x) => !NUM.test(x));
  if (nums.length === 3) basis = nums.pop(); // `1 1 0`: the last number is the basis
  if (nums.length > 2 || (t.length === 3 && !basis) || (basis && t.length - nums.length > 1)) return undefined;
  if (nums.length === 0) return zip(names, ["1", "1", basis ?? "auto"]);
  return zip(names, [nums[0]!, nums[1] ?? "1", basis ?? "0%"]);
};

const flexFlow = (t: string[]): Pairs | undefined => {
  let dir: string | undefined;
  let wrap: string | undefined;
  if (t.length === 0 || t.length > 2) return undefined;
  for (const tok of t) {
    const l = tok.toLowerCase();
    if (/^(?:row|column)(?:-reverse)?$/.test(l) && !dir) dir = l;
    else if (/^(?:nowrap|wrap|wrap-reverse)$/.test(l) && !wrap) wrap = l;
    else return undefined;
  }
  return zip(LONGHANDS["flex-flow"]!, [dir ?? "row", wrap ?? "nowrap"]);
};

const gap = (t: string[]): Pairs | undefined =>
  t.length === 1 || t.length === 2 ? zip(LONGHANDS["gap"]!, [t[0]!, t[1] ?? t[0]!]) : undefined;

const listStyle = (t: string[]): Pairs | undefined => {
  let type: string | undefined;
  let position: string | undefined;
  let image: string | undefined;
  let none = false;
  if (t.length === 0 || t.length > 3) return undefined;
  for (const tok of t) {
    const l = tok.toLowerCase();
    if (l === "inside" || l === "outside") position = l;
    else if (IMAGE.test(tok)) image = tok;
    else if (l === "none") none = true;
    else type = tok;
  }
  // bare `none` clears both the marker type and the image
  if (none) {
    type ??= "none";
    image ??= "none";
  }
  const out: Array<readonly [string, string | undefined]> = [
    ["list-style-type", type],
    ["list-style-position", position],
    ["list-style-image", image],
  ];
  return out.filter((p): p is readonly [string, string] => p[1] !== undefined);
};

const EXPAND: Readonly<Record<string, (t: string[]) => Pairs | undefined>> = {
  margin: boxOf("margin"),
  padding: boxOf("padding"),
  "border-width": boxOf("border-width"),
  "border-style": boxOf("border-style"),
  "border-color": boxOf("border-color"),
  border: borderOf(SIDES),
  "border-top": borderOf(["top"]),
  "border-right": borderOf(["right"]),
  "border-bottom": borderOf(["bottom"]),
  "border-left": borderOf(["left"]),
  inset: boxOf("inset"),
  ...Object.fromEntries(PAIRS.map((p) => [p, pairOf(p)])),
  "border-block": borderOf(BLOCK),
  "border-block-start": borderOf(["top"]),
  "border-block-end": borderOf(["bottom"]),
  "border-inline": borderOf(INLINE),
  "border-inline-start": borderOf(["inline-start"]),
  "border-inline-end": borderOf(["inline-end"]),
  "border-radius": radius,
  background,
  font,
  flex,
  "flex-flow": flexFlow,
  gap,
  "grid-gap": gap,
  "grid-row-gap": (t) => (t.length === 1 ? [["row-gap", t[0]!]] : undefined),
  "grid-column-gap": (t) => (t.length === 1 ? [["column-gap", t[0]!]] : undefined),
  "place-items": (t) => (t.length === 1 || t.length === 2 ? zip(LONGHANDS["place-items"]!, [t[0]!, t[1] ?? t[0]!]) : undefined),
  "place-self": (t) => (t.length === 1 || t.length === 2 ? zip(LONGHANDS["place-self"]!, [t[0]!, t[1] ?? t[0]!]) : undefined),
  "list-style": listStyle,
};

// Longhands and unknown props pass through. A shorthand that can't be parsed
// expands to nothing (the caller reports it). A shorthand holding var() gives
// every longhand a pending value, so the cascade can still order them;
// computeValues resolves those (see parsePending).
export const expandDeclaration = (prop: string, value: string): Array<readonly [string, string]> => {
  const names = LONGHANDS[prop];
  if (!names) return [[RENAME[prop] ?? prop, value]];
  const v = value.trim();
  if (GLOBAL.has(v.toLowerCase())) return names.map((n) => [n, v.toLowerCase()] as const);
  if (hasVar(v)) return names.map((n) => [n, `${PENDING}${prop}${PENDING}${v}`] as const);
  if (!SLASH_OK.has(prop) && splitTokens(v).includes("/")) return [];
  if (prop === "background" && hasTopLevelComma(v)) return backgroundLayers(v) ?? [];
  if (!COMMA_OK.has(prop) && hasTopLevelComma(v)) return [];
  return EXPAND[prop]!(splitTokens(v)) ?? [];
};

// Longhand value that is still waiting for var() to resolve. `dir` is set when the
// cascade put a flow-relative one on the rtl side, so it expands the same way.
export const parsePending = (v: string): { prop: string; value: string; dir?: Direction } | undefined => {
  if (!v.startsWith(PENDING)) return undefined;
  const parts = v.slice(1).split(PENDING);
  if (parts.length === 2) return { prop: parts[0]!, value: parts[1]! };
  return parts.length === 3 && parts[1] === "rtl" ? { prop: parts[0]!, value: parts[2]!, dir: "rtl" } : undefined;
};

export const pendingInRtl = (v: string): string => {
  const p = parsePending(v);
  return p ? `${PENDING}${p.prop}${PENDING}rtl${PENDING}${p.value}` : v;
};

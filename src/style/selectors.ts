// Sorting selectors by whether inlining can use them.

export type SelectorKind = "static" | "dynamic" | "noise";

const QUOTED = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g;
const blankStrings = (s: string): string => s.replace(QUOTED, '""');

// user and UI state; css-select knows few of the form and media ones and would throw on them
const STATE =
  "hover|focus|focus-within|focus-visible|active|visited|target|target-within|local-link|default|indeterminate|valid|invalid|user-valid|user-invalid|in-range|out-of-range|placeholder-shown|autofill|open|modal|popover-open|fullscreen|playing|paused|current|past|future";
const LEGACY_ELEMENTS = "before|after|first-line|first-letter";

// Things css-select can't answer statically (user state, or no element to match).
const DYNAMIC = new RegExp(`::|:(?:${STATE}|${LEGACY_ELEMENTS})(?![\\w-])`, "i");
const PSEUDO_ELEMENT = new RegExp(`::[\\w-]+|:(?:${LEGACY_ELEMENTS})(?![\\w-])`, "gi");
const BEFORE_AFTER = /^::?(?:before|after)$/i;
const STRIP = new RegExp(`(${QUOTED.source})|::[\\w-]+(?:\\([^()]*\\))?|:(?:${STATE}|${LEGACY_ELEMENTS})(?![\\w-])`, "gi");

// Nothing an email shows: shadow DOM, form-control and UA internals, browser-only
// state. Resets are full of these, and warning about them helps nobody.
const NOISE =
  /:host(?:-context)?(?![\w-])|::?-(?:webkit|moz|ms|o)-(?!any\()|::(?:file-selector-button|placeholder|backdrop|selection|part|slotted)(?![\w-])/i;

export const isDynamicSelector = (selector: string): boolean => DYNAMIC.test(blankStrings(selector));

export const hasPseudoElement = (selector: string): boolean => blankStrings(selector).match(PSEUDO_ELEMENT) !== null;

// ::before/::after without `content` never render, so they're noise too.
export const classifySelector = (selector: string, hasContent: boolean): SelectorKind => {
  const s = blankStrings(selector);
  if (NOISE.test(s)) return "noise";
  const elements = s.match(PSEUDO_ELEMENT) ?? [];
  if (!hasContent && elements.length > 0 && elements.every((e) => BEFORE_AFTER.test(e))) return "noise";
  return DYNAMIC.test(s) ? "dynamic" : "static";
};

const TRAILING_PSEUDO = /^([\s\S]*?)::?(before|after)$/i;

// "a.x::before" -> its subject and side, when nothing else dynamic is in it.
export const pseudoTarget = (selector: string): { base: string; which: "before" | "after" } | undefined => {
  const m = TRAILING_PSEUDO.exec(selector.trim());
  if (!m || /::?(?:before|after)/i.test(blankStrings(m[1]!))) return undefined;
  // `.a :before` and `.a > ::before` mean the children of .a: the compound before the pseudo is `*`
  const head = m[1]!;
  const base = /[\s>+~]$/.test(head) ? `${head.trim()} *`.trim() : head.trim() || "*";
  return classifySelector(base, false) === "static" ? { base, which: m[2]!.toLowerCase() as "before" | "after" } : undefined;
};

// The selector without its state and pseudo-elements, to ask whether a dynamic
// rule would land on anything at all.
export const subjectOf = (selector: string): string => selector.replace(STRIP, (m, quoted: string | undefined) => quoted ?? ":where(*)");

// :checked is static to css-select, so it matches the initial `checked` attribute only.
const CHECKED = new RegExp(`(${QUOTED.source})|:checked(?![\\w-])`, "gi");
export const hasChecked = (selector: string): boolean => /:checked(?![\w-])/i.test(blankStrings(selector));

// "#b:checked ~ .pb" -> "#b:where(*) ~ .pb": what the rule lands on in any state.
export const anyCheckedState = (selector: string): string => selector.replace(CHECKED, (m, quoted: string | undefined) => quoted ?? ":where(*)");

// "a.cta:hover" -> "a.cta", when :hover sits only on the subject compound and nothing else
// dynamic is left. Whether it applies is up to the environment.
export const hoverSubject = (selector: string): string | undefined => {
  const s = selector.trim();
  const hovers: number[] = [];
  let all = 0;
  let subject = 0;
  let depth = 0;
  let quote = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === "\\") i++;
    else if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (depth === 0 && /[\s>+~]/.test(ch)) subject = i + 1;
    else if (ch === ":" && s[i - 1] !== ":" && /^:hover(?![\w-])/i.test(s.slice(i))) {
      all++;
      if (depth === 0) hovers.push(i);
    }
  }
  if (hovers.length === 0 || hovers.length !== all || hovers.some((h) => h < subject)) return undefined;
  let out = "";
  let pos = 0;
  for (const h of hovers) {
    out += s.slice(pos, h);
    pos = h + ":hover".length;
  }
  out += s.slice(pos);
  if (out === "" || /[\s>+~]$/.test(out)) out += "*";
  return classifySelector(out, false) === "static" ? out : undefined;
};

// What makes a dynamic selector one inlining can't follow: a pseudo-element other than ::before and
// ::after, else a state other than :hover, else a :hover off the subject; `on` is a ::before or
// ::after the state sits with.
export type DynamicPart = { element: string } | { state: string; on?: string };
export const dynamicPart = (selector: string): DynamicPart => {
  const s = blankStrings(selector);
  const elements = (s.match(PSEUDO_ELEMENT) ?? []).map((e) => `::${e.replace(/^::?/, "").toLowerCase()}`);
  const element = elements.find((e) => !BEFORE_AFTER.test(e));
  if (element) return { element };
  const states = [...s.matchAll(new RegExp(`(?<!:):(${STATE})(?![\\w-])`, "gi"))].map((m) => `:${m[1]!.toLowerCase()}`);
  const state = states.find((x) => x !== ":hover") ?? ":hover";
  return elements[0] ? { state, on: elements[0] } : { state };
};

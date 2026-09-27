import type { Ctx } from "../ctx.ts";
import type { SrcLoc } from "../loc.ts";
import { importUrl } from "../parse/font-hosts.ts";
import type { FontRules, StyledElement } from "../style/types.ts";

const GENERIC = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "emoji", "math", "fangsong"]);

// Never guessed as a web font when a source names no family.
const WEB_SAFE = new Set([
  "arial", "arial black", "helvetica", "helvetica neue", "georgia", "times new roman", "times", "verdana", "tahoma", "trebuchet ms",
  "courier new", "courier", "lucida console", "lucida sans unicode", "lucida grande", "lucida sans", "palatino", "palatino linotype",
  "book antiqua", "garamond", "impact", "comic sans ms", "segoe ui", "calibri", "cambria", "candara", "consolas", "geneva", "monaco",
  "-apple-system", "blinkmacsystemfont", "san francisco", "sf pro text", "sf pro display", "ms sans serif", "ms serif",
]);

const unquote = (s: string): string => s.trim().replace(/^(["'])(.*)\1$/, "$2").trim();

// Splits a font-family value on commas outside quotes.
const families = (value: string): string[] => {
  const out: string[] = [];
  let cur = "";
  let quote = "";
  for (const ch of value) {
    if (quote) {
      if (ch === quote) quote = "";
      cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map(unquote).filter(Boolean);
};

const decode = (s: string): string => {
  try {
    return decodeURIComponent(s.replace(/%(?![0-9a-f]{2})/gi, ""));
  } catch {
    return s; // a stray % is the author's typo, not ours to crash on
  }
};

// Families named by a Google-style url: family=Open+Sans:wght@400|Lora
const urlFamilies = (url: string): string[] =>
  [...url.matchAll(/[?&]family=([^&]+)/gi)].flatMap((m) =>
    decode((m[1] ?? "").replace(/\+/g, " ")).split("|").map((f) => (f.split(":")[0] ?? "").trim()),
  ).filter(Boolean);

// lower-case name -> name as written, for matching and for the message
const declared = (fonts: FontRules, links: string[]): { names: Map<string, string>; blind: string[] } => {
  const out = new Map<string, string>();
  const blind: string[] = [];
  const add = (f: string): void => void out.set(f.toLowerCase(), f);
  for (const face of fonts.faces) {
    const name = /font-family\s*:\s*([^;}]+)/i.exec(face)?.[1];
    if (name) add(unquote(name));
  }
  const urls = [...fonts.imports.map((i) => importUrl(i.replace(/^@import\s*/i, ""))), ...links];
  for (const u of urls) {
    const names = urlFamilies(u);
    if (names.length === 0) blind.push(u);
    for (const f of names) add(f);
  }
  return { names: out, blind };
};

const MSO_TAGS = ["body", "table", "td", "th", "p", "a", "li", "span", "div", "h1", "h2", "h3", "h4", "h5", "h6"];
const MSO_SELECTORS = MSO_TAGS.join(",");

// Font stacks of the elements that hold text: how many do, how many of those the Outlook
// override reaches (a tag it names, or one that inherits its parent's stack), and the first one.
type StackUse = { uses: number; reached: number; loc: SrcLoc | undefined };
const stacksOf = (body: StyledElement): Map<string, StackUse> => {
  const out = new Map<string, StackUse>();
  const walk = (el: StyledElement, parent: string | undefined): void => {
    const stack = el.style["font-family"];
    if (stack && el.children.some((c) => c.type === "text" && c.text.trim() !== "")) {
      const s = out.get(stack) ?? { uses: 0, reached: 0, loc: el.loc };
      s.uses++;
      if (MSO_TAGS.includes(el.tag) || stack === parent) s.reached++;
      out.set(stack, s);
    }
    for (const c of el.children) if (c.type === "element") walk(c, stack);
  };
  walk(body, undefined);
  return out;
};
const cssFamily = (f: string): string => (/^[\w-]+$/.test(f) ? f : `'${f}'`);

export const fontHead = (fonts: FontRules, links: string[], body: StyledElement, ctx: Ctx): string => {
  if (fonts.imports.length + fonts.faces.length + links.length === 0) return "";
  const { names: web, blind } = declared(fonts, links);
  const isGeneric = (f: string): boolean => GENERIC.has(f.toLowerCase());

  // A source with no family= (Typekit, fontawesome) doesn't say what it loads. Web fonts lead
  // their stack, so in a stack that names none we take the first family as the web one.
  let assumed: { loc: SrcLoc | undefined } | undefined; // the first stack it was assumed for
  const stacks = [...stacksOf(body)].map(([value, { uses, reached, loc }]) => {
    const list = families(value);
    let webIdx = list.findIndex((f) => web.has(f.toLowerCase()));
    if (webIdx < 0 && blind.length > 0 && list[0] && !isGeneric(list[0]) && !WEB_SAFE.has(list[0].toLowerCase())) {
      webIdx = 0;
      assumed ??= { loc };
    }
    const named = (f: string, i: number): boolean => !isGeneric(f) && !web.has(f.toLowerCase()) && !(i === 0 && webIdx === 0);
    const fallbackIdx = list.findIndex(named);
    const fallback = list[fallbackIdx] ?? list.find(isGeneric) ?? "sans-serif";
    return { value, uses, reached, loc, fallback, webIdx, hasFallback: webIdx >= 0 && list.some((f, i) => i > webIdx && named(f, i)) };
  });
  const withWeb = stacks.filter((s) => s.webIdx >= 0);
  if (withWeb.length > 0 && !withWeb.some((s) => s.hasFallback)) ctx.diagnostics.report("W013", { loc: withWeb[0]?.loc });
  if (assumed) {
    ctx.diagnostics.report("W001", {
      loc: assumed.loc,
      message: "A font stylesheet doesn't name its families, so the first family of each font stack was taken as the web font",
      hint: "Outlook for Windows then uses the next family. Name the families in the URL (family=...) so td;dr can tell.",
    });
  }
  const open = [
    "<!--[if !mso]><!-->",
    ...links.map((href) => `<link rel="stylesheet" href="${href.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">`),
    ...(fonts.imports.length ? [`<style>${fonts.imports.map((i) => `${i};`).join("\n")}</style>`] : []),
    ...(fonts.faces.length ? [`<style>${fonts.faces.join("\n")}</style>`] : []),
    "<!--<![endif]-->",
  ];
  const names = [...web.values(), ...(blind.length > 0 ? [`families from ${blind.join(", ")} (not named in the URL)`] : [])].join(", ") || "an @font-face with no font-family";
  // Without a stack that uses it, forcing a font on Outlook would replace the author's own.
  if (withWeb.length === 0) {
    ctx.diagnostics.report("I008", { message: `Web font kept: ${names} (no text uses it, so Outlook is left alone)` });
    return open.join("\n");
  }
  ctx.diagnostics.report("I008", { message: `Web font kept: ${names}` });

  // most used fallback wins; a tie goes to the first one met
  const byFallback = new Map<string, number>();
  for (const s of withWeb) byFallback.set(s.fallback, (byFallback.get(s.fallback) ?? 0) + s.uses);
  const ranked = [...byFallback].sort((a, b) => b[1] - a[1]);
  const fallback = ranked[0]?.[0] ?? "sans-serif";
  if (ranked.length > 1) {
    ctx.diagnostics.report("W001", {
      loc: withWeb.find((s) => s.fallback !== fallback)?.loc,
      message: `Font stacks fall back to different fonts (${ranked.map(([f]) => f).join(", ")}); Outlook for Windows uses the most used fallback, ${fallback}, for all of them`,
      hint: "Use the same web-safe font after the web font in every stack.",
    });
  }
  // the element-selector override reaches stacks without a web font too
  const replaced = stacks.filter((s) => s.webIdx < 0 && s.reached > 0 && s.fallback !== fallback);
  if (replaced.length > 0) {
    ctx.diagnostics.report("W001", {
      loc: replaced[0]?.loc,
      message: `${replaced.map((s) => s.value).join("; ")} ${replaced.length > 1 ? "are" : "is"} also shown as ${fallback} in Outlook for Windows`,
      hint: "The Outlook override sets one font for all text.",
    });
  }

  const mso = ["<!--[if mso]>", `<style>${MSO_SELECTORS}{font-family:${cssFamily(fallback)} !important;}</style>`, "<![endif]-->"];
  return [...open, ...mso].join("\n");
};

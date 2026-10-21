import { parse } from "parse5";
import type { DefaultTreeAdapterMap } from "parse5";
import type { Ctx } from "../ctx.ts";
import { MODERN_COLOR, unquoted } from "../style/colors.ts";
import { featuresFor, featuresForAtRule, featuresForSelector } from "../targets/features.ts";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];


// Documented fallbacks that are meant to be unsupported somewhere. tag undefined = any checked tag.
type Allowed = { tag?: ReadonlySet<string>; prop: RegExp; value?: RegExp; why: string };
const set = (...t: string[]): ReadonlySet<string> => new Set(t);
const ALLOWED: readonly Allowed[] = [
  { tag: set("td", "img"), prop: /^border(-.+)?-radius$/, why: "cosmetic; Outlook ignores it (outlook-quirks)" },
  { tag: set("td"), prop: /^min-width$/, value: /^\d+(\.\d+)?px$/, why: "flex-shrink: 0 column; Outlook renders at 600px, where the width attr already holds it (block-width)" },
  { tag: set("table", "td", "img"), prop: /^max-width$/, why: "capped width; Outlook gets the width attr or a ghost table (ghost-tables)" },
  { prop: /^margin$/, value: /^0( auto)?$/, why: "centering via margin:0 auto (ghost-tables)" },
  { prop: /^white-space$/, value: /^nowrap$/, why: "keeps buttons on one line (bulletproof-buttons)" },
  { tag: set("img"), prop: /^display$/, value: /^block$/, why: "removes the baseline gap under images (outlook-quirks)" },
  { tag: set("img"), prop: /^height$/, value: /^auto$/, why: "keeps the aspect ratio when width shrinks (fluid-hybrid)" },
  { tag: set("img"), prop: /^height$/, value: /^\d+(\.\d+)?px$/, why: "px height next to the height attribute, so Outlook and fluid clients agree (outlook-quirks)" },
  { tag: set("td"), prop: /^background-(image|size|position|repeat)$/, why: "image or gradient behind a cell, over its bgcolor; Outlook gets the bgcolor, plus VML for a photo (vml-backgrounds)" },
  { tag: set("td"), prop: /^display$/, value: /^none$/, why: "the hide of a block that shows on some screens only; Outlook gets mso-hide too (preheader, progressive-head-styles)" },
  { tag: set("td"), prop: /^max-height$/, value: /^0$/, why: "part of that hide (preheader)" },
  { tag: set("tr"), prop: /^(display|max-height)$/, value: /^(none|0)$/, why: "a spacer row of a vertical distribution that another screen uses; where the hide doesn't apply the row takes one more share (vertical-distribution)" },
  { tag: set("table"), prop: /^table-layout$/, value: /^fixed$/, why: "fixed columns where it's read; Outlook lays the table out from its width attributes (clipping-and-rounded-corners)" },
  { tag: set("td", "tr"), prop: /^overflow$/, value: /^hidden$/, why: "part of a hide, or the cut of a clipped box; Outlook gets mso-hide or the fixed table width (preheader, clipping-and-rounded-corners)" },
  { tag: set("td"), prop: /^box-sizing$/, value: /^border-box$/, why: "a gutter or stacked cell keeps its padding inside its width; Outlook takes the width attribute and mso-padding-alt (flex-rows)" },
  { tag: set("img"), prop: /^box-sizing$/, value: /^border-box$/, why: "the author's box-sizing on a pass-through image (a preflight reset); the IR never writes it on images" },
  { tag: set("img"), prop: /^float$/, value: /^(left|right)$/, why: "CSS float where it's read; Outlook gets the align attribute next to it (images)" },
  // inherited, so the emitter writes the author's value with the text styles of each cell; reported on input
  { tag: set("td"), prop: /^(overflow-wrap|word-wrap|word-break)$/, why: "the author's text wrapping, inherited into the cell and reported on input (W005)" },
  { tag: set("td"), prop: /^border-spacing$/, why: "inherited with the text styles; it applies to tables only, so on a cell it does nothing (grids-and-table-display)" },
  { prop: /^(mso-|-ms-)/, why: "Outlook-only properties, harmless elsewhere (outlook-quirks)" },
  { prop: /^-webkit-text-size-adjust$/, why: "iOS font inflation reset (apple-ios-quirks)" },
  { tag: set("table"), prop: /^height$/, value: /^\d+(\.\d+)?px$/, why: "vertical distribution in a min-height box; Yahoo reads it as min-height, which is what it means here (vertical-distribution)" },
  { prop: /^(color|background-color|border-(top|right|bottom|left)(-color)?|text-decoration-color|outline-color)$/, value: /(rgba|hsla)\(/, why: "the author's translucent colour that couldn't be flattened, already reported (W001) on input; the emitter never writes one itself, so this can't hide a bug of ours" },
  { prop: /^(color|background-color|border-(top|right|bottom|left)(-color)?|text-decoration-color|outline-color)$/, value: /light-dark\(/, why: "the author's light-dark() colour, kept as written and reported on input (W005); the emitter never writes one itself" },
];

const isAllowed = (tag: string, prop: string, value: string): boolean =>
  ALLOWED.some((a) => (!a.tag || a.tag.has(tag)) && a.prop.test(prop) && (!a.value || a.value.test(value.trim())));

// Selectors we write ourselves in <head>: the shell's reset and the iOS/Gmail link fixes.
const ALLOWED_SELECTORS: ReadonlySet<string> = set("body", "table", "td", "img", "a[x-apple-data-detectors]", "u + #body a");

// The head rules from src/responsive: generated classes (also :hover and the Outlook.com dark mirrors) and :root.
// Progressive enhancement like @media: clients without them keep the inline styles.
const OURS = /^(?:\.t-[a-z0-9]+(?::hover)?|\[data-og(?:sc|sb)\] \.t-[a-z0-9]+|:root)$/;

// Attributes the emitter sets on table/tr/td/img, and the caniemail feature each one needs.
const ATTR_FEATURES: Readonly<Record<string, string>> = {
  align: "html-align",
  valign: "html-valign",
  width: "html-width",
  height: "html-height",
  cellpadding: "html-cellpadding",
  cellspacing: "html-cellspacing",
  background: "html-background",
};

const declarations = (css: string): [string, string][] =>
  css
    .split(";")
    .map((d): [string, string] | undefined => {
      const i = d.indexOf(":");
      return i < 0 ? undefined : [d.slice(0, i).trim().toLowerCase(), d.slice(i + 1).replace(/!important/i, "").trim()];
    })
    .filter((d): d is [string, string] => d !== undefined && d[0] !== "");

type Rule = { prelude: string; body: string };

// Flat scan of a stylesheet's top level: `prelude { body }` pairs.
const topLevelRules = (css: string): Rule[] => {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Rule[] = [];
  let depth = 0;
  let start = 0;
  let open = -1;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "{") {
      if (depth++ === 0) open = i;
    } else if (c === "}" && depth > 0 && --depth === 0) {
      out.push({ prelude: src.slice(start, open).trim(), body: src.slice(open + 1, i) });
      start = i + 1;
    } else if (c === ";" && depth === 0) start = i + 1; // @import / @charset
  }
  return out;
};

const elements = (node: Node, out: Element[] = []): Element[] => {
  if ("tagName" in node) out.push(node);
  const kids = "content" in node ? [node.content, ...node.childNodes] : "childNodes" in node ? node.childNodes : [];
  for (const k of kids) elements(k, out);
  return out;
};

export const selfLint = (html: string, ctx: Ctx): void => {
  const reported = new Set<string>();

  // one W006 per slug and place, however many times the emitter repeats it
  const flag = (slug: string, where: string): void => {
    const key = `${slug}|${where}`;
    if (reported.has(key)) return;
    const res = ctx.caps.check(slug);
    if (res.status !== "n") return;
    reported.add(key);
    ctx.diagnostics.report("W006", {
      message: `Output uses ${slug} on ${where}, which ${res.unsupported.join(", ")} don't support (compiler bug)`,
    });
  };

  // values the style stage should have folded: modern colours and calc(). Only in our own markup:
  // pass-through keeps what the author wrote, which the input lint has already reported.
  const leftover = (css: string, where: string): void => {
    for (const re of [MODERN_COLOR, /(?<![\w-])(?:-\w+-)?calc\(/i]) {
      const m = re.exec(unquoted(css));
      if (!m) continue;
      const key = `left|${where}|${m[0]}`;
      if (reported.has(key)) continue;
      reported.add(key);
      ctx.diagnostics.report("W006", { message: `Output still has ${m[0]}...) in ${where}; it should have been lowered to hex/px` });
    }
  };

  const checkEl = (el: Element): void => {
    const tag = el.tagName;
    for (const a of el.attrs) {
      const slug = ATTR_FEATURES[a.name];
      // the photo attribute is a documented fallback under the CSS image and VML (vml-backgrounds)
      if (slug && !(tag === "td" && a.name === "background")) flag(slug, `<${tag} ${a.name}>`);
    }
    const style = el.attrs.find((a) => a.name === "style")?.value ?? "";
    if (style) leftover(style, `<${tag} style>`);
    // a td's height is its min-height: the attribute is the real one, the css is the same px for fluid clients
    const cellHeight = tag === "td" && el.attrs.some((a) => a.name === "height");
    for (const [prop, value] of declarations(style)) {
      if (isAllowed(tag, prop, value)) continue;
      if (cellHeight && prop === "height" && /^\d+(\.\d+)?px$/.test(value)) continue;
      for (const slug of featuresFor(prop, value)) flag(slug, `<${tag}> (${prop}: ${value})`);
    }
  };

  const kids = (el: Element): Element[] => el.childNodes.filter((n): n is Element => "tagName" in n);
  const isEmittedTable = (el: Element): boolean =>
    el.tagName === "table" && el.attrs.some((a) => a.name === "role" && a.value === "presentation");

  // Emitter structure only: our tables, their rows and cells, and images placed directly in a cell.
  // A cell's inline content (and any table without role=presentation) is author pass-through.
  const isCol = (el: Element): boolean =>
    el.tagName === "div" && el.attrs.some((a) => a.name === "class" && a.value.split(/\s+/).includes("tddr-col"));
  // a fluid row: the wrapper div holding the tddr-col inline-blocks, and the columns themselves
  const isFluid = (el: Element): boolean => isCol(el) || (el.tagName === "div" && kids(el).some(isCol));

  const cell = (td: Element): void => {
    for (const c of kids(td)) {
      if (isFluid(c)) {
        checkEl(c);
        cell(c);
      } else if (isEmittedTable(c)) table(c);
      else if (c.tagName === "img") checkEl(c);
      else if (c.tagName === "a") for (const i of kids(c)) if (i.tagName === "img") checkEl(i);
    }
  };
  const table = (t: Element): void => {
    checkEl(t);
    const rows = (el: Element): void => {
      for (const c of kids(el)) {
        if (c.tagName === "tr") {
          checkEl(c);
          for (const td of kids(c)) if (td.tagName === "td") {
              checkEl(td);
              cell(td);
            }
        } else if (/^t(body|head|foot)$/.test(c.tagName)) rows(c);
      }
    };
    rows(t);
  };
  // Outside any cell only the shell's wrappers sit between us and the first emitted table.
  const shell = (el: Element): void => {
    for (const c of kids(el)) {
      if (isEmittedTable(c)) table(c);
      else if (c.tagName !== "table") shell(c);
    }
  };

  // our phone rules keep a live text size (vw, clamp(), its calc() line height) on purpose (docs/support.md#design-width)
  const withoutLive = (css: string): string =>
    topLevelRules(css)
      .filter(({ prelude, body }) => !(prelude.startsWith("@media") && topLevelRules(body).every((r) => r.prelude.split(",").every((x) => OURS.test(x.trim().replace(/\s+/g, " "))))))
      .map(({ prelude, body }) => `${prelude}{${body}}`)
      .join("\n");

  const doc = parse(html);
  shell(doc as unknown as Element);
  for (const el of elements(doc)) {
    const tag = el.tagName;
    if (tag === "style") leftover(withoutLive(el.childNodes.map((n) => ("value" in n ? n.value : "")).join("")), "<style>");
    if (tag === "style" && el.parentNode?.nodeName === "head") {
      const css = el.childNodes.map((n) => ("value" in n ? n.value : "")).join("");
      for (const { prelude, body } of topLevelRules(css)) {
        if (prelude.startsWith("@")) {
          // @media and the kept web font rules are progressive enhancement: clients without them keep the inline styles
          const name = /^@([\w-]+)/.exec(prelude)?.[1] ?? "";
          if (!["media", "font-face", "import"].includes(name)) for (const slug of featuresForAtRule(name)) flag(slug, `<style> @${name}`);
          continue;
        }
        const selectors = prelude.split(",").map((s) => s.trim().replace(/\s+/g, " "));
        if (selectors.every((s) => OURS.test(s))) continue;
        const ours = selectors.every((s) => ALLOWED_SELECTORS.has(s));
        for (const s of selectors) {
          if (ALLOWED_SELECTORS.has(s)) continue;
          for (const slug of featuresForSelector(s)) flag(slug, `<style> ${s}`);
        }
        if (ours) continue;
        for (const [prop, value] of declarations(body)) {
          if (isAllowed("style", prop, value)) continue;
          for (const slug of featuresFor(prop, value)) flag(slug, `<style> ${prelude} (${prop})`);
        }
      }
    }
  }
};

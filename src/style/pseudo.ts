import type { Ctx } from "../ctx.ts";
import type { DomElement } from "../parse/dom.ts";
import type { Props, Store } from "./precedence.ts";

// Static ::before / ::after text. Only plain strings are lowered; attr(), counter(),
// url() and the quote keywords need a browser.

const STRING = /"((?:\\[\s\S]|[^"\\])*)"|'((?:\\[\s\S]|[^'\\])*)'/y;

export const unescape = (s: string): string =>
  s.replace(/\\(?:([0-9a-f]{1,6})[ \t\n]?|(\n)|([\s\S]))/gi, (_m, hex?: string, nl?: string, ch?: string) => {
    if (hex) {
      const cp = parseInt(hex, 16);
      return cp === 0 || cp > 0x10ffff ? "\ufffd" : String.fromCodePoint(cp);
    }
    return nl ? "" : ch!;
  });

// The text of `content: "a" "b"`, or undefined for anything that isn't only strings.
export const literalContent = (value: string): string | undefined => {
  let text = "";
  let at = 0;
  const v = value.trim();
  if (!v) return undefined;
  while (at < v.length) {
    STRING.lastIndex = at;
    const m = STRING.exec(v);
    if (!m) return undefined;
    text += unescape(m[1] ?? m[2] ?? "");
    at = STRING.lastIndex;
    const gap = /^\s*/.exec(v.slice(at))![0].length;
    if (at < v.length && gap === 0) return undefined;
    at += gap;
  }
  return text;
};

export type PseudoSide = "before" | "after";

// declarations that give an empty pseudo-element something to see (a radius alone draws nothing)
const BOX_PAINT = /^(width|height|background|border|padding|box-shadow)(-|$)(?!.*radius)/;
// a zero or empty value draws nothing, so a clearfix with height:0 or border:0 stays quiet
const NO_PAINT = /^(0[a-z%]*|none|transparent|currentcolor|auto|initial)$/i;
const paints = (v: string): boolean => !v.trim().split(/\s+/).every((t) => NO_PAINT.test(t));
// Hosts that can't take a text child, hosts that take blocks, and ones that take nothing.
const NO_TEXT = new Set(["table", "thead", "tbody", "tfoot", "tr", "colgroup", "ul", "ol", "dl"]);
const LISTS = new Set(["ul", "ol", "dl"]);
const FLOW = new Set(["div", "td", "th", "li", "dd", "blockquote", "section", "article", "aside", "header", "footer", "main", "nav", "figure", "form", "body"]);
// Replaced and foreign elements: browsers draw no ::before/::after on them.
const VOID = new Set([
  "img", "br", "hr", "input", "col", "area", "wbr", "svg", "math", "textarea", "iframe", "video", "audio",
  "picture", "object", "embed", "canvas", "select", "option", "optgroup", "meter", "progress",
]);
const BLOCKISH = /^(block|flex|grid|list-item)$/i;

// What the pseudo rules won, per side and host. `literal`: hosts some rule gave a string
// content, so a content: none that beats it is a modifier hiding it, not a mistake.
export type PseudoWon = { props: Record<PseudoSide, Store>; literal: Record<PseudoSide, ReadonlySet<DomElement>> };

// A pseudo-element that will be shown: its text, the element that wraps it and what it
// cascaded to (content removed).
export type ShownPseudo = { host: DomElement; side: PseudoSide; text: string; tag: "span" | "div"; props: Props };

// Which ::before / ::after can be inserted as text, and a warning for each that can't.
// `elements` is what the hosts themselves won (a display:none host hides an empty one).
export const pseudoDecisions = (won: PseudoWon, elements: Store, ctx: Ctx): ShownPseudo[] => {
  const shown: ShownPseudo[] = [];
  const emptyReported = new Set<string>();
  for (const side of ["before", "after"] as const) {
    for (const [host, props] of won.props[side]) {
      const c = props.get("content");
      if (!c) continue;
      const from = c.from;
      const where = from?.selector ?? side;
      const text = literalContent(c.value);
      // content: none over an earlier string is how a modifier class hides it
      if (text === undefined) {
        if (!(/^(none|normal)$/i.test(c.value.trim()) && won.literal[side].has(host))) {
          ctx.diagnostics.report("W001", {
            message: `Selector "${where}" has a content value that isn't a plain string and was skipped`,
            hint: 'Only literal strings are inserted; write the text out as content: "…" or put it in the HTML.',
            loc: from?.loc,
          });
        }
        continue;
      }
      const tag = host.name.toLowerCase();
      if (VOID.has(tag) || (host.namespace && host.namespace !== "http://www.w3.org/1999/xhtml")) continue;
      if (!text) {
        // empty content is a clearfix unless it paints a box (a bar, a dot), which is lost without a real element
        const drawn = [...props].some(([k, v]) => BOX_PAINT.test(k) && paints(v.value));
        const hidden = props.get("visibility")?.value.trim() === "hidden" || props.get("display")?.value.trim() === "none" || elements.get(host)?.get("display")?.value.trim() === "none";
        const key = `${where}@${from?.loc?.file ?? ""}:${from?.loc?.line}:${from?.loc?.col}`;
        if (drawn && !hidden && !emptyReported.has(key)) {
          emptyReported.add(key);
          ctx.diagnostics.report("W001", {
            message: `Selector "${where}" draws a box with empty content, which can't be inserted, so it was skipped`,
            hint: "Write the bar or dot as a real element (a <div> or <td> with the width, height and background).",
            loc: from?.loc,
          });
        }
        continue;
      }
      if (NO_TEXT.has(tag)) {
        ctx.diagnostics.report("W001", {
          message: `Selector "${where}" puts text directly inside <${tag}>, which can't hold it, so it was skipped`,
          hint: LISTS.has(tag)
            ? "Text straight inside a list is invalid HTML and email clients move or drop it; put the pseudo-element on the <li>, or write the text as its own element."
            : "Browsers move such text out of the table, so it would land in the wrong place; put the text in a cell, or put the pseudo-element on the <td>.",
          loc: from?.loc,
        });
        continue;
      }
      let wrap: "span" | "div" = "span";
      if (BLOCKISH.test(props.get("display")?.value.trim() ?? "")) {
        if (FLOW.has(tag)) wrap = "div";
        else {
          ctx.diagnostics.report("I003", {
            message: `Selector "${where}" makes text inside <${tag}> a block; Outlook ignores display on inline tags, so it runs on with the text there`,
            hint: "Put the pseudo-element on a <div> or <td> so it gets its own row, or write it as its own block.",
            loc: from?.loc,
          });
        }
      }
      const own: Props = new Map(props);
      own.delete("content");
      shown.push({ host, side, text, tag: wrap, props: own });
    }
  }
  return shown;
};

import { OUTLOOK_ONLY_CLOSE, OUTLOOK_ONLY_OPEN } from "../ir/index.ts";
import { CHAIN_TAG, GROUP_TAG, WHEN_ATTR } from "../template/chain.ts";
import { readBlocks } from "../template/hints.ts";
import { blockClose, blockOpen, closeData } from "../template/tokens.ts";
import { isInlineLevel } from "./classify.ts";
import { floatOf, floatSpacing } from "./float.ts";

const FLOAT_ATTRS: ReadonlySet<string> = new Set(["align", "hspace", "vspace"]);
import { isInherited, lineHeightPx } from "../style/props.ts";
import type { ComputedStyle, StyledElement, StyledNode } from "../style/types.ts";

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

const escapeText = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/ /g, "&nbsp;");
const escapeAttr = (s: string): string => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/ /g, "&nbsp;");

// Double quotes would become &quot; inside style="", which some clients mangle.
export const styleAttr = (decls: Readonly<Record<string, string>>): string =>
  Object.entries(decls)
    .map(([p, v]) => `${p}:${v.replace(/"/g, "'")}`)
    .join(";");

// Tags whose browser default is no margin and no padding, so a reset to 0 says nothing.
const FLUSH = new Set(["a", "abbr", "article", "aside", "b", "cite", "code", "div", "em", "footer", "header", "i", "img", "label", "main", "nav", "s", "section", "small", "span", "strong", "sub", "sup", "u"]);
const BOXY = /^(margin|padding)-(top|right|bottom|left)$/;
const BORDER_SIDE = /^border-(top|right|bottom|left)-(width|style|color)$/;
const isZero = (v: string | undefined): boolean => v === undefined || /^0(px)?$/.test(v);

// A Tailwind-style `* { margin: 0; padding: 0; border: 0 solid }` reset lands on every element;
// dropping the parts that match the browser default keeps the output readable.
const dropResets = (tag: string, out: Record<string, string>, style: ComputedStyle): void => {
  if (!FLUSH.has(tag)) return;
  for (const p of Object.keys(out)) {
    if (BOXY.test(p)) {
      if (isZero(out[p])) delete out[p];
      continue;
    }
    // images keep their border reset: some clients draw one around a linked image
    const side = tag === "img" ? undefined : BORDER_SIDE.exec(p)?.[1];
    if (!side) continue;
    // style and colour only matter once the side has a width
    if (isZero(style[`border-${side}-width`])) delete out[p];
  }
};

const nonZero = (v: string | undefined): boolean => v !== undefined && !/^\s*0*\s*$/.test(v);
const separates = (el: StyledElement): boolean => el.attrs["cellspacing"] === undefined || nonZero(el.attrs["cellspacing"]) || nonZero(el.attrs["border"]);

/**
 * What an element needs inline so it looks the same without any stylesheet or
 * browser defaults: authored and UA values, minus inherited values it would get
 * from `parent` anyway. Email clients have their own UA styles, so h1 sizes and
 * p margins must be explicit.
 */
export const ownStyle = (el: StyledElement, parent: ComputedStyle | undefined): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [p, v] of Object.entries(el.style)) {
    if (p.startsWith("--")) continue;
    if (p === "display") {
      // a kept element says its display: the diff against the screens where it is hidden needs the real value, not the tag's guess
      if ("display" in el.declared || el.keep) out[p] = v;
    } else if (!isInherited(p) || parent?.[p] !== v || (p === "color" && el.tag === "a")) out[p] = v; // clients colour bare links
  }
  dropResets(el.tag, out, el.style);
  // The shell's reset collapses every table's borders (Outlook seams). An author table on the separate
  // model says so where the two differ: cell spacing, or a border attribute.
  if (el.tag === "table" && out["border-collapse"] === undefined && (el.style["border-collapse"] ?? "separate") === "separate" && separates(el)) out["border-collapse"] = "separate";
  if (out["line-height"] !== undefined) {
    const px = lineHeightPx(el.style);
    if (px !== undefined) out["line-height"] = px;
    if (px?.endsWith("px")) out["mso-line-height-rule"] = "exactly";
  }
  return out;
};

// Shown on some screens only and hidden here: the cascade gave it the display of the screens where it
// shows, so the hide is written back. Same hide as the preheader's (docs/support.md#preheader).
const HIDDEN_INLINE = { display: "none", "mso-hide": "all" };
const HIDDEN_BLOCK = { display: "none", "max-height": "0", overflow: "hidden", "mso-hide": "all" };

export type SerializeOptions = {
  // the root already sits in a cell the emitter hides (analyze's `kept`)
  rootKept?: boolean;
  // override per element (passThrough() uses it to put margin:0 on the root)
  styleOf?: (el: StyledElement, parent: ComputedStyle | undefined) => Readonly<Record<string, string>>;
};

// `parent` is the computed style of whatever will contain the html.
export const serializeStyled = (
  nodes: readonly StyledNode[],
  parent: ComputedStyle | undefined,
  opts: SerializeOptions = {},
): string => {
  const styleOf = opts.styleOf ?? ownStyle;
  const out: string[] = [];
  const walk = (n: StyledNode, parentStyle: ComputedStyle | undefined, root = false, inGuard = false): void => {
    if (n.type === "text") return void out.push(escapeText(n.text));
    if (n.type === "comment") return void out.push(`<!--${n.data}-->`);
    // a chain the template rule regrouped: its branches between markers, no tag of its own
    if (n.tag === CHAIN_TAG) {
      n.children.forEach((g, i) => {
        if (g.type !== "element") return;
        const when = g.attrs[WHEN_ATTR];
        out.push(when === undefined ? blockOpen({ op: "else" }) : `<!--tddr:${i ? "elseif" : "if"} ${when}-->`);
        for (const c of g.children) walk(c, parentStyle, false, inGuard);
      });
      return void out.push(`<!--${closeData("if")}-->`);
    }
    // data-email-each / -if / -unless on a text-level element: the ESP's block goes around it
    const blocks = readBlocks(n.attrs).blocks;
    for (const b of blocks) out.push(blockOpen(b));
    if (n.tag === GROUP_TAG) {
      for (const c of n.children) walk(c, parentStyle, false, inGuard);
      for (const b of blocks.toReversed()) out.push(blockClose(b.op));
      return;
    }
    // an inline element on a text line: Outlook shows it, everyone else never sees it
    const outlookOnly = n.attrs["data-email"] === "outlook-only";
    if (outlookOnly) out.push(OUTLOOK_ONLY_OPEN);
    // Outlook ignores display:none on an img and inside a hidden element, so it never gets the element
    const hidden = n.keep === "hidden" && !(root && opts.rootKept);
    // conditionals don't nest: inside a guard the element is hidden but not guarded again
    const guarded = hidden && !inGuard;
    if (guarded) out.push("<!--[if !mso]><!-->");
    // float on an image is also the align attribute, which is what Outlook reads; it replaces any authored one
    const float = floatOf(n);
    const attrs = Object.entries(n.attrs).filter(([k]) => k !== "style" && !k.startsWith("data-") && !(float && FLOAT_ATTRS.has(k)));
    if (float) attrs.push(["align", float], ...floatSpacing(n).attrs);
    const style = styleAttr({ ...styleOf(n, parentStyle), ...(hidden ? (isInlineLevel(n) ? HIDDEN_INLINE : HIDDEN_BLOCK) : {}) });
    if (style) attrs.push(["style", style]);
    out.push(`<${n.tag}${attrs.map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join("")}>`);
    if (!VOID.has(n.tag)) {
      for (const c of n.children) walk(c, n.style, false, inGuard || guarded);
      out.push(`</${n.tag}>`);
    }
    if (guarded) out.push("<!--<![endif]-->");
    if (outlookOnly) out.push(OUTLOOK_ONLY_CLOSE);
    for (const b of blocks.toReversed()) out.push(blockClose(b.op));
  };
  for (const n of nodes) walk(n, parent, true);
  return out.join("");
};

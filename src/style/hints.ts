// Presentational hints (HTML §15): legacy attributes as author-level CSS that every author rule beats.
// <body bgcolor text link background> and <hr color noshade size width>; vlink and alink need the
// visited state and stay unread, hr align lives in ua.ts.
import postcss from "postcss";
import { findAllElements, locOf, type DomElement } from "../parse/dom.ts";
import type { ParsedDoc } from "../parse/html.ts";
import { parseColor } from "./alpha.ts";
import type { Declare, ViewportNotes } from "./declarations.ts";
import type { InlineDecls } from "./inline.ts";

// The background attribute as a URL parser reads it (tabs and newlines dropped, spaces and controls trimmed;
// entities are already decoded), kept only when relative or http(s), cid or data:image, with every character
// that could end url("…") or the attribute it lands in percent-encoded. Anything else paints nothing.
const SAFE_SCHEME = /^(?:https?:|cid:|data:image\/)/i;
export const legacyUrl = (v: string | undefined): string | undefined => {
  const s = v?.replace(/[\t\n\r]/g, "").replace(/^[\0- ]+|[\0- ]+$/g, "");
  if (!s || (/^[a-z][a-z\d+.-]*:/i.test(s) && !SAFE_SCHEME.test(s))) return undefined;
  return s.replace(/[\0- "'()<>\\`\x7f]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
};

// The legacy colour forms templates use: #rgb, #rrggbb, rrggbb and colour names. Anything else is left out.
export const legacyColour = (v: string | undefined): string | undefined => {
  const s = v?.trim().toLowerCase();
  if (!s || s === "transparent") return undefined;
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/.test(s)) return s;
  if (/^[0-9a-f]{6}$/.test(s)) return `#${s}`;
  return /^[a-z]+$/.test(s) && parseColor(s) ? s : undefined;
};

// HTML's rules for non-negative integers and dimensions: leading digits count, "50%" stays a percentage
const integer = (v: string | undefined): number | undefined => {
  const m = /^\s*(\d+)/.exec(v ?? "");
  return m ? Number(m[1]) : undefined;
};
const dimension = (v: string | undefined): string | undefined => {
  const m = /^\s*(\d+(?:\.\d+)?)(%?)/.exec(v ?? "");
  return m && Number(m[1]) > 0 ? `${m[1]}${m[2] || "px"}` : undefined;
};

const bodyHints = (el: DomElement): string[] => {
  const a = el.attribs;
  const bg = legacyColour(a["bgcolor"]);
  const text = legacyColour(a["text"]);
  const image = legacyUrl(a["background"]);
  return [
    ...(bg ? [`background-color: ${bg}`] : []),
    ...(text ? [`color: ${text}`] : []),
    ...(image ? [`background-image: url("${image}")`] : []),
  ];
};

// As Chromium paints it: a colour (gray for noshade) fills the rule and its borders; size is the full thickness,
// a 1px border each side plus the height between (size 1 drops the bottom border).
const hrHints = (el: DomElement): string[] => {
  const a = el.attribs;
  const colour = legacyColour(a["color"]);
  const size = integer(a["size"]);
  // width="0" is 1px in Chromium, not left out
  const width = /^\s*0+\s*$/.test(a["width"] ?? "") ? "1px" : dimension(a["width"]);
  // a cell can't add its borders to a percentage: that rule is measured border-box, 2px narrower than in browsers
  const borderBox = width?.endsWith("%") === true;
  return [
    ...(colour ? [`color: ${colour}`, `border-color: ${colour}`, `background-color: ${colour}`] : a["noshade"] !== undefined ? ["border-color: gray", "background-color: gray"] : []),
    ...(size === undefined ? [] : size <= 1 ? ["border-bottom-width: 0"] : [`height: ${borderBox ? size : size - 2}px`]),
    ...(width ? [`width: ${width}`, ...(borderBox ? ["box-sizing: border-box"] : [])] : []),
  ];
};

// In document order; <body link> colours every link in it.
export const presentationalHints = (doc: ParsedDoc, declare: Declare, notes: ViewportNotes): InlineDecls[] => {
  const found: Array<{ el: DomElement; css: string[] }> = [];
  const link = legacyColour(doc.body.attribs["link"]);
  for (const el of findAllElements(doc.document, (e) => e === doc.body || e.name === "hr" || (link !== undefined && e.name === "a" && e.attribs["href"] !== undefined))) {
    const css = el === doc.body ? bodyHints(el) : el.name === "hr" ? hrHints(el) : [`color: ${link}`];
    if (css.length > 0) found.push({ el, css });
  }
  return found.map(({ el, css }) => {
    const rule = postcss.parse(`a{${css.join(";")}}`).first;
    const out: InlineDecls = { el, decls: [] };
    if (rule?.type === "rule") {
      rule.each((n) => {
        if (n.type === "decl") {
          for (const d of declare(n, () => locOf(el))) {
            notes(d, locOf(el));
            out.decls.push(d);
          }
        }
      });
    }
    return out;
  });
};

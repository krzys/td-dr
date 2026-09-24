import type { Ctx } from "../ctx.ts";
import { children, isElement, locOf, type DomElement, type DomNode } from "../parse/dom.ts";
import { TEMPLATE_ATTRS } from "./hints.ts";
import { FIELD_CLOSE, FIELD_OPEN, isWholeField } from "./tokens.ts";
import type { Report } from "./write.ts";

const STYLE_BLOCK = /<style\b[^>]*>[\s\S]*?<\/style>/gi;
const TAG = /<[a-zA-Z][^\s>/]*(?:"[^"]*"|'[^']*'|[^>"'])*>/g;
// one attribute at a time, so style= inside another attribute's value isn't read as one
const ATTR = /\s+([^\s"'>/=]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g;

const locAt = (src: string, index: number) => {
  const before = src.slice(0, index);
  const line = before.split("\n").length;
  return { line, col: index - before.lastIndexOf("\n") };
};

const COLOUR = /^(color|background-color|background|border-color|border-(top|right|bottom|left)-color)$/;
const BORDER = /^border(-(top|right|bottom|left))?$/;

// docs/templates.md#colours-from-data: the whole value of a colour property, or the colour of a border shorthand. The style
// stage carries it as an opaque colour; any other value it would have to read.
const colourField = (prop: string, value: string): boolean => {
  const v = value.replace(/\s*!important\s*$/i, "").trim();
  if (COLOUR.test(prop)) return isWholeField(v);
  if (!BORDER.test(prop)) return false;
  const parts = v.split(/\s+/).filter((p) => p.includes(FIELD_OPEN));
  return parts.length === 1 && isWholeField(parts[0]!);
};

// Offsets of the declarations in a style attribute that hold a placeholder they can't.
const badDeclarations = (css: string): number[] => {
  const out: number[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i <= css.length; i++) {
    const c = css[i];
    if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    if (i < css.length && (c !== ";" || depth > 0)) continue;
    const decl = css.slice(start, i);
    const at = decl.indexOf(FIELD_OPEN);
    const colon = decl.indexOf(":");
    if (at >= 0 && (colon < 0 || colon > at || !colourField(decl.slice(0, colon).trim().toLowerCase(), decl.slice(colon + 1)))) out.push(start + at);
    start = i + 1;
  }
  return out;
};

const STYLE_HINT =
  "A field can be the whole value of color, background-color, background, border-color or border-*-color, or the colour of a border shorthand. Anywhere else td;dr needs the real value to lower the layout: pick between fixed styles with data-email-if / -unless.";
const SHEET_HINT = "A field can be a colour only in a style attribute; a stylesheet rule can't take one. Set the colour inline, or pick between fixed classes with data-email-if / -unless.";

// Placeholders belong in text and attributes, and as a colour in a style attribute; the style
// stage needs real values to lower everything else.
export const lintPlaceholders = (src: string, ctx: Ctx): void => {
  if (ctx.options.css.some((css) => css.includes(FIELD_OPEN))) ctx.diagnostics.report("E013", { message: "Placeholder in an extra stylesheet (the css option)", hint: SHEET_HINT });
  if (!src.includes(FIELD_OPEN)) return;
  const hits: Array<[number, string]> = [];
  const blocks = [...src.matchAll(STYLE_BLOCK)].map((m) => [m.index, m.index + m[0].length] as const);
  for (const [from, to] of blocks) {
    const at = src.slice(from, to).indexOf(FIELD_OPEN);
    if (at >= 0) hits.push([from + at, SHEET_HINT]);
  }
  for (const tag of src.matchAll(TAG)) {
    if (blocks.some(([from, to]) => tag.index > from && tag.index < to)) continue;
    for (const a of tag[0].matchAll(ATTR)) {
      if (a[1]!.toLowerCase() !== "style" || !a[0].includes(FIELD_OPEN)) continue;
      const [lead, quote] = /^\s+[^\s=]+\s*=\s*(["']?)/.exec(a[0])!;
      const from = lead.length;
      const css = a[0].slice(from, quote ? -1 : undefined);
      for (const at of badDeclarations(css)) hits.push([tag.index + a.index + from + at, STYLE_HINT]);
    }
  }
  for (const [i, hint] of hits.sort((a, b) => a[0] - b[0])) ctx.diagnostics.report("E013", { hint, loc: locAt(src, i) });
};

// The writer only sees the output; a bad placeholder is looked up in the source for its location.
export const reportTemplate = (src: string, ctx: Ctx): Report => {
  const seen = new Set<string>();
  return ({ code, message, hint, token }) => {
    const key = token ?? message;
    if (seen.has(key)) return;
    seen.add(key);
    const at = token === undefined ? -1 : src.indexOf(token);
    ctx.diagnostics.report(code, { message, ...(hint ? { hint } : {}), ...(at >= 0 ? { loc: locAt(src, at) } : {}) });
  };
};

// Attributes whose value is a look, not content: td;dr needs them to lower the layout.
const PRESENTATIONAL = new Set(["bgcolor", "background", "color", "width", "height", "align", "valign", "border", "cellpadding", "cellspacing", "face", "size"]);
const ENTITY: Record<string, string> = { amp: "&", quot: '"', lt: "<", gt: ">", nbsp: "\u00a0", "#39": "'" };
const OUT_ATTR = /\s([^\s"'>/=]+)="([^"]*)"/g;
// dead-class removal may drop the other classes, so a class is judged token by token
const parts = (name: string, v: string): string[] => (name.toLowerCase() === "class" ? v.split(/\s+/).filter((c) => c.includes(FIELD_OPEN)) : [v]);
const readable = (v: string): string => v.replace(new RegExp(`${FIELD_OPEN}([^${FIELD_CLOSE}]*)${FIELD_CLOSE}`, "g"), "{{$1}}");

// Lowering keeps only the attributes a pattern needs. An attribute with a placeholder that didn't
// make it to the output (comments included: Outlook-only parts live there) would be data lost
// without a word. Counted, since one value can be written twice (a button's VML) or sit on two elements.
export const lintDropped = (body: DomElement, html: string, ctx: Ctx): void => {
  const kept = new Map<string, number>();
  for (const m of html.matchAll(OUT_ATTR)) {
    const v = m[2]!.replace(/&(amp|quot|lt|gt|nbsp|#39);/g, (_e, n: string) => ENTITY[n]!);
    if (v.includes(FIELD_OPEN)) for (const p of parts(m[1]!, v)) kept.set(p, (kept.get(p) ?? 0) + 1);
  }
  const walk = (n: DomNode): void => {
    if (!isElement(n)) return;
    for (const [name, v] of Object.entries(n.attribs)) {
      // style is E013 already, from the source
      if (!v.includes(FIELD_OPEN) || name === "style" || (TEMPLATE_ATTRS as readonly string[]).includes(name)) continue;
      const lost = parts(name, v).filter((p) => {
        const left = kept.get(p) ?? 0;
        kept.set(p, left - 1);
        return left <= 0;
      });
      if (lost.length === 0) continue;
      const message = `${name}="${readable(v)}" on <${n.name}> is dropped`;
      if (PRESENTATIONAL.has(name)) {
        ctx.diagnostics.report("E013", { message, hint: "A look can't come from the ESP: td;dr needs it to lower the layout. Pick between fixed looks with data-email-if / -unless twins.", loc: locOf(n) });
      } else {
        ctx.diagnostics.report("E012", { message, hint: "td;dr lowers this element to table markup and keeps only the attributes it needs. Put the field where it stays: text, a link's href, an image's src or alt, or an attribute of a text-level element.", loc: locOf(n) });
      }
    }
    for (const c of children(n)) walk(c);
  };
  walk(body);
};

// Emitted body html of the base and of one variant, compared tag by tag (docs/head-styles.md). Pure.
// Both are compiled with trace markers, so each tag says which author element it came from.
import type { SrcLoc } from "../loc.ts";
import { TRACE_ATTR } from "../emit/trace.ts";
import { inheritsFrom, resetFor } from "./reset.ts";

export type Tag = { name: string; closing: boolean; text: string; start: number; end: number };
export type Decls = Array<readonly [string, string]>;
export type Override = { index: number; decls: Decls };
export type Mismatch = { error: string; hint?: string; loc?: SrcLoc | undefined };
export type Diff = { overrides: Override[] } | Mismatch;
// One compile's emitted body html. `elements`: the trace markers that name author elements (a text
// run's marker names its first node, and the emitter picks one or the other by the box it builds).
export type Compiled = { html: string; elements: ReadonlySet<string> };

// Comments (MSO conditionals, ESP markers) are skipped whole: Outlook never applies head rules,
// and the markers are the same in every compile.
const TOKEN = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][^\s>/]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

export const tokenize = (html: string): Tag[] => {
  const out: Tag[] = [];
  for (const m of html.matchAll(TOKEN)) {
    if (m[2] === undefined) continue;
    out.push({ name: m[2].toLowerCase(), closing: m[1] === "/", text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return out;
};

// The emitter escapes &, " and <; author attributes come through the serializer.
const ENTITY: Readonly<Record<string, string>> = { amp: "&", quot: '"', lt: "<", gt: ">", apos: "'", nbsp: " " };
const decode = (v: string): string =>
  v.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (m, dec?: string, hex?: string, name?: string) =>
    dec ? String.fromCodePoint(Number(dec)) : hex ? String.fromCodePoint(parseInt(hex, 16)) : (ENTITY[name!.toLowerCase()] ?? m),
  );

const attrsOf = (tag: Tag): Map<string, string> => {
  const out = new Map<string, string>();
  const rest = tag.text.slice(1 + tag.name.length, -1);
  for (const m of rest.matchAll(ATTR)) out.set(m[1]!.toLowerCase(), decode(m[2] ?? m[3] ?? m[4] ?? ""));
  return out;
};

// `;` inside url(), quotes and the like doesn't split
export const parseStyle = (style: string): Decls => {
  const out: Array<readonly [string, string]> = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  const flush = (end: number): void => {
    const d = style.slice(start, end);
    const colon = d.indexOf(":");
    if (colon > 0) {
      const prop = d.slice(0, colon).trim().toLowerCase();
      const value = d.slice(colon + 1).replace(/\s*!important\s*$/i, "").trim();
      if (prop && value) out.push([prop, value]);
    }
    start = end + 1;
  };
  for (let i = 0; i < style.length; i++) {
    const c = style[i]!;
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (c === ";" && depth === 0) flush(i);
  }
  flush(style.length);
  return out;
};

const length = (v: string): string | undefined => (/^\d+(\.\d+)?$/.test(v) ? `${v}px` : /^\d+(\.\d+)?%$/.test(v) ? v : undefined);

// The presentational attributes, as the CSS they stand for. A `@` key has no declaration to take it
// back (an align on a table or image is a float or an auto margin; a width that isn't a length): it
// must be the same on every screen.
const fromAttrs = (tag: Tag, attrs: Map<string, string>): Array<[string, string]> => {
  const out: Array<[string, string]> = [];
  const add = (prop: string, v: string | undefined): void => void (v !== undefined && out.push([prop, v]));
  for (const dim of ["width", "height"]) {
    const v = attrs.get(dim);
    if (v !== undefined) add(length(v) === undefined ? `@${dim}` : dim, length(v) ?? v);
  }
  add("background-color", attrs.get("bgcolor") || undefined);
  const image = attrs.get("background");
  add("background-image", image ? `url('${image}')` : undefined);
  add("vertical-align", attrs.get("valign") || undefined);
  // floatSpacing writes the margins of a floated image this way for Outlook; they are in style="" too
  const h = length(attrs.get("hspace") ?? "");
  const v = length(attrs.get("vspace") ?? "");
  if (h) for (const side of ["left", "right"]) add(`margin-${side}`, h);
  if (v) for (const side of ["top", "bottom"]) add(`margin-${side}`, v);
  const align = attrs.get("align");
  if (align) add(tag.name === "table" || tag.name === "img" ? "@align" : "text-align", align);
  return out;
};

// A tag read once: its attributes, the CSS it carries (style="" beats the attribute it duplicates)
// and the author element it came from (its trace marker, "line:col"; undefined for wrappers).
type Read = { tag: Tag; attrs: Map<string, string>; css: Map<string, string>; source: string | undefined };

const read = (html: string): Read[] =>
  tokenize(html).map((tag) => {
    const attrs = attrsOf(tag);
    const css = new Map<string, string>(fromAttrs(tag, attrs));
    for (const [p, v] of parseStyle(attrs.get("style") ?? "")) css.set(p, v);
    return { tag, attrs, css, source: attrs.get(TRACE_ATTR) };
  });

// For each position (before token i, and after the last one), the start tag it sits in; -1 at the top.
// A closing tag closes up to its open tag: html with implied closes (<p>, <li>) would shift a plain pop.
const parentsOf = (tags: readonly Read[]): number[] => {
  const out: number[] = [];
  const open: number[] = [];
  for (let i = 0; i <= tags.length; i++) {
    out.push(open.at(-1) ?? -1);
    const t = tags[i]?.tag;
    if (!t) break;
    if (t.closing) {
      const at = open.findLastIndex((j) => tags[j]!.tag.name === t.name);
      if (at >= 0) open.length = at;
    } else if (!VOID.has(t.name)) open.push(i);
  }
  return out;
};

// The nearest start tag from `i` up (i itself included) that passes `test`.
const up = (tags: readonly Read[], parents: readonly number[], i: number, test: (t: Read) => boolean): Read | undefined => {
  for (let j = i; j >= 0; j = parents[j]!) if (tags[j] && !tags[j]!.tag.closing && test(tags[j]!)) return tags[j];
  return undefined;
};

const MARKER = new RegExp(` ${TRACE_ATTR}="[^"]*"`, "g");

const quoted = (t: Tag | undefined): string => {
  if (!t) return "nothing";
  const bare = t.text.replace(MARKER, "");
  const text = bare.length > 70 ? `${bare.slice(0, 67)}...` : bare;
  return `"${text}"`;
};

const locOf = (id: string | undefined): SrcLoc | undefined => {
  const m = id ? /^(\d+):(\d+)$/.exec(id) : null;
  return m ? { line: Number(m[1]), col: Number(m[2]) } : undefined;
};
const at = (loc: SrcLoc): string => `line ${loc.line}, column ${loc.col}`;

// One compile's tags, with the structure the checks walk.
type Side = { html: string; tags: Read[]; parents: number[]; elements: ReadonlySet<string> };
const sideOf = ({ html, elements }: Compiled): Side => {
  const tags = read(html);
  return { html, tags, parents: parentsOf(tags), elements };
};

// The author element a position belongs to: the nearest tag with an element marker, else any marker.
const ownerAt = (s: Side, i: number): Read | undefined =>
  up(s.tags, s.parents, i, (t) => t.source !== undefined && s.elements.has(t.source)) ?? up(s.tags, s.parents, i, (t) => t.source !== undefined);

// What changed text belongs to, for the message. A ::before / ::after span carries its host's marker.
const textOf = (s: Side, i: number): string => {
  const own = ownerAt(s, i);
  const loc = locOf(own?.source);
  if (!own || !loc) return "the text";
  const host = up(s.tags, s.parents, s.parents[s.tags.indexOf(own)]!, (t) => t.source !== undefined);
  if (own.tag.name === "span" && host?.source === own.source) return `the generated text (::before / ::after) of the element at ${at(loc)}`;
  return `the text in <${own.tag.name}> (from ${at(loc)})`;
};
const named = (s: Side, i: number): string => {
  const t = s.tags[i]!;
  const loc = locOf(t.source && s.elements.has(t.source) ? t.source : ownerAt(s, i)?.source);
  return loc ? `<${t.tag.name}> (from ${at(loc)})` : `<${t.tag.name}>`;
};

// The tag names and their nesting, which is all the style diff can carry.
const checkStructure = (base: Side, variant: Side, label: string): Mismatch | undefined => {
  for (let i = 0; i < Math.max(base.tags.length, variant.tags.length); i++) {
    const b = base.tags[i]?.tag;
    const v = variant.tags[i]?.tag;
    if (b && v && b.name === v.name && b.closing === v.closing) continue;
    return { error: `The ${label} rules change the layout structure: the base has ${quoted(b)} where this screen has ${quoted(v)}`, loc: locOf(ownerAt(base, Math.min(i, base.tags.length))?.source) };
  }
  return undefined;
};

// Read as CSS by `read`, or the compile's own: generated classes and trace markers.
const NOT_CONTENT = new Set(["style", "class", "width", "height", "bgcolor", "background", "valign", "align", "hspace", "vspace", TRACE_ATTR]);

// Where whitespace next to a tag can't render: a block or table boundary starts or ends the line.
const BLOCK = new Set([
  "address", "article", "aside", "blockquote", "body", "br", "caption", "center", "dd", "div", "dl", "dt", "figcaption", "figure", "footer",
  "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "nav", "ol", "p", "pre", "section", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul",
]);
const PRE = /^(pre|pre-wrap|pre-line|break-spaces)$/;
const preAt = (s: Side, i: number): boolean => PRE.test(up(s.tags, s.parents, s.parents[i]!, (t) => t.css.has("white-space"))?.css.get("white-space") ?? "");

// Text before token i (or after the last), without comments: Outlook-only content never sees a head
// rule. Exact under a pre white-space; otherwise a run of whitespace counts as one space, and none at
// a block boundary (the emitter's own line breaks around an Outlook conditional come and go with it).
const COMMENT = /<!--[\s\S]*?-->/g;
const textAt = (s: Side, i: number, exact: boolean): string => {
  const raw = s.html.slice(s.tags[i - 1]?.tag.end ?? 0, s.tags[i]?.tag.start ?? s.html.length).replace(COMMENT, "");
  if (exact) return raw;
  const edge = (t: Read | undefined): boolean => !t || BLOCK.has(t.tag.name);
  let text = raw.replace(/[ \t\n\f\r]+/g, " ");
  if (edge(s.tags[i - 1])) text = text.replace(/^ /, "");
  if (edge(s.tags[i])) text = text.replace(/ $/, "");
  return text;
};

const excerpt = (a: string, b: string): [string, string] => {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  const from = Math.max(0, i - 20);
  const cut = (s: string): string => `"${from > 0 ? "..." : ""}${decode(s.slice(from, from + 50))}${s.length > from + 50 ? "..." : ""}"`;
  return [cut(a), cut(b)];
};

const CONTENT_HINT =
  "Head rules can only change styles: the text, images, links, attributes and order of elements must be the same on every screen. Put each version in the markup and hide the others with display: none per screen.";

// What the overrides assume besides the structure: the same author element at each tag, the same text
// and the same non-presentational attributes. Run after checkStructure, so the tags line up.
const checkContent = (base: Side, variant: Side, label: string): Mismatch | undefined => {
  const fail = (what: string, i: number): Mismatch => ({ error: `The ${label} rules ${what}`, hint: CONTENT_HINT, loc: locOf(ownerAt(base, i)?.source) });
  const isElement = (s: Side, id: string | undefined): id is string => id !== undefined && s.elements.has(id);
  const order = (s: Side): string => s.tags.flatMap((t) => (!t.tag.closing && isElement(s, t.source) ? [t.source] : [])).sort().join(",");
  for (let i = 0; i <= base.tags.length; i++) {
    const exact = preAt(base, i) || preAt(variant, i);
    const text = textAt(base, i, exact);
    const now = textAt(variant, i, exact);
    if (text !== now) {
      const [was, is] = excerpt(text, now);
      return fail(`change ${textOf(base, i)}: ${was} on the base, ${is} on this screen`, i);
    }
    const b = base.tags[i];
    const v = variant.tags[i];
    if (!b || !v || b.tag.closing) continue;
    if (isElement(base, b.source) && isElement(variant, v.source) && b.source !== v.source) {
      const what = order(base) === order(variant) ? "change the order of elements" : "put another element in place";
      return fail(`${what}: the base has ${named(base, i)} where this screen has ${named(variant, i)}`, i);
    }
    for (const attr of new Set([...b.attrs.keys(), ...v.attrs.keys()])) {
      if (NOT_CONTENT.has(attr) || b.attrs.get(attr) === v.attrs.get(attr)) continue;
      const show = (x: string | undefined): string => (x === undefined ? "none" : `"${x}"`);
      return fail(`change ${attr} on ${named(base, i)}: ${show(b.attrs.get(attr))} on the base, ${show(v.attrs.get(attr))} on this screen`, i);
    }
  }
  return undefined;
};

// Per start tag, the declarations the variant changes, as the values to put on.
const styleOverrides = (base: Side, variant: Side, label: string): Diff => {
  const overrides: Override[] = [];
  for (const [i, b] of base.tags.entries()) {
    if (b.tag.closing) continue;
    const v = variant.tags[i]!;
    const decls: Array<readonly [string, string]> = [];
    for (const prop of new Set([...b.css.keys(), ...v.css.keys()])) {
      if (prop.startsWith("mso-")) continue;
      const was = b.css.get(prop);
      let now = v.css.get(prop);
      if (now === undefined && inheritsFrom(prop)) now = up(variant.tags, variant.parents, variant.parents[i]!, (t) => t.css.has(prop))?.css.get(prop);
      if (now === was) continue;
      const loc = locOf(ownerAt(base, i)?.source);
      if (prop.startsWith("@")) return { error: `The ${label} rules change the ${prop.slice(1)} attribute of ${quoted(b.tag)}, which has no CSS to take it back`, loc };
      if (now === undefined) {
        now = resetFor(b.tag.name, prop);
        if (now === undefined) return { error: `The ${label} rules drop ${prop} from ${quoted(b.tag)}, and there is no safe value to put back; set it explicitly on this screen`, loc };
      }
      decls.push([prop, now]);
    }
    if (decls.length > 0) overrides.push({ index: i, decls });
  }
  return { overrides };
};

// `label` names the variant in the message, e.g. "max-width 600px".
export const diffVariant = (baseCompile: Compiled, variantCompile: Compiled, label: string): Diff => {
  const base = sideOf(baseCompile);
  const variant = sideOf(variantCompile);
  return checkStructure(base, variant, label) ?? checkContent(base, variant, label) ?? styleOverrides(base, variant, label);
};

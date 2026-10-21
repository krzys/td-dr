// The text/plain alternative of a compiled email: what a reader of the HTML sees, in reading order.
// Headings, paragraphs and table cells become lines and blank lines, links "label (url)", images
// their alt text, lists "- " / "1. ". Hidden content (the preheader, dark and mobile variants,
// anything display:none or mso-hide:all) and Outlook-only conditionals are left out. {{ }} and {% %}
// are kept as written, so the ESP fills the text part like the HTML; a block tag between rows gets
// a line of its own, with any blank line before it, so a section that drops out takes its own away.
import { parse as parse5 } from "parse5";
import { adapter } from "parse5-htmlparser2-tree-adapter";
import { children, findElement, isComment, isElement, isText, type DomElement, type DomNode } from "../parse/dom.ts";

export const TEXT_WIDTH = 78;

const SKIP = new Set(["head", "title", "style", "script", "noscript", "template", "xml", "svg", "math", "object", "iframe"]);
// always a paragraph of their own
const PARAGRAPH = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "dl", "blockquote", "table", "hr", "pre", "figure"]);
// a paragraph when they hold one, a line otherwise
const BOX = new Set(["div", "tbody", "thead", "tfoot", "tr", "td", "th", "center", "section", "article", "header", "footer", "main", "nav", "aside", "caption", "dt", "dd", "figcaption", "address"]);
const HIDDEN = /(?:^|;)\s*(?:display\s*:\s*none|mso-hide\s*:\s*all)\s*(?:!important\s*)?(?:;|$)/i;
const DISPLAY_BLOCK = /(?:^|;)\s*display\s*:\s*(?:block|flex|grid|list-item|table)\s*(?:!important\s*)?(?:;|$)/i;

// Block tags ({{#if}}, {{/each}}, {{else}}, any {% %}) stand between rows, where the parser would
// move text out of the table; they go through as comments. A brace written as an entity next to
// a {{ }} must not turn into {{{ once it is text, so it gets a space.
const BLOCK_TAG = /(?<!\\)\{\{~?\s*(?:[#^/]|else\b)[\s\S]*?\}\}|\{%[\s\S]*?%\}/g;
const MARKUP = /<!--[\s\S]*?(?:-->|$)|<\/?[a-zA-Z](?:"[^"]*"|'[^']*'|[^'">])*>?|<[!?][^>]*>?/g;
const RAW = /^<(script|style|title|textarea)\b/i;
const TAG_MARK = "\ue012";
const OPEN_BRACE = "\ue010";
const CLOSE_BRACE = "\ue011";
const BR = "\u0001";

const protect = (html: string, tags: string[]): string => {
  const text = (s: string) => s.replace(BLOCK_TAG, (t) => `<!--${TAG_MARK}${tags.push(t) - 1}-->`);
  let out = "";
  let at = 0;
  MARKUP.lastIndex = 0;
  for (let m = MARKUP.exec(html); m; m = MARKUP.exec(html)) {
    out += text(html.slice(at, m.index)) + m[0];
    at = m.index + m[0].length;
    const raw = RAW.exec(m[0]);
    if (raw) {
      const close = html.toLowerCase().indexOf(`</${raw[1]!.toLowerCase()}`, at);
      const end = close < 0 ? html.length : close;
      out += html.slice(at, end);
      at = MARKUP.lastIndex = end;
    }
  }
  return (out + text(html.slice(at)))
    .replace(/&(?:#0*123|#[xX]0*7[bB]|lbrace|lcub);/g, OPEN_BRACE)
    .replace(/&(?:#0*125|#[xX]0*7[dD]|rbrace|rcub);/g, CLOSE_BRACE);
};

const braces = (s: string): string =>
  s
    .replace(new RegExp(`${OPEN_BRACE}(?=\\{)|(?<=\\{)${OPEN_BRACE}`, "g"), (_, i: number) => (s[i + 1] === "{" ? "{ " : " {"))
    .replace(new RegExp(`${CLOSE_BRACE}(?=\\})|(?<=\\})${CLOSE_BRACE}`, "g"), (_, i: number) => (s[i + 1] === "}" ? "} " : " }"))
    .replaceAll(OPEN_BRACE, "{")
    .replaceAll(CLOSE_BRACE, "}");

const style = (el: DomElement): string => el.attribs["style"] ?? "";
const hidden = (el: DomElement): boolean => SKIP.has(el.name) || el.name.includes(":") || "hidden" in el.attribs || HIDDEN.test(style(el));
const blockLike = (el: DomElement): boolean => PARAGRAPH.has(el.name) || BOX.has(el.name) || el.name === "li" || DISPLAY_BLOCK.test(style(el));

const holds = new WeakMap<DomNode, boolean>();
const holdsParagraph = (n: DomNode): boolean => {
  let v = holds.get(n);
  if (v === undefined) holds.set(n, (v = children(n).some((c) => isElement(c) && !hidden(c) && (PARAGRAPH.has(c.name) || holdsParagraph(c)))));
  return v;
};
const strength = (el: DomElement): number => (PARAGRAPH.has(el.name) || holdsParagraph(el) ? 2 : 1);

// Breaks at spaces only, never inside a {{ }} or {% %}, so a URL or a field stays whole.
const words = (line: string): string[] => {
  const out: string[] = [];
  let word = "";
  let inTag = "";
  for (let i = 0; i < line.length; i++) {
    const two = line.slice(i, i + 2);
    if (!inTag && (two === "{{" || two === "{%")) inTag = two === "{{" ? "}}" : "%}";
    else if (inTag && two === inTag) {
      word += two;
      i++;
      inTag = "";
      continue;
    }
    if (line[i] === " " && !inTag) {
      if (word) out.push(word);
      word = "";
    } else word += line[i];
  }
  if (word) out.push(word);
  return out;
};

const wrap = (line: string, width: number): string[] => {
  if (line.length <= width) return [line];
  const out: string[] = [];
  let cur = "";
  for (const w of words(line)) {
    if (cur && cur.length + 1 + w.length > width) {
      out.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  return cur ? [...out, cur] : out;
};

type Part = { lines: string[]; gap: number; wrapped: boolean };
type State = { tags: string[]; lastHref?: string | undefined; inLink: boolean };

// Lines and the gap before each run of them: 1 a line break, 2 a blank line, the larger of what
// the two sides ask for. After a block tag the next line follows directly.
class Out {
  private parts: Part[] = [];
  private run = "";
  private gap = 0;
  private locked = false;
  constructor(
    readonly st: State,
    readonly width: number,
  ) {}

  text(s: string): void {
    this.run += s;
  }

  brk(n: number): void {
    this.flush();
    if (!this.locked) this.gap = Math.max(this.gap, n);
  }

  push(lines: string[], before: number, after: number, opts: { tag?: boolean; wrapped?: boolean } = {}): void {
    this.flush();
    if (!lines.length) return;
    this.parts.push({ lines, gap: this.locked ? this.gap : Math.max(this.gap, before), wrapped: opts.wrapped ?? true });
    this.gap = opts.tag ? 1 : after;
    this.locked = opts.tag ?? false;
  }

  private flush(): void {
    const lines = tidy(this.run.replace(/[ \t\n\r\f]+/g, " ").split(BR));
    this.run = "";
    if (!lines.length) return;
    this.parts.push({ lines, gap: this.gap, wrapped: false });
    this.gap = 0;
    this.locked = false;
  }

  lines(): string[] {
    this.flush();
    const out: string[] = [];
    for (const p of this.parts) {
      if (out.length && p.gap > 1) out.push("");
      for (const l of p.lines) out.push(...(p.wrapped || !l ? [l] : wrap(l, this.width)));
    }
    return out;
  }
}

// trimmed lines, blank runs made one, none at either end; a line of only &nbsp; or
// zero-width characters is blank
const EDGE = /^[ \u00a0\u200b\u200c\u2060\ufeff\u034f\u00ad]+|[ \u00a0\u200b\u200c\u2060\ufeff\u034f\u00ad]+$/g;
const tidy = (lines: string[]): string[] => {
  const out: string[] = [];
  for (const raw of lines) {
    const l = raw.replace(EDGE, "");
    if (l || (out.length && out.at(-1) !== "")) out.push(l);
  }
  while (out.at(-1) === "") out.pop();
  return out;
};

const sub = (st: State, width: number, render: (o: Out) => void): string[] => {
  const o = new Out(st, width);
  render(o);
  return o.lines();
};

// what a link points at, as a reader would type it
const bare = (url: string): string =>
  url
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:(?:\/\/)?/, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");

const linkText = (label: string, href: string): string => {
  const h = href.trim();
  if (!h || h.startsWith("#") || /^javascript:/i.test(h)) return label;
  const contact = /^(mailto|tel|sms):([^?]*)/i.exec(h);
  if (contact) {
    const address = decodeURIComponent(contact[2]!);
    // a number written the local way is the same number: 0131 555 0192 is +44 131 555 0192
    const digits = label.replace(/\D/g, "").replace(/^0+/, "");
    const same =
      contact[1]!.toLowerCase() === "mailto"
        ? label.toLowerCase() === address.toLowerCase()
        : digits.length >= 6 && address.replace(/\D/g, "").endsWith(digits);
    return !label ? address : same ? label : `${label} (${address})`;
  }
  return !label || bare(label) === bare(h) ? h : `${label} (${h})`;
};

const NO_MARKER = /(?:^|;)\s*list-style(?:-type)?\s*:\s*none\b/i;
const marker = (list: DomElement, li: DomElement, n: number): string =>
  NO_MARKER.test(style(li)) || (NO_MARKER.test(style(list)) && !/list-style/i.test(style(li))) ? "" : list.name === "ol" ? `${n}. ` : "- ";

const sibling = (n: DomNode, dir: -1 | 1): DomNode | undefined => {
  const all = n.parent ? children(n.parent) : [];
  for (let i = all.indexOf(n as never) + dir; i >= 0 && i < all.length; i += dir) {
    const s = all[i]!;
    if (isText(s) && !s.data.trim()) continue;
    if (isComment(s) && !s.data.startsWith(TAG_MARK)) continue;
    return s;
  }
  return undefined;
};
const inline = (n: DomNode | undefined): boolean => !!n && (isText(n) || (isElement(n) && !hidden(n) && !blockLike(n)));
// a tag beside a tag beside text is in that text too: {{/if}}{{/each}} after a word ends its line
const inlineSide = (n: DomNode, dir: -1 | 1): boolean => {
  let s = sibling(n, dir);
  while (s && isComment(s)) s = sibling(s, dir);
  return inline(s);
};

const renderChildren = (n: DomNode, o: Out): void => {
  for (const c of children(n)) render(c, o);
};

const render = (n: DomNode, o: Out): void => {
  const { st } = o;
  if (isText(n)) {
    if (!st.inLink && n.data.trim()) st.lastHref = undefined;
    o.text(n.data);
    return;
  }
  if (isComment(n)) {
    if (!n.data.startsWith(TAG_MARK)) return;
    const tag = st.tags[Number(n.data.slice(TAG_MARK.length))] ?? "";
    if (inlineSide(n, -1) || inlineSide(n, 1)) o.text(tag);
    else o.push([tag], 1, 1, { tag: true });
    return;
  }
  if (!isElement(n) || hidden(n)) return;
  const el = n;
  switch (el.name) {
    case "br":
      o.text(BR);
      return;
    case "img": {
      const alt = el.attribs["alt"]?.trim();
      const spacer = Number(el.attribs["width"]) <= 1 || Number(el.attribs["height"]) <= 1;
      if (!alt || spacer) return;
      if (!st.inLink) st.lastHref = undefined;
      o.text(` ${alt} `);
      return;
    }
    case "a": {
      const href = el.attribs["href"] ?? "";
      const inLink = st.inLink;
      st.inLink = true;
      const label = sub(st, Infinity, (s) => renderChildren(el, s))
        .filter(Boolean)
        .join(" ");
      st.inLink = inLink;
      const repeat = href !== "" && href === st.lastHref;
      const text = repeat ? label : linkText(label, href);
      if (href) st.lastHref = href;
      const block = DISPLAY_BLOCK.test(style(el));
      if (block) o.brk(1);
      o.text(text);
      if (block) o.brk(1);
      return;
    }
    case "h1":
    case "h2": {
      const lines = sub(st, o.width, (s) => renderChildren(el, s));
      const rule = (el.name === "h1" ? "=" : "-").repeat(Math.min(o.width, Math.max(0, ...lines.map((l) => l.length))));
      o.push(lines.length ? [...lines, rule] : [], 2, 2);
      return;
    }
    case "ul":
    case "ol": {
      const ol = el.name === "ol";
      let n = ol ? Number.parseInt(el.attribs["start"] ?? "1", 10) || 1 : 1;
      const gap = hasAncestor(el, "li") ? 1 : 2;
      o.brk(gap);
      for (const li of children(el)) {
        if (!isElement(li) || li.name !== "li" || hidden(li)) {
          render(li, o);
          continue;
        }
        const mark = marker(el, li, n++);
        const pad = " ".repeat(mark.length);
        const lines = sub(st, o.width - mark.length, (s) => renderChildren(li, s));
        o.push(lines.length ? lines.map((l, i) => (i === 0 ? mark + l : l ? pad + l : l)) : [mark.trimEnd()], 1, 1);
      }
      o.brk(gap);
      return;
    }
    case "tr":
      if (row(el, o)) return;
      break;
  }
  const s = blockLike(el) ? strength(el) : 0;
  if (s) o.brk(s);
  renderChildren(el, o);
  if (s) o.brk(s);
};

const hasAncestor = (el: DomElement, name: string): boolean => {
  for (let p = el.parent; p; p = p.parent) if (isElement(p) && p.name === name) return true;
  return false;
};

// A row of short cells, like a label and its amount, reads as one line.
const row = (tr: DomElement, o: Out): boolean => {
  const cells = children(tr).filter((c) => !(isText(c) && !c.data.trim()) && !(isComment(c) && !c.data.startsWith(TAG_MARK)));
  if (cells.length < 2 || !cells.every((c) => isElement(c) && (c.name === "td" || c.name === "th"))) return false;
  if (cells.some((c) => !hidden(c as DomElement) && holdsParagraph(c))) return false;
  const texts = cells.map((c) => sub(o.st, Infinity, (s) => render(c, s)));
  if (texts.some((t) => t.length > 1)) {
    for (const t of texts) o.push(t, 1, 1, { wrapped: false });
    return true;
  }
  // a data table keeps its empty cells, so each value stays under its column
  const table = closest(tr, "table");
  const data = !!table && table.attribs["role"] !== "presentation" && !!findElement(table, (e) => e.name === "th");
  const line = data ? texts.map((t) => t[0] ?? "") : texts.flat().filter(Boolean);
  o.push(line.some(Boolean) ? [line.join(data ? " | " : " ")] : [], 1, 1, { wrapped: false });
  return true;
};

const closest = (el: DomElement, name: string): DomElement | undefined => {
  for (let p = el.parent; p; p = p.parent) if (isElement(p) && p.name === name) return p;
  return undefined;
};

export const toText = (html: string): string => {
  const st: State = { tags: [], inLink: false };
  const doc = parse5(protect(html, st.tags), { treeAdapter: adapter });
  const body = findElement(doc, (el) => el.name === "body") ?? doc;
  const lines = sub(st, TEXT_WIDTH, (o) => renderChildren(body, o));
  const text = lines.join("\n").replace(/\u00a0/g, " ");
  return text ? `${braces(text)}\n` : "";
};

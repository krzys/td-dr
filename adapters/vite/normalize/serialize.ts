// One line per node, indented, so a difference points at a line. Formatting whitespace, attribute
// order and escapes are spelled one way; everything else is written as it is.
import { children, isComment, isElement, isText, type DomElement, type DomNode } from "../../../src/parse/dom.ts";
import { type Gaps, styleOf } from "./boxes.ts";

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

// not \s: a non-breaking space is content
const collapse = (s: string): string => s.replace(/[ \t\r\n\f]+/g, " ");

// the space in `Hello <b>Ada</b>` is content; at the edge of a block it is only formatting
const INLINE = new Set([
  ...["a", "b", "i", "u", "s", "em", "strong", "span", "small", "big", "sub", "sup", "code", "font", "abbr", "mark", "label"],
  ...["img", "q", "cite", "dfn", "kbd", "samp", "var", "del", "ins", "strike", "tt", "time", "bdi", "bdo"],
]);
// an element's own display decides (inline-block divs, a block image); without one, its tag does
const inlineElement = (el: DomElement): boolean => {
  const d = styleOf(el).findLast(([p]) => p === "display");
  return d ? /^(?:inline|none|contents)/.test(d[1].toLowerCase()) : INLINE.has(el.name);
};
const inline = (n: DomNode | undefined): boolean => !!n && (isText(n) || (isElement(n) && inlineElement(n)));
// a comment shows nothing, so the space beside one meets whatever is past it
const beside = (kids: DomNode[], i: number, step: 1 | -1): DomNode | undefined => {
  let j = i + step;
  while (kids[j] && isComment(kids[j]!)) j += step;
  return kids[j];
};

// never into < or >: inside an MSO comment `&lt;td&gt;` is text and `<td>` is markup
const NAMED: Record<string, string> = { amp: "&", quot: '"', apos: "'", nbsp: "\u00a0" };
// comments aren't decoded by the parser, but engines escape inside them too
const decode = (s: string): string =>
  s.replace(/&(?:#x([0-9a-f]+)|#(\d+)|(\w+));/gi, (all, hex?: string, dec?: string, name?: string) => {
    if (name) return NAMED[name.toLowerCase()] ?? all;
    const c = String.fromCodePoint(hex ? parseInt(hex, 16) : Number(dec));
    return c === "<" || c === ">" ? all : c;
  });

// preformatted text keeps its spaces and line breaks; a line break is spelled so it stays on one line
const PRE = new Set(["pre", "textarea", "listing", "xmp", "plaintext"]);
const preformatted = (el: DomElement, inherited: boolean): boolean => {
  const ws = styleOf(el).findLast(([p]) => p === "white-space");
  return ws ? /^(?:pre|break-spaces)/.test(ws[1].toLowerCase()) : inherited || PRE.has(el.name);
};
const verbatim = (s: string): string => s.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll("\t", "\\t");

// class is a list of names and style ignores spaces outside quotes; any other value is kept as written
const QUOTED = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/;
const attrValue = (name: string, v: string): string => {
  if (name === "class") return collapse(v).trim();
  if (name === "style") return v.split(QUOTED).map((part, i) => (i % 2 ? part : collapse(part))).join("").trim();
  return verbatim(v);
};

const escape = (s: string): string => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

// A cell's gap is printed after its attributes; ` [gap ...]` can't be read from any attribute, which prints as name="value".
export const serialize = (root: DomNode, gaps: Gaps): string => {
  const lines: string[] = [];
  const walk = (n: DomNode, depth: number, pre: boolean): void => {
    const pad = "  ".repeat(depth);
    const kids = children(n);
    kids.forEach((c, i) => {
      if (isText(c) && pre) {
        if (c.data) lines.push(pad + escape(verbatim(c.data)));
      } else if (isText(c)) {
        let t = collapse(c.data);
        if (!inline(beside(kids, i, -1))) t = t.replace(/^ /, "");
        if (!inline(beside(kids, i, 1))) t = t.replace(/ $/, "");
        if (t) lines.push(pad + escape(t));
      } else if (isComment(c)) {
        lines.push(`${pad}<!--${collapse(decode(c.data)).trim()}-->`);
      } else if (isElement(c)) {
        const attrs = Object.entries(c.attribs)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, v]) => ` ${k}="${escape(attrValue(k, v))}"`)
          .join("");
        const gap = gaps.get(c);
        lines.push(`${pad}<${c.name}${attrs}${gap ? ` [gap ${gap.join(" ")}]` : ""}>`);
        if (!VOID.has(c.name)) {
          walk(c, depth + 1, preformatted(c, pre));
          lines.push(`${pad}</${c.name}>`);
        }
      }
    });
  };
  walk(root, 0, false);
  return lines.join("\n");
};

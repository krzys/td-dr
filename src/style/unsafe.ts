// CSS that runs script or loads what a URL attribute couldn't (docs/support.md#sanitizing).
import { badScheme, URL_HINT, type UrlUse } from "../sanitize/urls.ts";
import { unescape } from "./pseudo.ts";

// IE's HTC behaviours and Firefox's XBL bindings load script.
const SCRIPT_PROPS = new Set(["behavior", "-ms-behavior", "-moz-binding"]);
// an identifier, escapes and all: `u\72l` is url
const IDENT = /(?:[\w-]|\\[0-9a-f]{1,6}[ \t\n]?|\\[^\n0-9a-f])+/iy;
const URL_FN = /^(-[a-z]+-)?(url|src)$/;
const IMAGE_SET = /^(-[a-z]+-)?image-set$/;
const COMMENT = /\/\*[\s\S]*?\*\//g;
// Token by token: an escape stays, a comment goes, and a string holds no call
// (`font-family: 'Expression (Display)'`); an unclosed string runs to the end of its line.
const NOT_CALL = /\\[\s\S]|\/\*[\s\S]*?\*\/|"(?:[^"\\\n]|\\[\s\S])*"?|'(?:[^'\\\n]|\\[\s\S])*'?/g;
const calls = (v: string): string => v.replace(NOT_CALL, (m) => (m[0] === "\\" ? m : m[0] === "/" ? "" : " "));

// A URL in a value and the span that goes when it does: its url() or src() call or, inside an
// image-set(), the whole set. `broken`: a bad-url token (`url(a(b))`), which voids the declaration.
type Found = { url: string; start: number; end: number; broken?: boolean };

// Reads a value the way a CSS tokenizer does, so a string (`content: "url(x)"`) or a comment
// holds no URL, except the bare strings image-set() takes.
const scan = (v: string): Found[] => {
  const out: Found[] = [];
  const open: boolean[] = []; // per open function: is it an image-set()
  let set: { start: number; depth: number; found: Found[] } | undefined;
  const string = (at: number): [string, number] => {
    let j = at + 1;
    while (j < v.length && v[j] !== v[at]) j += v[j] === "\\" ? 2 : 1;
    return [unescape(v.slice(at + 1, j)), j + 1];
  };
  const found = (url: string, start: number, end: number, broken = false) => (set ? set.found : out).push({ url, start, end, broken });
  for (let i = 0; i < v.length; ) {
    const ch = v[i]!;
    if (ch === '"' || ch === "'") {
      const [s, end] = string(i);
      if (set) found(s, i, end);
      i = end;
    } else if (ch === "/" && v[i + 1] === "*") {
      const e = v.indexOf("*/", i + 2);
      i = e < 0 ? v.length : e + 2;
    } else if (ch === "(") {
      open.push(false);
      i++;
    } else if (ch === ")") {
      open.pop();
      i++;
      if (set && open.length === set.depth) {
        out.push(...set.found.map((f) => ({ ...f, start: set!.start, end: i })));
        set = undefined;
      }
    } else {
      IDENT.lastIndex = i;
      const m = IDENT.exec(v);
      if (!m) {
        i++;
        continue;
      }
      const start = i;
      i += m[0].length;
      if (v[i] !== "(") continue;
      const name = unescape(m[0]).toLowerCase();
      i++;
      if (URL_FN.test(name)) {
        while (/\s/.test(v[i] ?? "")) i++;
        const quoted = v[i] === '"' || v[i] === "'";
        let url = "";
        if (quoted) [url, i] = string(i);
        let j = i;
        while (j < v.length && v[j] !== ")") j += v[j] === "\\" ? 2 : 1;
        const raw = v.slice(i, j).trim();
        if (!quoted) url = unescape(raw);
        i = Math.min(j + 1, v.length);
        // unquoted, a quote, paren or inner space makes it a bad-url token
        found(url, start, i, !quoted && /["'(\s]/.test(raw));
        continue;
      }
      if (!set && IMAGE_SET.test(name)) set = { start, depth: open.length, found: [] };
      open.push(false);
    }
  }
  if (set) out.push(...set.found.map((f) => ({ ...f, start: set!.start, end: v.length })));
  return out;
};

export const cssUrls = (value: string): string[] => scan(value).map((f) => f.url);

// `value`: the declaration with its bad URLs gone; without one the whole declaration goes.
export type Unsafe = { message: string; hint?: string | undefined; value?: string };

const badUrls = (value: string, use: UrlUse) =>
  scan(value).flatMap((f) => {
    const scheme = badScheme(f.url, use);
    return scheme === undefined ? [] : [{ ...f, scheme }];
  });

// Why a declaration (or descriptor) has to change, or undefined. `use` is what its url()s load.
// A bad URL becomes `none`, so `background: #eee url(javascript:x)` keeps its colour.
export const unsafeDecl = (prop: string, value: string, use: UrlUse = "image"): Unsafe | undefined => {
  const p = prop.toLowerCase();
  if (SCRIPT_PROPS.has(p)) return { message: `Removed ${p}: it loads script` };
  // old IE read expr/**/ession() as expression(), so comments go first
  if (/expression\s*\(/i.test(unescape(calls(value)))) return { message: `Removed ${p}: expression() runs script` };
  const bare = value.replace(COMMENT, "");
  const bad = badUrls(value, use);
  if (bad.length === 0) {
    // a parser that drops comments first reads `url(java\/**/script:x)` as javascript:
    const hidden = badUrls(bare, use)[0];
    return hidden && { message: `Removed ${p}: ${hidden.scheme}: URL`, hint: URL_HINT };
  }
  const message = `Removed ${p}: ${bad[0]!.scheme}: URL`;
  if (bad.some((b) => b.broken)) return { message, hint: URL_HINT };
  let rest = value;
  const spans = [...new Map(bad.map((b) => [b.start, b])).values()].sort((a, b) => b.start - a.start);
  for (const s of spans) rest = rest.slice(0, s.start) + "none" + rest.slice(s.end);
  // `url(a.png), url(javascript:x)` keeps a.png; anything still unsafe goes whole
  return { message, hint: URL_HINT, ...(unsafeDecl(p, rest, use) ? {} : { value: rest }) };
};

// Syntax colours for the code panel and the data editor. tokenize() returns [class, text] pairs
// that join back to the input exactly; class null is plain text.

/** @typedef {[cls: string | null, text: string]} Token */
/** @typedef {"html" | "json"} Lang */

const TPL = /\{\{\{[\s\S]*?\}\}\}|\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g;

// template tags can sit anywhere: text, attribute values, CSS values
/** @param {Token[]} out @param {string | null} cls @param {string} text */
const withTpl = (out, cls, text) => {
  let at = 0;
  for (const m of text.matchAll(TPL)) {
    if (m.index > at) push(out, cls, text.slice(at, m.index));
    push(out, "tpl", m[0]);
    at = m.index + m[0].length;
  }
  if (at < text.length) push(out, cls, text.slice(at));
};

/** @param {Token[]} out @param {string | null} cls @param {string} text */
const push = (out, cls, text) => {
  if (!text) return;
  const last = out[out.length - 1];
  // runs of plain text read better as one node; classed tokens stay apart
  if (last && last[0] === null && cls === null) last[1] += text;
  else out.push([cls, text]);
};

/** @param {Token[]} out @param {string} text */
const textPart = (out, text) => {
  let at = 0;
  for (const m of text.matchAll(/&(?:#\d+|#x[\da-f]+|[a-z]\w*);/gi)) {
    withTpl(out, null, text.slice(at, m.index));
    push(out, "ent", m[0]);
    at = m.index + m[0].length;
  }
  withTpl(out, null, text.slice(at));
};

const VALUE = /("[^"]*"|'[^']*')|(#[\da-f]{3,8}\b|-?\d*\.?\d+(?:[a-z]+|%)?)|(!important)/gi;

/** @param {Token[]} out @param {string} text */
const cssValue = (out, text) => {
  let at = 0;
  for (const m of text.matchAll(VALUE)) {
    // a number inside a word (h1, x2) is part of the word
    if (m[2] && m.index > 0 && /[\w-]/.test(text[m.index - 1] ?? "") && !m[2].startsWith("#")) continue;
    withTpl(out, null, text.slice(at, m.index));
    push(out, m[1] ? "str" : m[2] ? "num" : "kw", m[0]);
    at = m.index + m[0].length;
  }
  withTpl(out, null, text.slice(at));
};

/** @param {Token[]} out @param {string} text */
const css = (out, text) => {
  let at = 0;
  while (at < text.length) {
    const ws = /^\s+/.exec(text.slice(at));
    if (ws) {
      push(out, null, ws[0]);
      at += ws[0].length;
      continue;
    }
    if (text.startsWith("/*", at)) {
      const end = text.indexOf("*/", at + 2);
      const stop = end < 0 ? text.length : end + 2;
      push(out, "com", text.slice(at, stop));
      at = stop;
      continue;
    }
    if (text[at] === "}") {
      push(out, "punct", "}");
      at++;
      continue;
    }
    // a statement runs to the first { ; or }: a { makes it a selector or an at-rule prelude
    const rest = text.slice(at);
    const stop = rest.search(/[{};]/);
    const chunk = stop < 0 ? rest : rest.slice(0, stop);
    const end = stop < 0 ? "" : (rest[stop] ?? "");
    const body = chunk.trimEnd();
    if (chunk.startsWith("@")) {
      const kw = /^@[\w-]+/.exec(chunk)?.[0] ?? "@";
      push(out, "at", kw);
      cssValue(out, chunk.slice(kw.length));
    } else if (end === "{") {
      withTpl(out, "sel", body);
      push(out, null, chunk.slice(body.length));
    } else {
      const colon = chunk.indexOf(":");
      if (colon < 0) withTpl(out, null, chunk);
      else {
        withTpl(out, "prop", chunk.slice(0, colon));
        push(out, "punct", ":");
        cssValue(out, chunk.slice(colon + 1));
      }
    }
    if (end === "{" || end === ";") push(out, "punct", end);
    at += chunk.length + (end === "}" ? 0 : end.length);
  }
};

const ATTR = /^(\s+)|^([^\s=>/"']+)|^(=)|^("[^"]*"?|'[^']*'?)|^(\/?>)|^(\/)/;

// from just after the tag name to the end of the tag; returns where it stopped
/** @param {Token[]} out @param {string} text @param {number} from */
const attrs = (out, text, from) => {
  let at = from;
  let afterEq = false;
  while (at < text.length) {
    const rest = text.slice(at);
    const tpl = /^(?:\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\})/.exec(rest);
    if (tpl) {
      push(out, "tpl", tpl[0]);
      at += tpl[0].length;
      continue;
    }
    const m = ATTR.exec(rest);
    if (!m) {
      push(out, null, rest[0] ?? "");
      at++;
      continue;
    }
    at += m[0].length;
    if (m[1]) push(out, null, m[1]);
    else if (m[2]) {
      if (afterEq) withTpl(out, "str", m[2]);
      else push(out, "attr", m[2]);
    } else if (m[3]) push(out, "punct", "=");
    else if (m[4]) withTpl(out, "str", m[4]);
    else if (m[5]) {
      push(out, "punct", m[5]);
      return at;
    } else push(out, "punct", "/");
    afterEq = !!m[3];
  }
  return at;
};

const MSO = /^(?:<!--\[if [^\]]*\]>(?:<!-->)?|<!(?:--)?\[endif\]-->|<!--<!\[endif\]-->)/i;

/** @param {string} text */
const html = (text) => {
  /** @type {Token[]} */
  const out = [];
  let at = 0;
  while (at < text.length) {
    const lt = text.indexOf("<", at);
    if (lt < 0) {
      textPart(out, text.slice(at));
      break;
    }
    textPart(out, text.slice(at, lt));
    at = lt;
    const rest = text.slice(at);
    const mso = MSO.exec(rest);
    if (mso) {
      push(out, "mso", mso[0]);
      at += mso[0].length;
      continue;
    }
    if (rest.startsWith("<!--")) {
      const end = text.indexOf("-->", at + 4);
      const stop = end < 0 ? text.length : end + 3;
      push(out, "com", text.slice(at, stop));
      at = stop;
      continue;
    }
    const decl = /^<![^>]*>?/.exec(rest);
    if (decl) {
      push(out, "doctype", decl[0]);
      at += decl[0].length;
      continue;
    }
    const tag = /^(<\/?)([a-zA-Z][\w:-]*)/.exec(rest);
    if (!tag) {
      textPart(out, "<");
      at++;
      continue;
    }
    const [whole, open = "", name = ""] = tag;
    push(out, "punct", open);
    push(out, "tag", name);
    at = attrs(out, text, at + whole.length);
    // a stylesheet's text is CSS up to its end tag
    if (open === "<" && name.toLowerCase() === "style") {
      const end = text.slice(at).search(/<\/style/i);
      const stop = end < 0 ? text.length : at + end;
      css(out, text.slice(at, stop));
      at = stop;
    }
  }
  return out;
};

const JSON_TOKEN = /("(?:\\.|[^"\\])*")(?=\s*:)|("(?:\\.|[^"\\])*"?)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],:])/g;

/** @param {string} text */
const json = (text) => {
  /** @type {Token[]} */
  const out = [];
  let at = 0;
  for (const m of text.matchAll(JSON_TOKEN)) {
    push(out, null, text.slice(at, m.index));
    push(out, m[1] ? "key" : m[2] ? "str" : m[3] ? "num" : m[4] ? "kw" : "punct", m[0]);
    at = m.index + m[0].length;
  }
  push(out, null, text.slice(at));
  return out;
};

/** @param {string} text @param {Lang} lang @returns {Token[]} */
export const tokenize = (text, lang) => (lang === "json" ? json(text) : html(text));

// past this, colouring costs more than it helps
const LIMIT = 600_000;

/** @param {HTMLElement} el @param {string} text @param {Lang} lang */
export const paint = (el, text, lang) => {
  if (text.length > LIMIT) return void (el.textContent = text);
  const frag = document.createDocumentFragment();
  for (const [cls, t] of tokenize(text, lang)) {
    if (!cls) frag.append(t);
    else {
      const s = document.createElement("span");
      s.className = `t-${cls}`;
      s.textContent = t;
      frag.append(s);
    }
  }
  el.replaceChildren(frag);
};

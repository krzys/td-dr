// A display-only pretty printer for the code panel (compiled HTML, ESP templates, source markup).
// It may only change whitespace: the result is checked against the input and, if anything else
// differs, the original text is shown instead. Copy and Download never use it.

const VOID = new Set("area base br col embed hr img input link meta param source track wbr".split(" "));
// text-level elements stay on the line of their text; everything else (tables, divs, head…) gets its own lines
const INLINE = new Set(
  "a abbr acronym b bdi bdo big cite code del dfn em font i ins kbd label mark q s samp small span strike strong sub sup tt u var img br wbr button input select".split(" "),
);
// content that must stay exactly as written
const RAWTEXT = new Set(["script", "style", "textarea", "pre"]);
const WIDTH = 140;
// email tables nest 30+ deep; the cap only stops runaway input
const MAX_DEPTH = 64;

/** @typedef {{ k: string, s: number, e: number, name?: string, self?: boolean }} Tok */
/** @typedef {{ tok: Tok, kids: Node[] }} Branch */
// el (open, close, kids), tpl (branches, close, kids = the last branch's) or a leaf
/** @typedef {{ kind: string, s: number, e?: number, name?: string | undefined, open?: Tok, close?: Tok | null, kids?: Node[], branches?: Branch[], inl?: boolean }} Node */
/** @typedef {{ text: string, ok: boolean, locate: (line: number, col: number) => { line: number, col: number } }} Formatted */

const TPL_OPEN = new Set("if unless for case capture tablerow comment raw form paginate".split(" "));
const TPL_MID = new Set(["else", "elsif", "when"]);

// end of a start tag, skipping quoted values and {{ }} / {% %} (which may hold a >)
/** @param {string} t @param {number} i */
const tagEnd = (t, i) => {
  let quote = "";
  for (; i < t.length; i++) {
    const c = t[i];
    if (quote) {
      if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === "{" && (t[i + 1] === "{" || t[i + 1] === "%")) {
      const e = t.indexOf(t[i + 1] === "{" ? "}}" : "%}", i + 2);
      if (e >= 0) i = e + 1;
    } else if (c === ">") return i + 1;
  }
  return t.length;
};

/** @param {string} t @param {number} i @returns {Tok} */
const tplToken = (t, i) => {
  const handlebars = t[i + 1] === "{";
  const close = t.startsWith("{{{", i) ? "}}}" : t.startsWith("{{!--", i) ? "--}}" : handlebars ? "}}" : "%}";
  const x = t.indexOf(close, i + 2);
  if (x < 0) return { k: "tpl", s: i, e: i + 2 };
  const e = x + close.length;
  const body = t.slice(i + 2, x).replace(/^[~-]|[~-]$/g, "").trim();
  const word = (/** @type {string} */ s) => /^[^\s}]+/.exec(s)?.[0].replace(/^[>*]/, "") ?? "";
  if (handlebars) {
    if (body.startsWith("#")) return { k: "open", name: word(body.slice(1).trim()), s: i, e };
    if (body.startsWith("/")) return { k: "close", name: word(body.slice(1).trim()), s: i, e };
    if (/^else\b/.test(body) || body === "^") return { k: "mid", s: i, e };
    return { k: "tpl", s: i, e };
  }
  const w = /^[A-Za-z_]+/.exec(body)?.[0] ?? "";
  if (TPL_OPEN.has(w)) return { k: "open", name: w, s: i, e };
  if (w.startsWith("end") && TPL_OPEN.has(w.slice(3))) return { k: "close", name: w.slice(3), s: i, e };
  if (TPL_MID.has(w)) return { k: "mid", s: i, e };
  return { k: "tpl", s: i, e };
};

/** @param {string} t */
const tokenize = (t) => {
  const lower = t.toLowerCase();
  /** @type {Tok[]} */
  const toks = [];
  let text = -1;
  const flush = (/** @type {number} */ to) => {
    if (text >= 0 && to > text) toks.push({ k: "text", s: text, e: to });
    text = -1;
  };
  let i = 0;
  while (i < t.length) {
    const c = t[i];
    if (c === "<") {
      if (t.startsWith("<!--", i)) {
        flush(i);
        const x = t.startsWith("<!-->", i) ? i + 2 : t.startsWith("<!--->", i) ? i + 3 : t.indexOf("-->", i + 4);
        const e = x < 0 ? t.length : x + 3;
        toks.push({ k: "comment", s: i, e });
        i = e;
        continue;
      }
      if (t[i + 1] === "!" || t[i + 1] === "?") {
        flush(i);
        const x = t.indexOf(">", i);
        const e = x < 0 ? t.length : x + 1;
        toks.push({ k: "doctype", s: i, e });
        i = e;
        continue;
      }
      const m = /^<(\/?)([A-Za-z][^\s/>]*)/.exec(t.slice(i, i + 100));
      if (m) {
        flush(i);
        const e = tagEnd(t, i + m[0].length);
        const name = (m[2] ?? "").toLowerCase();
        const self = !m[1] && t[e - 2] === "/" && t[e - 1] === ">";
        toks.push({ k: m[1] ? "end" : "start", name, s: i, e, self });
        i = e;
        if (!m[1] && RAWTEXT.has(name) && !self) {
          const x = lower.indexOf(`</${name}`, i);
          const to = x < 0 ? t.length : x;
          if (to > i) toks.push({ k: "raw", s: i, e: to });
          i = to;
        }
        continue;
      }
    } else if (c === "{" && (t[i + 1] === "{" || t[i + 1] === "%")) {
      flush(i);
      const tok = tplToken(t, i);
      toks.push(tok);
      i = tok.e;
      continue;
    }
    if (text < 0) text = i;
    i++;
  }
  flush(t.length);
  return toks;
};

// Nodes: el, tpl (a {{#x}}…{{/x}} block with branches), and leaves. Mismatched closers become
// leaves and unclosed openers end with their parent, so odd input never throws.
/** @param {Tok[]} toks */
const build = (toks) => {
  /** @type {Node} */
  const root = { kind: "root", s: 0, kids: [] };
  /** @type {Node[]} */
  const stack = [root];
  const top = () => /** @type {Node} */ (stack[stack.length - 1]);
  const add = (/** @type {Node} */ n) => kidsOf(top()).push(n);
  /** @param {(n: Node) => boolean} pred */
  const find = (pred) => {
    for (let i = stack.length - 1; i > 0; i--) if (pred(/** @type {Node} */ (stack[i]))) return i;
    return -1;
  };
  const at = (/** @type {number} */ i) => /** @type {Node} */ (stack[i]);
  for (const tok of toks) {
    switch (tok.k) {
      case "start": {
        /** @type {Node} */
        const n = { kind: "el", name: tok.name, open: tok, kids: [], close: null, s: tok.s };
        add(n);
        if (!VOID.has(tok.name ?? "") && !tok.self) stack.push(n);
        break;
      }
      case "end": {
        const i = find((n) => n.kind === "el" && n.name === tok.name);
        if (i < 0) add({ kind: "leaf", s: tok.s, e: tok.e });
        else {
          at(i).close = tok;
          stack.length = i;
        }
        break;
      }
      case "open": {
        /** @type {Branch} */
        const first = { tok, kids: [] };
        /** @type {Node} */
        const n = { kind: "tpl", name: tok.name, branches: [first], close: null, s: tok.s };
        n.kids = first.kids;
        add(n);
        stack.push(n);
        break;
      }
      case "mid": {
        const i = find((n) => n.kind === "tpl");
        if (i < 0) add({ kind: "leaf", s: tok.s, e: tok.e });
        else {
          const n = at(i);
          stack.length = i + 1;
          /** @type {Branch} */
          const b = { tok, kids: [] };
          n.branches?.push(b);
          n.kids = b.kids;
        }
        break;
      }
      case "close": {
        const i = find((n) => n.kind === "tpl" && n.name === tok.name);
        if (i < 0) add({ kind: "leaf", s: tok.s, e: tok.e });
        else {
          at(i).close = tok;
          stack.length = i;
        }
        break;
      }
      case "raw":
        add({ kind: "rawtext", s: tok.s, e: tok.e });
        break;
      default:
        add({ kind: tok.k, s: tok.s, e: tok.e });
    }
  }
  return root;
};

const kidsOf = (/** @type {Node} */ n) => /** @type {Node[]} */ (n.kids);
const branchesOf = (/** @type {Node} */ n) => /** @type {Branch[]} */ (n.branches);
const endOf = (/** @type {Node} */ n) => /** @type {number} */ (n.e);

/** @param {Node} n */
const finish = (n) => {
  const kids = n.kind === "tpl" ? branchesOf(n).flatMap((b) => b.kids) : (n.kids ?? []);
  for (const k of kids) finish(k);
  if (n.e === undefined && n.kind !== "root") {
    const closeEnd = n.close?.e;
    const last = kids[kids.length - 1];
    n.e = closeEnd ?? Math.max(last?.e ?? 0, n.open?.e ?? n.branches?.[0]?.tok.e ?? 0);
  }
};

const allKids = (/** @type {Node} */ n) => (n.kind === "tpl" ? branchesOf(n).flatMap((b) => b.kids) : kidsOf(n));

/** @param {Node} n @returns {boolean} */
const inline = (n) => {
  if (n.inl !== undefined) return n.inl;
  let r;
  if (n.kind === "text" || n.kind === "tpl1") r = true;
  else if (n.kind === "el") r = INLINE.has(n.name ?? "") && allKids(n).every(inline);
  else if (n.kind === "tpl") r = allKids(n).every(inline);
  else r = n.kind === "tpl";
  n.inl = r;
  return r;
};

/** @param {string} css */
const cssLines = (css) => {
  /** @type {[depth: number, text: string][]} */
  const lines = [];
  let depth = 0;
  let buf = "";
  let quote = "";
  let paren = 0;
  const push = (/** @type {string} */ s, /** @type {number} */ d) => s && lines.push([d, s]);
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (quote) {
      buf += c;
      if (c === quote) quote = "";
    } else if (c === "/" && css[i + 1] === "*") {
      const x = css.indexOf("*/", i + 2);
      const e = x < 0 ? css.length : x + 2;
      buf += css.slice(i, e);
      i = e - 1;
    } else if (c === '"' || c === "'") {
      quote = c;
      buf += c;
    } else if (c === "(") {
      paren++;
      buf += c;
    } else if (c === ")") {
      paren = Math.max(0, paren - 1);
      buf += c;
    } else if (c === "{" && paren === 0) {
      push(`${buf.trim()} {`, depth++);
      buf = "";
    } else if (c === "}" && paren === 0) {
      push(buf.trim(), depth);
      depth = Math.max(0, depth - 1);
      push("}", depth);
      buf = "";
    } else if (c === ";" && paren === 0) {
      push(`${buf.trim()};`, depth);
      buf = "";
    } else buf += c;
  }
  push(buf.trim(), depth);
  return lines;
};

const strip = (/** @type {string} */ s) => s.replace(/\s+/g, "");

const starts = (/** @type {string} */ t) => {
  const a = [0];
  for (let i = 0; i < t.length; i++) if (t.charCodeAt(i) === 10) a.push(i + 1);
  return a;
};

/** @param {number[]} a @param {number} off */
const lineOf = (a, off) => {
  let lo = 0;
  let hi = a.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (/** @type {number} */ (a[mid]) <= off) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, col: off - /** @type {number} */ (a[lo]) };
};

/** @param {string} text @returns {Formatted} */
const identity = (text) => ({ text, ok: false, locate: (line, col) => ({ line, col }) });

// `locate(line, col)` turns a 1-based line and 0-based column of the original into the same spot in `text`
/** @param {string} src @returns {Formatted} */
export const format = (src) => {
  if (!src || src.length > 2_000_000) return identity(src ?? "");
  try {
    const root = build(tokenize(src).map((t) => (t.k === "tpl" ? { ...t, k: "tpl1" } : t)));
    finish(root);
    let out = "";
    /** @type {{ o: number, len: number, n: number, linear: boolean }[]} */
    const pieces = [];
    const indent = (/** @type {number} */ d) => "  ".repeat(Math.min(d, MAX_DEPTH));
    // a verbatim slice of the source, trimmed at both ends
    /** @param {number} d @param {number} s @param {number} e */
    const slice = (d, s, e, linear = true) => {
      while (s < e && /\s/.test(src[s] ?? "")) s++;
      while (e > s && /\s/.test(src[e - 1] ?? "")) e--;
      if (e <= s) return;
      pieces.push({ o: s, len: e - s, n: out.length + indent(d).length, linear });
      out += `${indent(d)}${src.slice(s, e)}\n`;
    };
    /** @param {Node[]} list @param {number} d */
    const kids = (list, d) => {
      /** @type {{ s: number, e: number } | null} */
      let run = null;
      const flush = () => {
        if (run) slice(d, run.s, run.e);
        run = null;
      };
      for (const n of list) {
        if (inline(n)) run = run ? { s: run.s, e: endOf(n) } : { s: n.s, e: endOf(n) };
        else {
          flush();
          node(n, d);
        }
      }
      flush();
    };
    /** @param {Node} n @param {number} d @returns {void} */
    const node = (n, d) => {
      if (n.kind === "tpl") {
        for (const b of branchesOf(n)) {
          slice(d, b.tok.s, b.tok.e);
          kids(b.kids, d + 1);
        }
        if (n.close) slice(d, n.close.s, n.close.e);
        return;
      }
      if (n.kind !== "el") return slice(d, n.s, endOf(n));
      const whole = src.slice(n.s, n.e);
      const open = /** @type {Tok} */ (n.open);
      const body = kidsOf(n)[0];
      if (n.name === "style" && n.close && kidsOf(n).length === 1 && body?.kind === "rawtext" && !/\{\{|\{%/.test(whole)) {
        slice(d, open.s, open.e);
        const first = out.length;
        for (const [ld, text] of cssLines(src.slice(body.s, body.e))) out += `${indent(d + 1 + ld)}${text}\n`;
        pieces.push({ o: body.s, len: endOf(body) - body.s, n: first, linear: false });
        slice(d, n.close.s, n.close.e);
        return;
      }
      if (RAWTEXT.has(n.name ?? "") || (kidsOf(n).every(inline) && !whole.includes("\n") && whole.length <= WIDTH)) return slice(d, n.s, endOf(n));
      slice(d, open.s, open.e);
      kids(kidsOf(n), d + 1);
      if (n.close) slice(d, n.close.s, n.close.e);
    };
    kids(kidsOf(root), 0);
    // anything but whitespace changed (a bug here, not in the email): show the original
    if (strip(out) !== strip(src)) return identity(src);
    const text = out.replace(/\n$/, "");
    const from = starts(src);
    const to = starts(text);
    /** @param {number} line @param {number} col */
    const locate = (line, col) => {
      const off = (from[line - 1] ?? 0) + col;
      let lo = 0;
      let hi = pieces.length - 1;
      let at = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (/** @type {(typeof pieces)[number]} */ (pieces[mid]).o <= off) {
          at = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      const p = pieces[at];
      const n = !p ? 0 : off < p.o + p.len ? (p.linear ? p.n + off - p.o : p.n) : (pieces[at + 1]?.n ?? text.length);
      return lineOf(to, Math.min(n, text.length));
    };
    return { text, ok: true, locate };
  } catch {
    return identity(src);
  }
};

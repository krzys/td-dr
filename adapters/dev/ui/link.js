// Ties elements in a rendered frame to the start tags in the code that produced them, and the
// views to each other. The browser and this scanner both walk the same text in document order, so
// the n-th start tag is the n-th element, except for elements the parser makes up (tbody, html…).
//
// Everything is joined through the index of a start tag of the compiled `input` (the Source tab),
// "s". The compiler's trace says which s each start tag of the compiled text came from.

/** @typedef {{ i: number, tag: string, start: number, end: number, parent: number, line: number, col: number, endLine: number, endCol: number }} Tag */
/** @typedef {{ tags: Tag[], starts: number[] }} Scan */
/** @typedef {{ line: number, col: number } | null | undefined} TraceEntry */
/** @typedef {{ start: number, end: number, tag: number, s: number, k: number }} Field */
/** @typedef {{ line: number, col: number }} Pos */
// what the frame helpers read of a document and its elements, so they run on hand-made ones too
/**
 * @typedef {{
 *   localName: string,
 *   classList: { contains: (c: string) => boolean },
 *   textContent: string | null,
 *   parentElement: El | null,
 *   getAttribute?: (name: string) => string | null,
 * }} El
 */
/** @template {El} [E=El] @typedef {{ querySelectorAll: (selector: string) => Iterable<E> }} Doc */
/**
 * @template {El} [E=El]
 * @typedef {{
 *   sOf: (el: E) => number,
 *   byS: Map<number, E[]>,
 *   byTag: (E | null)[],
 *   tagOf: (el: E) => number,
 *   nearest: (el: E) => E | null,
 *   copyOf: (el: E) => number,
 *   sizeOf: (el: E) => number,
 * }} Frame
 */

const RAW = new Set(["script", "style", "textarea", "title"]);
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

// start tags with their position; comments (including Outlook conditionals) and doctypes are skipped.
// `parent` is the enclosing start tag (end tags close it; the markup is not assumed to be tidy).
/** @param {string} text @returns {Scan} */
export const scanTags = (text) => {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  const at = (/** @type {number} */ i) => lineCol({ starts, tags: [] }, i);
  const lower = text.toLowerCase();
  /** @type {Tag[]} */
  const tags = [];
  /** @type {number[]} */
  const open = [];
  const re = /<!--(?:>|->)|<!--[\s\S]*?-->|<[!?][^>]*>|<\/([a-zA-Z][^\s/>]*)|<([a-zA-Z][^\s/>]*)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) {
      const name = m[1].toLowerCase();
      const k = open.findLastIndex((t) => tags[t]?.tag === name);
      if (k >= 0) open.length = k;
      continue;
    }
    if (!m[2]) continue;
    const tag = m[2].toLowerCase();
    let j = m.index + m[0].length;
    let quote = "";
    for (; j < text.length; j++) {
      const c = text[j];
      if (quote) {
        if (c === quote) quote = "";
      } else if (c === '"' || c === "'") quote = c;
      else if (c === ">") break;
    }
    const end = Math.min(j + 1, text.length);
    const from = at(m.index);
    const to = at(end - 1);
    const i = tags.length;
    tags.push({ i, tag, start: m.index, end, parent: open.at(-1) ?? -1, line: from.line, col: from.col, endLine: to.line, endCol: to.col + 1 });
    if (!VOID.has(tag) && text[end - 2] !== "/") open.push(i);
    re.lastIndex = end;
    // what sits inside <style> or <title> isn't markup
    if (RAW.has(tag)) {
      const close = lower.indexOf(`</${tag}`, end);
      if (close >= 0) re.lastIndex = close;
    }
  }
  return { tags, starts };
};

// the start tag at or before a position in the code (1-based line, 0-based column); -1 before the first
/** @param {Scan} scan @param {number} line @param {number} col */
export const tagAt = ({ tags, starts }, line, col) => {
  const from = starts[line - 1];
  if (line < 1 || from === undefined) return -1;
  return tagBefore(tags, from + Math.max(0, col));
};

// the start tag at or before an offset in the text
/** @param {Tag[]} tags @param {number} pos */
export const tagBefore = (tags, pos) => {
  let lo = 0;
  let hi = tags.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (/** @type {Tag} */ (tags[mid]).start <= pos) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
};

// line and 0-based column of an offset
/** @param {Scan} scan @param {number} offset @returns {Pos} */
export const lineCol = ({ starts }, offset) => {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (/** @type {number} */ (starts[mid]) <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, col: offset - /** @type {number} */ (starts[lo]) };
};

// our own additions to a frame (chips, their stylesheet, filled-field wrappers) aren't in the code
/** @param {El} el */
const foreign = (el) => el.localName === "tddr-f" || el.classList.contains("tddr-chip") || (el.localName === "style" && !!el.textContent?.startsWith(".tddr-chip"));

// pairs each element of `doc` with its start tag; elements the parser invented pair with nothing
/** @template {El} E @param {Doc<E>} doc @param {Tag[]} tags */
export const align = (doc, tags) => {
  /** @type {Map<E, Tag>} */
  const byEl = new Map();
  /** @type {(E | null)[]} */
  const byTag = new Array(tags.length).fill(null);
  let next = 0;
  for (const el of doc.querySelectorAll("*")) {
    if (foreign(el)) continue;
    const limit = Math.min(tags.length, next + 4);
    for (let k = next; k < limit; k++) {
      const tag = /** @type {Tag} */ (tags[k]);
      if (tag.tag !== el.localName) continue;
      byEl.set(el, tag);
      byTag[k] = el;
      next = k + 1;
      break;
    }
  }
  return { byEl, byTag };
};

// ---- the compiler's trace

// For each start tag of the compiled text, the index of the start tag of `input` it was made from, or -1.
// A trace entry names the tag exactly (1-based line and column, as diagnostics do).
/** @param {TraceEntry[]} trace @param {Scan} input @returns {number[]} */
export const traceSources = (trace, input) => {
  const byStart = new Map(input.tags.map((t) => [t.start, t.i]));
  return trace.map((e) => (e ? (byStart.get((input.starts[e.line - 1] ?? -1) + e.col - 1) ?? -1) : -1));
};

// the first tag of each source tag, e.g. where it sits in the template
/** @param {number[]} sources */
export const firstTags = (sources) => {
  /** @type {Map<number, number>} */
  const out = new Map();
  sources.forEach((s, i) => {
    if (s >= 0 && !out.has(s)) out.set(s, i);
  });
  return out;
};

// The tag of `scan` made from source tag `s`: the one named `name` if there is one (the cell and the
// element a source tag became share it; only the like-named one is the element itself), else the first. -1: none.
/** @param {number[]} sources @param {Scan} scan @param {number} s @param {string | undefined} name */
export const pickTag = (sources, scan, s, name) => {
  let first = -1;
  for (let i = 0; i < sources.length; i++) {
    if (sources[i] !== s) continue;
    if (scan.tags[i]?.tag === name) return i;
    if (first < 0) first = i;
  }
  return first;
};

// The nearest tag at or above `i` (by enclosing tags) that has a source, as [tag, source]; null when none does.
/** @param {Scan} scan @param {number[]} sources @param {number} i @returns {[tag: number, source: number] | null} */
export const mapped = (scan, sources, i) => {
  for (let t = i; t >= 0; t = parentOf(scan, t)) {
    const s = sources[t] ?? -1;
    if (s >= 0) return [t, s];
  }
  return null;
};

// the enclosing start tag of tag `t`; -1 at the top
/** @param {Scan} scan @param {number} t */
export const parentOf = (scan, t) => scan.tags[t]?.parent ?? -1;

// For fieldTable on the Source text: <tddr-if> and friends compile to block tags, so text inside one
// belongs to the element around it, as it does in the template.
/** @param {Scan} scan @returns {(i: number) => number} */
export const ownsFields = (scan) => (i) => (scan.tags[i]?.tag.startsWith("tddr-") ? -1 : i);

// The nearest source tag at or above `s` (enclosing tags count) that `has` says the other side shows; -1 when none.
/** @param {Scan} scan @param {number} s @param {(t: number) => boolean} has */
export const nearestWith = (scan, s, has) => {
  for (let t = s; t >= 0; t = parentOf(scan, t)) if (has(t)) return t;
  return -1;
};

// ---- fields: the placeholders in text (not in tags, comments or raw-text elements)

// {{ ... }} of either dialect, or the private-use pair the compiler works with
// not a block tag, a literal, or a brace the author escaped (`\{{{ x }}}` holds no placeholder)
export const TPL_FIELD = /(?<![\\{])\{\{(?![#/^!>~&{]|\s*else\b|\s*["'])[^{}]*\}\}/;
const FIELDS = {
  tpl: TPL_FIELD,
  raw: /[^]*/,
};

// Every placeholder with the tag its text belongs to: the nearest tag above it (enclosing tags count)
// that `sourceOf` gives a source, and its position among that tag's own placeholders.
/** @param {string} text @param {Scan} scan @param {keyof typeof FIELDS} style @param {(tag: number) => number} sourceOf @returns {Field[]} */
export const fieldTable = (text, scan, style, sourceOf) => {
  const found = new RegExp(`<!--[\\s\\S]*?-->|<[!?][^>]*>|</[^>]*>|(${FIELDS[style].source})`, "g");
  const lower = text.toLowerCase();
  /** @type {Map<number, number>} */
  const counts = new Map();
  /** @type {Field[]} */
  const out = [];
  scan.tags.forEach((t, i) => {
    let from = t.end;
    // a raw-text element's content is not markup; the text after it is
    if (RAW.has(t.tag)) {
      const close = lower.indexOf(`</${t.tag}`, from);
      if (close >= 0) from = (text.indexOf(">", close) + 1) || text.length;
    }
    const to = scan.tags[i + 1]?.start ?? text.length;
    if (from >= to) return;
    let g = i;
    while (g >= 0 && sourceOf(g) < 0) g = parentOf(scan, g);
    if (g < 0) return;
    for (const m of text.slice(from, to).matchAll(found)) {
      if (m[1] === undefined) continue;
      const k = counts.get(g) ?? 0;
      counts.set(g, k + 1);
      out.push({ start: from + m.index, end: from + m.index + m[0].length, tag: g, s: sourceOf(g), k });
    }
  });
  return out;
};

// the placeholder with this source tag and position, if the text has one
/** @param {Field[]} table @param {number} s @param {number} k */
export const findField = (table, s, k) => table.find((f) => f.s === s && f.k === k);

// ---- frames

// What a frame's elements are, in terms of source tags. `by`: "s" (data-tddr-s), "t" (data-tddr-t,
// a start tag of the template, through `sources`), or "tags" (the n-th element is the n-th tag of
// `scan`, whose tag i is source `sources[i]`, or i itself without `sources`). With `by` "s" or "t",
// a `scan` still pairs the elements with their tags in some code text (the filled html).
/**
 * @template {El} E
 * @param {Doc<E>} doc
 * @param {{ by: "s" | "t" | "tags", scan?: Scan | undefined, sources?: number[] | undefined }} o
 * @returns {Frame<E>}
 */
export const describeFrame = (doc, { by, scan, sources }) => {
  const aligned = scan ? align(doc, scan.tags) : { byEl: /** @type {Map<E, Tag>} */ (new Map()), byTag: /** @type {(E | null)[]} */ ([]) };
  /** @type {Map<E, number>} */
  const own = new Map();
  /** @param {E} el @returns {number} */
  const sOf = (el) => {
    if (!own.has(el)) {
      let s = -1;
      if (by === "tags") {
        const tag = aligned.byEl.get(el);
        s = tag ? (sources ? (sources[tag.i] ?? -1) : tag.i) : -1;
      } else {
        const v = el.getAttribute?.(by === "s" ? "data-tddr-s" : "data-tddr-t");
        s = v === null || v === undefined ? -1 : by === "s" ? Number(v) : (sources?.[Number(v)] ?? -1);
      }
      own.set(el, s);
    }
    return /** @type {number} */ (own.get(el));
  };
  // elements of each source tag, in document order: the copies a loop makes
  /** @type {Map<number, E[]>} */
  const byS = new Map();
  for (const el of doc.querySelectorAll("*")) {
    if (foreign(el)) continue;
    const s = sOf(el);
    if (s < 0) continue;
    const list = byS.get(s);
    if (list) list.push(el);
    else byS.set(s, [el]);
  }
  return {
    sOf,
    byS,
    byTag: aligned.byTag,
    tagOf: (el) => aligned.byEl.get(el)?.i ?? -1,
    // the nearest element at or above `el` with a source
    nearest: (el) => {
      // the parents of an element of `doc` are elements of it too
      for (let n = /** @type {E | null} */ (el); n; n = /** @type {E | null} */ (n.parentElement)) if (!foreign(n) && sOf(n) >= 0) return n;
      return null;
    },
    // the repeats of `el` in this frame: elements of its source tag with its tag name (a table
    // and its cells share a source; only the like ones are copies of each other)
    copyOf: (el) => like(byS, sOf(el), el.localName).indexOf(el),
    sizeOf: (el) => like(byS, sOf(el), el.localName).length,
  };
};

// the elements of source tag `s` that are alike: of tag name `prefer` if there are any, else of the
// name of the first (the outermost one the source tag was made into)
/** @template {El} E @param {Frame<E>} frame @param {number} s @param {string | undefined} [prefer] */
export const copiesOf = (frame, s, prefer) => {
  const all = frame.byS.get(s) ?? [];
  return like(frame.byS, s, all.some((e) => e.localName === prefer) ? prefer : all[0]?.localName);
};

/** @template {El} E @param {Map<number, E[]>} byS @param {number} s @param {string | undefined} name */
const like = (byS, s, name) => (byS.get(s) ?? []).filter((e) => e.localName === name);

// The element to show for source tag `s`: the copy at `copy` when the frame has as many copies as
// `size` (so position means the same), else the first. `prefer`: the tag name to look for first.
/**
 * @template {El} E
 * @param {Frame<E>} frame @param {number} s @param {number | undefined} copy @param {number | undefined} size @param {string | undefined} [prefer]
 * @returns {E | undefined}
 */
export const pickCopy = (frame, s, copy, size, prefer) => {
  const els = copiesOf(frame, s, prefer);
  return els.length > 0 && copy !== undefined && copy >= 0 && els.length === size ? els[copy] : els[0];
};

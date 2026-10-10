// Click-to-locate across the views, as data. A click in a frame or in a code tab becomes a
// selection { s, copy, field }: s is a start tag of the Source tab's text (what the compiler's trace
// points at), copy which repeat of a loop, field which placeholder. plan() says what that selection
// boxes in each frame and marks in the code. No DOM here: crossview.js reads the page and draws.
import {
  copiesOf,
  describeFrame,
  fieldTable,
  findField,
  firstTags,
  lineCol,
  mapped,
  nearestWith,
  ownsFields,
  parentOf,
  pickCopy,
  pickTag,
  scanTags,
  tagAt,
  traceSources,
} from "./link.js";

/** @typedef {import("../protocol.ts").RenderResponse} RenderResponse */
/** @typedef {import("./link.js").El} El */
/** @typedef {import("./link.js").Field} Field */
/** @typedef {import("./link.js").Scan} Scan */
/** @typedef {import("./code.js").CodeTab} CodeTab */
/** @typedef {import("./code.js").Range} Range */
/** @typedef {import("./preview.js").FrameKind} FrameKind */
/** @template {El} E @typedef {import("./link.js").Doc<E>} Doc */
/** @template {El} E @typedef {import("./link.js").Frame<E> & { fieldEls: Map<E, Field>, fieldCopies: (s: number, k: number) => E[] }} NavFrame */

/**
 * @typedef {{
 *   r: RenderResponse,
 *   input: Scan,
 *   sources: number[] | null,
 *   dialect: boolean,
 *   first: Map<number, number> | null,
 *   table: (kind: FrameKind) => Field[] | null,
 * }} Model
 */

/**
 * @template {El} E
 * @typedef {{
 *   from: FrameKind | "tab",
 *   s: number,
 *   up?: number,
 *   el?: E,
 *   tag?: string | undefined,
 *   copy?: number | undefined,
 *   size?: number | undefined,
 *   field?: { s: number, k: number },
 *   wrapper?: E,
 *   fcopy?: number,
 *   fsize?: number,
 *   exact?: E | undefined,
 *   only?: Partial<Record<FrameKind, E>>,
 *   at?: { tab: CodeTab, range: Range | undefined },
 * }} Selection
 */

/**
 * @template {El} E
 * @typedef {{
 *   boxes: Record<FrameKind, { el: E | undefined, label: string | undefined }>,
 *   code: { tab: CodeTab, range: Range } | null,
 *   fromFrame: boolean,
 * }} Plan
 */

/**
 * What the page reads for a plan: the last render, the frames as built so far, the code tabs' text.
 * @template {El} E
 * @typedef {{
 *   model: () => Model | null,
 *   frame: (kind: FrameKind) => NavFrame<E> | null,
 *   doc: (kind: FrameKind) => Doc<E> | null,
 *   shown: (tab: CodeTab) => string,
 *   tab: () => CodeTab,
 *   fields: () => boolean,
 *   narrow: () => boolean,
 * }} NavContext
 */

const KINDS = /** @type {const} */ (["source", "compiled"]);
const CODE_TABS = /** @type {const} */ (["source", "template", "compiled"]);

/** @param {RenderResponse} r @returns {Model} */
export const createModel = (r) => {
  const input = scanTags(r.input ?? r.source);
  const sources = r.trace ? traceSources(r.trace, input) : null;
  const dialect = r.template !== undefined;
  /** @type {Partial<Record<FrameKind, Field[] | null>>} */
  const tables = {};
  return {
    r,
    input,
    sources,
    dialect,
    first: sources && firstTags(sources),
    // placeholders as the frames name them (offsets in the compiled input / in the template)
    table: (kind) => {
      const hit = tables[kind];
      if (hit !== undefined) return hit;
      if (kind === "source") return (tables.source = fieldTable(r.input ?? r.source, input, "raw", ownsFields(input)));
      const tpl = r.template;
      return (tables.compiled = dialect && sources && tpl !== undefined ? fieldTable(tpl, scanTags(tpl), "tpl", (t) => /** @type {number} */ (sources[t])) : null);
    },
  };
};

// The frames' elements in terms of source tags. Frames showing the code's own markup line up by
// n-th tag; filled ones carry what they were made from.
/**
 * @template {El} E
 * @param {FrameKind} kind @param {Doc<E>} doc @param {Model} m
 * @param {{ fields: boolean, scanOf: (tab: CodeTab) => Scan }} o
 * @returns {NavFrame<E> | null}
 */
export const buildFrame = (kind, doc, m, { fields, scanOf }) => {
  const r = m.r;
  /** @type {import("./link.js").Frame<E> | null} */
  let frame = null;
  if (kind === "source") {
    if (!m.dialect) frame = describeFrame(doc, { by: "tags", scan: m.input });
    else if (fields) frame = describeFrame(doc, { by: "tags", scan: scanOf("source") });
    else if (r.sourceShown !== undefined) frame = describeFrame(doc, { by: "s" });
  } else if (m.sources) {
    if (!m.dialect) frame = describeFrame(doc, { by: "tags", scan: scanOf("compiled"), sources: m.sources });
    else if (fields) frame = describeFrame(doc, { by: "tags", scan: scanOf("template"), sources: m.sources });
    else if (r.htmlShown !== undefined) frame = describeFrame(doc, { by: r.filled === "engine" ? "t" : "s", scan: scanOf("compiled"), sources: m.sources });
  }
  if (!frame) return null;
  // filled fields and field chips say where their placeholder is in the text they came from
  const table = kind === "source" ? (m.dialect && !fields ? m.table("source") : null) : m.table("compiled");
  const at = new Map((table ?? []).map((f) => [f.start, f]));
  /** @type {Map<E, Field>} */
  const fieldEls = new Map();
  for (const el of doc.querySelectorAll("[data-tddr-f]")) {
    const f = at.get(Number(el.getAttribute?.("data-tddr-f")));
    if (f) fieldEls.set(el, f);
  }
  /** @param {number} s @param {number} k */
  const same = (s, k) => [...fieldEls].filter(([, f]) => f.s === s && f.k === k).map(([el]) => el);
  return { ...frame, fieldEls, fieldCopies: same };
};

// where in a code tab a selection is, as a range of lines and columns
/** @param {Scan} scan @param {number} start @param {number} end @returns {Range} */
export const rangeOf = (scan, start, end) => {
  const a = lineCol(scan, start);
  const b = lineCol(scan, end);
  return { line: a.line, col: a.col, endLine: b.line, endCol: b.col };
};

// tabs to try when the shown one has no match, nearest to where the click came from first
/** @param {FrameKind | "tab"} from @param {boolean} fields @returns {CodeTab[]} */
export const tabOrder = (from, fields) =>
  from === "source" ? ["source", "template", "compiled"] : fields ? ["template", "source", "compiled"] : ["compiled", "template", "source"];

/** @template {El} E @param {NavContext<E>} ctx */
export const createNavigator = (ctx) => {
  /** @type {Map<CodeTab, { text: string, scan: Scan }>} */
  const scans = new Map();
  /** @param {CodeTab} tab */
  const scanOf = (tab) => {
    const text = ctx.shown(tab);
    const hit = scans.get(tab);
    if (hit?.text === text) return hit.scan;
    const scan = scanTags(text);
    scans.set(tab, { text, scan });
    return scan;
  };

  // the tag of `tab` that a compiled-frame element is, when the frame shows that very text (or an annotated copy of it)
  /** @param {CodeTab} tab @param {E | undefined} el */
  const exactTag = (tab, el) => {
    const f = ctx.frame("compiled");
    const m = ctx.model();
    if (!el || !f || !m) return -1;
    if (tab === "compiled") return m.dialect ? -1 : f.tagOf(el);
    if (ctx.fields()) return f.tagOf(el);
    const v = m.r.filled === "engine" && m.r.htmlShown !== undefined ? (el.getAttribute?.("data-tddr-t") ?? null) : null;
    return v === null ? -1 : Number(v);
  };

  /** @param {CodeTab} tab @param {Selection<E>} sel @param {Partial<Record<FrameKind, E>>} picks @param {Model} m */
  const spot = (tab, sel, picks, m) => {
    if (sel.at?.tab === tab) return sel.at.range;
    const scan = scanOf(tab);
    if (scan.tags.length === 0) return null;
    if (sel.field && (tab === "source" || tab === "template")) {
      const sourceOf = tab === "source" ? ownsFields(scan) : (/** @type {number} */ t) => m.sources?.[t] ?? -1;
      const f = findField(fieldTable(ctx.shown(tab), scan, "tpl", sourceOf), sel.field.s, sel.field.k);
      if (f) return rangeOf(scan, f.start, f.end);
    }
    let i = -1;
    if (tab === "source") i = sel.s;
    else if (tab === "template" || (tab === "compiled" && !m.dialect)) {
      // the element's own tag when the frame is made from this text; else the tag of that name, not its wrapping cell
      i = exactTag(tab, picks.compiled);
      if (i < 0 && m.sources) i = pickTag(m.sources, scan, sel.up ?? sel.s, picks.compiled?.localName ?? sel.tag);
    }
    // the filled html: the very element the frame shows for it (a copy of a loop has its own tag)
    else if (tab === "compiled" && !ctx.fields() && picks.compiled) i = ctx.frame("compiled")?.tagOf(picks.compiled) ?? -1;
    return scan.tags[i] ?? null;
  };

  // the compiled frame's element for tag `t` of a tab it is made from; the first copy in a loop
  /** @param {CodeTab} tab @param {number} t @returns {E | undefined} */
  const exactIn = (tab, t) => {
    const f = ctx.frame("compiled");
    const m = ctx.model();
    if (!f || !m) return undefined;
    if (tab === "compiled" ? !m.dialect : ctx.fields()) return f.byTag[t] ?? undefined;
    if (tab !== "template" || m.r.filled !== "engine" || m.r.htmlShown === undefined) return undefined;
    const doc = ctx.doc("compiled");
    if (!doc) return undefined;
    for (const el of doc.querySelectorAll(`[data-tddr-t="${t}"]`)) return el;
    return undefined;
  };

  /**
   * What a selection boxes in each frame and marks in the code. It also settles `sel.up`: a source
   * tag the compiled side has no element for (a folded wrapper, a hidden element) stands for its
   * nearest ancestor there.
   * @param {Selection<E>} sel
   * @returns {Plan<E>}
   */
  const plan = (sel) => {
    /** @type {Partial<Record<FrameKind, E>>} */
    const picks = {};
    /** @type {Partial<Record<FrameKind, E>>} */
    const marks = {};
    const m = ctx.model();
    const compiled = ctx.frame("compiled");
    const has = (/** @type {number} */ t) => !!(m?.first?.has(t) || compiled?.byS.has(t));
    sel.up = m && sel.s >= 0 && sel.from !== "compiled" ? nearestWith(m.input, sel.s, has) : sel.s;
    if (sel.up < 0) sel.up = sel.s;
    const up = sel.up;
    for (const kind of KINDS) {
      const f = ctx.frame(kind);
      if (!f) continue;
      const pick = sel.only
        ? sel.only[kind]
        : kind === "compiled" && sel.exact
          ? sel.exact
          : sel.from === kind
            ? sel.el
            : pickCopy(f, kind === "compiled" ? up : sel.s, sel.copy, sel.size, sel.tag);
      if (pick) picks[kind] = pick;
      if (sel.field) {
        const list = f.fieldCopies(sel.field.s, sel.field.k);
        const mark = sel.from === kind ? sel.wrapper : list.length > 0 && sel.fcopy !== undefined && list.length === sel.fsize ? list[sel.fcopy] : list[0];
        if (mark) marks[kind] = mark;
      }
    }
    const fromFrame = sel.from !== "tab";
    /** @type {Plan<E>["boxes"]} */
    const boxes = { source: { el: undefined, label: undefined }, compiled: { el: undefined, label: undefined } };
    for (const kind of KINDS) {
      const f = ctx.frame(kind);
      const el = marks[kind] ?? picks[kind];
      // from the code the copy isn't known: say how many there are
      const n = f ? copiesOf(f, kind === "compiled" ? up : sel.s, sel.tag).length : 0;
      boxes[kind] = { el, label: el && !fromFrame && !marks[kind] && n > 1 ? `${el.localName} ×${n}` : undefined };
    }
    // a phone has no room to show the code beside the email
    const shown = ctx.tab();
    const order = [shown, ...(ctx.narrow() || !fromFrame ? [] : tabOrder(sel.from, ctx.fields()).filter((t) => t !== shown))];
    for (const tab of order) {
      const range = m && spot(tab, sel, picks, m);
      if (range) return { boxes, code: { tab, range }, fromFrame };
    }
    return { boxes, code: null, fromFrame };
  };

  /**
   * A click on an element (or a filled field) in a frame. `wrapper`: the filled field around the
   * target, if any. null: the frame has nothing linked there.
   * @param {FrameKind} kind @param {E} target @param {E | null} wrapper
   * @returns {Selection<E> | null}
   */
  const fromFrame = (kind, target, wrapper) => {
    const f = ctx.frame(kind);
    const node = f?.nearest(target);
    if (!f || !node) return null;
    /** @type {Selection<E>} */
    const sel = { from: kind, s: f.sOf(node), el: node, tag: node.localName, copy: f.copyOf(node), size: f.sizeOf(node) };
    const field = wrapper && f.fieldEls.get(wrapper);
    if (wrapper && field) {
      const list = f.fieldCopies(field.s, field.k);
      Object.assign(sel, { field: { s: field.s, k: field.k }, wrapper, fcopy: list.indexOf(wrapper), fsize: list.length });
    }
    return sel;
  };

  /**
   * A click at a position in the shown code tab: its element in both frames. null: nothing there.
   * @param {{ line: number, col: number }} at
   * @returns {Selection<E> | null}
   */
  const fromCode = ({ line, col }) => {
    const m = ctx.model();
    const tab = ctx.tab();
    if (!m || !CODE_TABS.includes(tab)) return null;
    const scan = scanOf(tab);
    const i = tagAt(scan, line, col);
    if (i < 0) return null;
    const text = ctx.shown(tab);
    const offset = /** @type {number} */ (scan.starts[line - 1]) + col;
    let s = -1;
    let tag = i;
    /** @type {number | undefined} */
    let copy;
    /** @type {number | undefined} */
    let size;
    /** @type {string | undefined} */
    let name;
    /** @type {E | undefined} */
    let exact;
    /** @type {Field[]} */
    let table = [];
    if (tab === "source") {
      s = i;
      table = fieldTable(text, scan, "tpl", ownsFields(scan));
    } else if (tab === "template" || !m.dialect) {
      const sources = m.sources;
      const hit = sources && mapped(scan, sources, i);
      if (!sources || !hit) {
        // wrappers the compiler added around the email: the element of that tag is all there is
        const f = ctx.frame("compiled");
        /** @type {E | null} */
        let el = null;
        for (let t = i; t >= 0 && !el; t = parentOf(scan, t)) el = f?.byTag[t] ?? null;
        return el && { from: "tab", s: -1, only: { compiled: el }, at: { tab, range: scan.tags[i] } };
      }
      [tag, s] = hit;
      exact = exactIn(tab, tag);
      if (tab === "template") table = fieldTable(text, scan, "tpl", (t) => /** @type {number} */ (sources[t]));
    } else {
      // the filled html: the frame's element for this tag, or for the nearest tag above that has one
      const f = ctx.fields() ? null : ctx.frame("compiled");
      /** @type {E | null} */
      let el = null;
      for (let t = i; t >= 0 && !el; t = parentOf(scan, t)) {
        const at = f?.byTag[t];
        el = f && at ? f.nearest(at) : null;
      }
      if (!f || !el) return null;
      s = f.sOf(el);
      [copy, size, name] = [f.copyOf(el), f.sizeOf(el), el.localName];
      tag = f.tagOf(el);
    }
    const hit = table.find((f) => f.start <= offset && offset < f.end);
    return {
      from: "tab",
      tag: name ?? scan.tags[tag]?.tag,
      exact,
      s,
      copy,
      size,
      ...(hit && { field: { s: hit.s, k: hit.k } }),
      at: { tab, range: hit ? rangeOf(scan, hit.start, hit.end) : scan.tags[tag] },
    };
  };

  return { plan, fromFrame, fromCode, scanOf };
};

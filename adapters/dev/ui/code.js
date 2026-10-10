// The code panel: one text per tab, line numbers, Copy and Download.
import { h } from "./dom.js";
import { format } from "./format.js";
import { paint as colour } from "./highlight.js";

/** @typedef {"compiled" | "template" | "source"} CodeTab */
/** @typedef {{ text: string, file: string }} Item */
/** @typedef {Partial<Record<CodeTab, Item>>} Items */
// a start tag's span, or a placeholder's: 1-based lines, 0-based columns, end exclusive
/** @typedef {{ line: number, col: number, endLine: number, endCol: number }} Range */
/** @typedef {"hover" | "pin"} MarkKind */
/** @typedef {false | "center" | "nearest"} Scroll */

const TABS = /** @type {const} */ (["compiled", "template", "source"]);
/** @param {string | undefined} v @returns {v is CodeTab} */
export const isCodeTab = (v) => TABS.includes(/** @type {CodeTab} */ (v));

/**
 * @param {{ tabs: HTMLElement, gutter: HTMLElement, pre: HTMLElement, copyBtn: HTMLButtonElement, downloadBtn: HTMLButtonElement, meta: HTMLElement }} els
 * @param {{ click?: (at: { line: number, col: number }) => void }} [hooks]
 */
export const createCode = ({ tabs, gutter, pre, copyBtn, downloadBtn, meta }, hooks = {}) => {
  /** @type {Items} */
  let items = {};
  /** @type {CodeTab} */
  let active = "compiled";
  /** @type {HTMLElement | null} */
  let mark = null;
  let pretty = true;
  /** @type {Map<CodeTab, { src: string, res: import("./format.js").Formatted }>} */
  const cache = new Map();
  const box = /** @type {HTMLElement} */ (pre.parentElement);

  // what the panel shows for a tab: the formatted text, or the real one. Copy and Download use the real one.
  /** @param {CodeTab} tab @returns {import("./format.js").Formatted} */
  const shown = (tab) => {
    const text = items[tab]?.text ?? "";
    if (!pretty) return { text, ok: false, locate: (line, col) => ({ line, col }) };
    const hit = cache.get(tab);
    if (hit?.src === text) return hit.res;
    const res = format(text);
    cache.set(tab, { src: text, res });
    return res;
  };

  const paint = () => {
    for (const b of tabs.querySelectorAll("button")) {
      const has = (b.dataset.tab ?? "") in items;
      b.hidden = !has;
      b.setAttribute("aria-selected", String(b.dataset.tab === active));
    }
    const item = items[active];
    const res = shown(active);
    const text = res.text;
    const lines = text === "" ? 0 : text.split("\n").length;
    colour(pre, text, "html");
    gutter.textContent = Array.from({ length: lines }, (_, i) => i + 1).join("\n");
    meta.textContent = item ? `${lines} lines${pretty ? (res.ok ? " · formatted" : " · as is") : ""}` : "";
    copyBtn.disabled = downloadBtn.disabled = !item;
    mark?.remove();
    mark = null;
    clearMark("hover");
    clearMark("pin");
  };

  // ---- marks from the preview: hover ones fade, pinned ones stay until cleared
  /** @type {Record<MarkKind, HTMLElement[]>} */
  const links = { hover: [], pin: [] };
  /** @type {Partial<Record<MarkKind, ReturnType<typeof setTimeout>>>} */
  const timers = {};
  /** @param {MarkKind} kind */
  const clearMark = (kind) => {
    clearTimeout(timers[kind]);
    for (const m of links[kind]) m.remove();
    links[kind] = [];
  };
  const metrics = () => {
    const css = getComputedStyle(pre);
    const ctx = document.createElement("canvas").getContext("2d");
    if (ctx) ctx.font = css.font;
    return {
      lh: parseFloat(css.lineHeight) || 18,
      top: parseFloat(css.paddingTop) || 0,
      left: parseFloat(css.paddingLeft) || 0,
      cw: ctx?.measureText("0").width || 7.2,
    };
  };
  /** @param {Range} t @param {{ kind?: MarkKind, scroll?: Scroll }} [o] */
  const markTag = (t, { kind = "hover", scroll = false } = {}) => {
    clearMark(kind);
    const m = metrics();
    const x = pre.offsetLeft + m.left;
    const y = (/** @type {number} */ line) => pre.offsetTop + m.top + (line - 1) * m.lh;
    /** @type {[left: number, top: number, width: number, height: number][]} */
    const bars = [];
    if (t.line === t.endLine) bars.push([x + t.col * m.cw, y(t.line), (t.endCol - t.col) * m.cw, m.lh]);
    else for (let l = t.line; l <= t.endLine; l++) bars.push([x, y(l), pre.scrollWidth - m.left, m.lh]);
    links[kind] = bars.map(([left, top, width, height]) => {
      const el = h("div", { class: `link-mark ${kind}` });
      Object.assign(el.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
      box.append(el);
      return el;
    });
    if (scroll) links[kind][0]?.scrollIntoView({ block: scroll === "center" ? "center" : "nearest", inline: "nearest", behavior: "smooth" });
    if (kind === "hover") timers[kind] = setTimeout(() => clearMark("hover"), 2500);
  };

  // which line and column of the text is under the pointer
  /** @param {MouseEvent} e */
  const where = (e) => {
    const r = pre.getBoundingClientRect();
    const m = metrics();
    const line = Math.floor((e.clientY - r.top - m.top) / m.lh) + 1;
    const col = Math.floor((e.clientX - r.left - m.left) / m.cw);
    return line >= 1 && col >= -1 && items[active] ? { line, col: Math.max(0, col) } : null;
  };
  pre.addEventListener("click", (e) => {
    // dragging to select text isn't a click on an element
    if (getSelection()?.toString()) return;
    const w = where(e);
    if (w) hooks.click?.(w);
  });

  tabs.addEventListener("click", (e) => {
    const b = /** @type {Element} */ (e.target).closest("button[data-tab]");
    if (!(b instanceof HTMLElement) || !isCodeTab(b.dataset.tab)) return;
    active = b.dataset.tab;
    paint();
  });

  copyBtn.addEventListener("click", async () => {
    const text = items[active]?.text ?? "";
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // http on a LAN address isn't a secure context, so no clipboard API
      const t = h("textarea", { value: text });
      document.body.append(t);
      t.select();
      document.execCommand("copy");
      t.remove();
    }
    const label = copyBtn.title;
    copyBtn.title = "Copied";
    copyBtn.setAttribute("aria-label", "Copied");
    setTimeout(() => {
      copyBtn.title = label;
      copyBtn.setAttribute("aria-label", label);
    }, 1000);
  });

  downloadBtn.addEventListener("click", () => {
    const item = items[active];
    if (!item) return;
    const url = URL.createObjectURL(new Blob([item.text], { type: "text/html" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: item.file });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  return {
    tab: () => active,
    /** @param {CodeTab} id */
    setTab(id) {
      if (!(id in items) || id === active) return;
      active = id;
      paint();
    },
    mark: markTag,
    shown: (/** @type {CodeTab} */ tab) => shown(tab).text,
    // a position in the real text, as the panel shows it
    locate: (/** @type {CodeTab} */ tab, /** @type {number} */ line, col = 0) => shown(tab).locate(line, col),
    /** @param {boolean} on */
    setFormat(on) {
      pretty = on;
      paint();
    },
    clearMark,
    /** @param {Items} next */
    set(next) {
      items = next;
      if (!(active in items)) active = "compiled";
      const scroll = box.scrollTop;
      paint();
      box.scrollTop = scroll;
    },
    // jump to a source line, e.g. from a diagnostic
    /** @param {CodeTab} tab @param {number} line */
    reveal(tab, line, severity = "", col = 0) {
      if (!(tab in items)) return;
      active = tab;
      paint();
      // locations are in the original text; the panel may show it formatted
      line = shown(tab).locate(line, col).line;
      const { lh, top } = metrics();
      mark = h("div", { class: `line-mark ${severity}` });
      mark.style.top = `${pre.offsetTop + top + (line - 1) * lh}px`;
      mark.style.height = `${lh}px`;
      box.append(mark);
      box.scrollTop = Math.max(0, (line - 1) * lh - box.clientHeight / 3);
    },
  };
};

// Click-to-locate on the page: a click in either frame or in a code tab boxes its element in both
// frames and marks its tag in the code. navigate.js decides what; this reads the frames and draws.
import { byId, h } from "./dom.js";
import { buildFrame, createModel, createNavigator } from "./navigate.js";

/** @typedef {import("../protocol.ts").RenderResponse} RenderResponse */
/** @typedef {import("./preview.js").FrameKind} FrameKind */
/** @typedef {import("./navigate.js").Model} Model */
/** @typedef {import("./navigate.js").NavFrame<Element>} NavFrame */
/** @typedef {import("./navigate.js").Selection<Element>} Selection */

const SKIP = new Set(["html", "head", "body"]);

/**
 * @param {{
 *   preview: ReturnType<typeof import("./preview.js").createPreview>,
 *   code: ReturnType<typeof import("./code.js").createCode>,
 *   last: () => RenderResponse | null,
 *   fields: () => boolean,
 *   narrow: () => boolean,
 *   openCode: () => void,
 * }} o openCode: open the panel on its Code tab, to show where a click in a frame is
 */
export const createCrossView = ({ preview, code, last, fields, narrow, openCode }) => {
  /** @type {Model | null} */
  let modelFor = null;
  const model = () => {
    const r = last();
    if (!r) return null;
    if (modelFor?.r !== r) modelFor = createModel(r);
    return modelFor;
  };

  /** @type {Record<FrameKind, NavFrame | null>} */
  const frames = { source: null, compiled: null };
  /** @param {FrameKind} kind @returns {NavFrame | null} */
  const frameFor = (kind) => {
    if (frames[kind]) return frames[kind];
    const doc = preview.doc(kind);
    const m = model();
    if (!doc?.body || !m) return null;
    return (frames[kind] = buildFrame(kind, doc, m, { fields: fields(), scanOf: nav.scanOf }));
  };

  const nav = createNavigator({
    model,
    frame: frameFor,
    doc: (kind) => preview.doc(kind),
    shown: code.shown,
    tab: code.tab,
    fields,
    narrow,
  });

  /** @type {Partial<Record<FrameKind, HTMLElement>>} */
  const overlays = {};

  /** @param {FrameKind} [kind] every frame's, and the code's pin, without one */
  const dropOverlay = (kind) => {
    for (const k of kind ? [kind] : /** @type {FrameKind[]} */ (Object.keys(overlays))) {
      overlays[k]?.remove();
      delete overlays[k];
    }
    if (!kind) code.clearMark("pin");
  };

  // draw the box over `el` in its frame (the frame's own document is never touched)
  /** @param {FrameKind} kind @param {Element | undefined} el @param {{ scroll?: ScrollLogicalPosition | undefined, label?: string | undefined }} [o] */
  const showOverlay = (kind, el, { scroll, label } = {}) => {
    const pane = byId(`pane-${kind}`);
    const iframe = /** @type {HTMLIFrameElement} */ (pane.querySelector("iframe"));
    if (!el || !pane.offsetParent || SKIP.has(el.localName)) return dropOverlay(kind);
    const r = el.getBoundingClientRect();
    const ov = (overlays[kind] ??= h("div", { class: "hl" }, h("span", { class: "hl-tag" })));
    /** @type {HTMLElement} */ (ov.firstChild).textContent = label ?? el.localName;
    if (ov.parentElement !== pane) pane.append(ov);
    Object.assign(ov.style, {
      left: `${iframe.offsetLeft + r.left}px`,
      top: `${iframe.offsetTop + r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
    if (scroll) ov.scrollIntoView({ block: scroll, inline: "nearest", behavior: "smooth" });
  };

  /** @param {Selection} sel */
  const choose = (sel) => {
    const p = nav.plan(sel);
    for (const kind of /** @type {const} */ (["source", "compiled"])) {
      showOverlay(kind, p.boxes[kind].el, { scroll: p.fromFrame ? undefined : "center", label: p.boxes[kind].label });
    }
    if (!p.code) return code.clearMark("pin");
    const still = narrow() || !p.fromFrame;
    if (p.fromFrame && !narrow()) openCode();
    code.setTab(p.code.tab);
    code.mark(p.code.range, { kind: "pin", scroll: still ? false : "center" });
  };

  /** @param {FrameKind} kind @param {Document} doc */
  const hookFrame = (kind, doc) => {
    doc.addEventListener("click", (e) => {
      e.preventDefault();
      const target = /** @type {Element} */ (e.target);
      if (!target.localName) return;
      const sel = nav.fromFrame(kind, target, target.closest?.("[data-tddr-f]") ?? null);
      if (sel) return choose(sel);
      dropOverlay();
      showOverlay(kind, target);
    });
  };

  addEventListener("keydown", (e) => {
    if (e.key === "Escape") dropOverlay();
  });

  return {
    hookFrame,
    /** @param {{ line: number, col: number }} at a click in the shown code tab */
    codeAt(at) {
      const sel = nav.fromCode(at);
      if (sel) choose(sel);
    },
    // the frames changed (new content, view, width, format): what was boxed is gone
    clear() {
      frames.source = frames.compiled = null;
      dropOverlay();
    },
  };
};

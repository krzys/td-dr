// Source and compiled iframes. They get `allow-same-origin` and nothing else: scripts in the email
// never run, and the page can still read each document's height so overlays line up.
const SANDBOX = "allow-same-origin";

/** @typedef {"source" | "compiled"} FrameKind */
export const FRAME_KINDS = /** @type {const} */ (["source", "compiled"]);

/** @param {HTMLElement} pane */
const frame = (pane) => {
  const iframe = pane.querySelector("iframe");
  if (!iframe) throw new Error(`#${pane.id} has no iframe`);
  iframe.setAttribute("sandbox", SANDBOX);
  return iframe;
};

/**
 * @param {{ stage: HTMLElement, frames: HTMLElement, panes: Record<FrameKind, HTMLElement>, onDoc?: (kind: FrameKind, doc: Document) => void }} els
 */
export const createPreview = ({ stage, frames, panes, onDoc }) => {
  const iframes = { source: frame(panes.source), compiled: frame(panes.compiled) };
  /** @type {Record<FrameKind, string | null>} */
  const content = { source: null, compiled: null };

  // Shrink to 1px first so content sized to the viewport doesn't keep the frame tall. It all
  // happens in one task, so nothing paints at 1px; the stage keeps its scroll position.
  /** @param {HTMLIFrameElement} iframe */
  const fit = (iframe) => {
    const doc = iframe.contentDocument;
    if (!doc?.documentElement) return;
    const top = stage.scrollTop;
    const left = stage.scrollLeft;
    iframe.style.height = "1px";
    const h = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0);
    iframe.style.height = `${Math.max(h, 80)}px`;
    stage.scrollTop = top;
    stage.scrollLeft = left;
  };

  for (const kind of FRAME_KINDS) {
    const iframe = iframes[kind];
    iframe.addEventListener("load", () => {
      fit(iframe);
      if (iframe.contentDocument) onDoc?.(kind, iframe.contentDocument);
      // images arriving later change the height; load doesn't bubble, so listen in capture
      iframe.contentDocument?.addEventListener("load", () => fit(iframe), true);
    });
  }

  // `load` waits for every image, and offline ones can take seconds to fail: size as it parses
  /** @type {Map<HTMLIFrameElement, ReturnType<typeof setInterval>>} */
  const polls = new Map();
  /** @param {HTMLIFrameElement} iframe */
  const follow = (iframe) => {
    clearInterval(polls.get(iframe));
    const started = Date.now();
    const old = iframe.contentDocument; // still there until the new one starts parsing
    const t = setInterval(() => {
      fit(iframe);
      const doc = iframe.contentDocument;
      if ((doc !== old && doc?.readyState === "complete") || Date.now() - started > 10_000) clearInterval(t);
    }, 100);
    polls.set(iframe, t);
  };

  let mode = "";
  let width = 600;
  // side by side shrinks to fit the stage instead of scrolling sideways
  const zoom = () => {
    const room = stage.clientWidth - 56;
    const z = mode === "side" && room > 0 ? Math.max(0.3, Math.min(1, (room - 24) / (2 * width))) : 1;
    frames.style.zoom = z === 1 ? "" : String(z);
    stage.dispatchEvent(new CustomEvent("zoom", { detail: z }));
  };
  const refit = () => {
    zoom();
    Object.values(iframes).forEach(fit);
  };
  // a frame filled while its panel was hidden (phone tabs) measured nothing
  new ResizeObserver(refit).observe(stage);

  return {
    doc: (/** @type {FrameKind} */ kind) => iframes[kind].contentDocument,
    /** @param {string} source @param {string} compiled */
    show(source, compiled) {
      for (const [k, html] of /** @type {const} */ ([["source", source], ["compiled", compiled]])) {
        if (content[k] === html) continue;
        iframes[k].srcdoc = content[k] = html;
        follow(iframes[k]);
      }
    },
    /** @param {string} v */
    view(v) {
      mode = v;
      frames.dataset.view = v;
      refit();
    },
    /** @param {number} px */
    width(px) {
      width = px;
      frames.style.setProperty("--frame-width", `${px}px`);
      stage.style.setProperty("--frame-width", `${px}px`);
      refit();
    },
    /** @param {string | number} o */
    opacity(o) {
      frames.style.setProperty("--overlay-opacity", String(o));
    },
  };
};

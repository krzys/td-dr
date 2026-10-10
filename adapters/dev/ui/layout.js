// The page's layout as data: which view, how wide the email, where the panel docks and how big it
// is, and what the browser remembers of it. No DOM here; panels.js applies it.

/** @typedef {"source" | "compiled" | "side" | "overlay"} View */
/** @typedef {View | "compare"} ViewChoice */
/** @typedef {"side" | "overlay"} Compare */
/** @typedef {"code" | "data"} Dock */
/** @typedef {"emails" | "preview" | "code" | "data"} Panel */
/** @typedef {"right" | "bottom"} DockPos */

export const VIEWS = /** @type {const} */ (["source", "compiled", "side", "overlay"]);
export const DESKTOP = 600;
export const PHONE = 375;
const MIN_WIDTH = 200;
const MAX_WIDTH = 2400;

/** @param {unknown} v @returns {v is View} */
export const isView = (v) => VIEWS.includes(/** @type {View} */ (v));

// what a fresh page shows, from its hash; a phone starts narrow and can't compare side by side
/** @param {{ view?: string | undefined, width?: string | undefined }} hash @param {boolean} narrow */
export const initialLayout = (hash, narrow) => ({
  view: isView(hash.view) ? hash.view : /** @type {View} */ ("compiled"),
  cmp: /** @type {Compare} */ (hash.view === "overlay" || narrow ? "overlay" : "side"),
  width: Number(hash.width) > 0 ? Number(hash.width) : narrow ? PHONE : DESKTOP,
});

// "compare" is one segment with two modes; the hash and the preview only know the modes
/** @param {ViewChoice} choice @param {{ narrow: boolean, cmp: Compare }} now */
export const resolveView = (choice, { narrow, cmp }) => {
  /** @type {View} */
  let view = choice === "compare" ? (narrow ? "overlay" : cmp) : choice;
  if (view === "side" && narrow) view = "overlay";
  const comparing = view === "side" || view === "overlay";
  return { view, cmp: view === "side" || view === "overlay" ? view : cmp, comparing };
};

// a phone has no Code/Data tabs of its own: the bottom bar decides
/** @param {Dock} dock @param {Panel} panel @param {boolean} narrow @returns {Dock} */
export const dockShown = (dock, panel, narrow) => (narrow ? (panel === "data" ? "data" : "code") : dock);

// ---- the email's width

/** @param {number} w */
export const clampWidth = (w) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w));
/** @param {number} w */
export const isPreset = (w) => w === DESKTOP || w === PHONE;
// what the width box accepts as typed
/** @param {number} w */
export const typedWidth = (w) => Number.isInteger(w) && w >= MIN_WIDTH && w <= MAX_WIDTH;

// dragging either edge keeps the frame centred, so the width changes by twice the move (in frame
// pixels: the side-by-side view is zoomed); it snaps to the presets
/** @param {number} w0 @param {number} dx @param {-1 | 1} side @param {number} zoom */
export const dragWidth = (w0, dx, side, zoom) => {
  const w = Math.round(w0 + (2 * side * dx) / zoom);
  const snap = [PHONE, DESKTOP].find((p) => Math.abs(p - w) <= 8);
  return clampWidth(snap ?? w);
};

// arrow keys on either handle: right widens, left narrows
/** @param {number} w @param {string} key */
export const keyWidth = (w, key) => {
  const d = key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : 0;
  return d ? clampWidth(w + d * 20) : null;
};

// ---- the panel's size (right on a desktop, bottom on a tablet)

/** @param {number} px @param {boolean} bottom @param {{ width: number, height: number }} viewport */
export const clampDock = (px, bottom, { width, height }) => {
  const max = bottom ? height - 220 : width - 560;
  return Math.round(Math.min(max, Math.max(bottom ? 180 : 320, px)));
};

// the size a pointer at (x, y) asks for: the panel's edge follows it
/** @param {boolean} bottom @param {number} x @param {number} y @param {{ width: number, height: number }} viewport */
export const dockSizeAt = (bottom, x, y, { width, height }) => (bottom ? height - y - 28 : width - x);

// arrow keys on the resizer grow (left, up) or shrink (right, down) the panel
/** @param {string} key */
export const dockStep = (key) => (key === "ArrowLeft" || key === "ArrowUp" ? 24 : key === "ArrowRight" || key === "ArrowDown" ? -24 : 0);

// ---- what the browser remembers

/** @typedef {Pick<globalThis.Storage, "getItem" | "setItem">} Store */

// `store` is called each time: reading localStorage itself throws in some sandboxes
/** @param {() => Store | undefined} store */
export const createPrefs = (store) => {
  /** @param {string} k */
  const get = (k) => {
    try {
      return store()?.getItem(k) ?? null;
    } catch {
      return null;
    }
  };
  /** @param {string} k @param {string} v */
  const set = (k, v) => {
    try {
      store()?.setItem(k, v);
    } catch {
      // private windows; the setting just doesn't stick
    }
  };
  return {
    format: () => get("tddr.format") !== "0",
    setFormat: (/** @type {boolean} */ on) => set("tddr.format", on ? "1" : "0"),
    /** @returns {DockPos} */
    dockPos: () => (get("tddr.dockPos") === "bottom" ? "bottom" : "right"),
    setDockPos: (/** @type {DockPos} */ pos) => set("tddr.dockPos", pos),
    codeOpen: () => !get("tddr.codeCollapsed"),
    setCodeOpen: (/** @type {boolean} */ open) => set("tddr.codeCollapsed", open ? "" : "1"),
    // 0: never resized
    dockSize: (/** @type {boolean} */ bottom) => Number(get(bottom ? "tddr.dockH" : "tddr.dockW")) || 0,
    setDockSize: (/** @type {boolean} */ bottom, /** @type {number} */ px) => set(bottom ? "tddr.dockH" : "tddr.dockW", String(px)),
  };
};

/** @typedef {ReturnType<typeof createPrefs>} Prefs */

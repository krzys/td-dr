// Applies the layout (layout.js) to the page: the email list or its drawer, the view and width
// controls, the docked panel's tabs, place and size, and the phone's one-panel-at-a-time tabs.
import { byId } from "./dom.js";
import { clampDock, dockShown, dockSizeAt, dockStep, dragWidth, isPreset, keyWidth, resolveView, typedWidth } from "./layout.js";

/** @typedef {import("./layout.js").View} View */
/** @typedef {import("./layout.js").ViewChoice} ViewChoice */
/** @typedef {import("./layout.js").Compare} Compare */
/** @typedef {import("./layout.js").Dock} Dock */
/** @typedef {import("./layout.js").Panel} Panel */
/** @typedef {import("./layout.js").DockPos} DockPos */

/** @param {Element} root @param {string} sel */
const buttons = (root, sel = "button") => /** @type {NodeListOf<HTMLButtonElement>} */ (root.querySelectorAll(sel));
/** @param {Event} e @param {string} sel */
const hit = (e, sel) => /** @type {HTMLElement | null} */ (/** @type {Element} */ (e.target).closest(sel));

/**
 * @param {{
 *   initial: { view: View, cmp: Compare, width: number },
 *   prefs: import("./layout.js").Prefs,
 *   compact: MediaQueryList,
 *   narrow: MediaQueryList,
 *   onView: (v: View) => void,
 *   onWidth: (w: number) => void,
 * }} o
 */
export const createPanels = ({ initial, prefs, compact, narrow, onView, onWidth }) => {
  const body = document.body;
  const root = document.documentElement.style;
  /** @type {{ view: View, cmp: Compare, width: number, dock: Dock, panel: Panel }} */
  const state = { ...initial, dock: "code", panel: "preview" };

  // ---- the docked panel: Code / Data tabs, open or closed, right or bottom

  const syncDock = () => {
    const dock = dockShown(state.dock, state.panel, narrow.matches);
    body.dataset.dock = dock;
    for (const b of buttons(byId("dock-tabs"))) b.setAttribute("aria-selected", String(b.dataset.dock === dock));
  };

  /** @param {Panel} p */
  const setPanel = (p) => {
    state.panel = p;
    body.dataset.panel = p;
    for (const b of buttons(byId("mobile-tabs"))) b.setAttribute("aria-pressed", String(b.dataset.panel === p));
    syncDock();
  };

  // only a phone switches panels; elsewhere they're all on screen
  /** @param {Panel} p */
  const showPanel = (p) => {
    if (narrow.matches) setPanel(p);
  };

  /** @param {Dock} d */
  const setDock = (d) => {
    state.dock = d;
    syncDock();
  };

  const dockOpen = () => !body.classList.contains("dock-closed");
  /** @param {boolean} open */
  const setDockOpen = (open) => {
    body.classList.toggle("dock-closed", !open);
    byId("code-toggle").setAttribute("aria-pressed", String(open));
    prefs.setCodeOpen(open);
  };

  const bottomDock = () => compact.matches || body.classList.contains("dock-bottom");
  /** @param {DockPos} pos */
  const setDockPos = (pos) => {
    body.classList.toggle("dock-bottom", pos === "bottom");
    for (const b of buttons(byId("dockpos"))) b.setAttribute("aria-pressed", String(b.dataset.pos === pos));
    prefs.setDockPos(pos);
    if (!dockOpen()) setDockOpen(true);
  };

  // the code panel, opened on the Code tab: where a click in the email is shown
  const openCode = () => {
    if (!dockOpen()) setDockOpen(true);
    setDock("code");
  };

  // ---- the email list: a column on a desktop, a drawer below 1200px

  const listOpen = () => (compact.matches ? body.classList.contains("drawer-open") : !body.classList.contains("list-collapsed"));
  /** @param {boolean} open */
  const setList = (open) => {
    if (compact.matches) {
      body.classList.toggle("drawer-open", open);
      byId("scrim").hidden = !open;
    } else {
      body.classList.toggle("list-collapsed", !open);
    }
    byId("list-toggle").setAttribute("aria-pressed", String(open));
  };

  const focusFilter = () => {
    const filter = byId("filter", HTMLInputElement);
    if (narrow.matches) setPanel("emails");
    else if (!listOpen()) setList(true);
    filter.focus();
    filter.select();
  };

  // ---- view and width

  /** @param {ViewChoice} choice */
  const setView = (choice) => {
    const { view: v, cmp, comparing } = resolveView(choice, { narrow: narrow.matches, cmp: state.cmp });
    state.view = v;
    state.cmp = cmp;
    for (const b of buttons(byId("views"))) {
      const on = b.dataset.view === "compare" ? comparing : b.dataset.view === v;
      b.setAttribute("aria-pressed", String(on));
    }
    byId("hud").hidden = !comparing;
    byId("overlay-ctl").hidden = v !== "overlay";
    const modes = byId("compare-modes");
    const side = modes.querySelector('[data-cmp="side"]');
    if (side instanceof HTMLElement) side.hidden = narrow.matches;
    for (const b of buttons(modes)) b.setAttribute("aria-pressed", String(b.dataset.cmp === v));
    onView(v);
  };

  /** @param {number} w */
  const setWidth = (w) => {
    state.width = w;
    for (const b of buttons(byId("widths"))) b.setAttribute("aria-pressed", String(Number(b.dataset.width) === w));
    const custom = byId("width-custom", HTMLInputElement);
    byId("width-field").classList.toggle("active", !isPreset(w));
    if (document.activeElement !== custom) custom.value = String(w);
    onWidth(w);
  };

  // ---- wiring

  byId("dockpos").addEventListener("click", (e) => {
    const b = hit(e, "button[data-pos]");
    if (b) setDockPos(b.dataset.pos === "bottom" ? "bottom" : "right");
  });
  compact.addEventListener("change", () => {
    body.classList.remove("drawer-open");
    byId("scrim").hidden = true;
    byId("list-toggle").setAttribute("aria-pressed", String(listOpen()));
  });
  narrow.addEventListener("change", () => {
    syncDock();
    setView(state.view);
  });

  byId("views").addEventListener("click", (e) => {
    const b = hit(e, "button[data-view]");
    if (b) setView(/** @type {ViewChoice} */ (b.dataset.view));
  });
  byId("compare-modes").addEventListener("click", (e) => {
    const b = hit(e, "button[data-cmp]");
    if (b) setView(/** @type {Compare} */ (b.dataset.cmp));
  });
  byId("widths").addEventListener("click", (e) => {
    const b = hit(e, "button[data-width]");
    if (b) setWidth(Number(b.dataset.width));
  });
  const custom = byId("width-custom", HTMLInputElement);
  custom.addEventListener("input", () => {
    const w = Number(custom.value);
    if (typedWidth(w)) setWidth(w);
  });
  custom.addEventListener("blur", () => (custom.value = String(state.width)));
  byId("stage").addEventListener("zoom", (e) => {
    const z = /** @type {CustomEvent<number>} */ (e).detail;
    const fit = byId("fit");
    fit.textContent = `Fit ${Math.round(z * 100)}%`;
    fit.hidden = z === 1;
  });
  // drag either edge of the frame
  for (const handle of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll(".handle"))) {
    const side = handle.classList.contains("l") ? -1 : 1;
    const zoomNow = () => Number(getComputedStyle(byId("frames")).zoom) || 1;
    handle.addEventListener("pointerdown", (e) => {
      handle.setPointerCapture(e.pointerId);
      handle.classList.add("drag");
      const x0 = e.clientX;
      const w0 = state.width;
      const move = (/** @type {PointerEvent} */ ev) => setWidth(dragWidth(w0, ev.clientX - x0, side, zoomNow()));
      const up = () => {
        handle.classList.remove("drag");
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
    });
    handle.addEventListener("keydown", (e) => {
      const w = keyWidth(state.width, e.key);
      if (w === null) return;
      e.preventDefault();
      setWidth(w);
    });
  }
  byId("list-toggle").addEventListener("click", () => setList(!listOpen()));
  byId("list-close").addEventListener("click", () => setList(false));
  byId("scrim").addEventListener("click", () => setList(false));
  byId("code-toggle").addEventListener("click", () => setDockOpen(!dockOpen()));
  byId("dock-tabs").addEventListener("click", (e) => {
    const b = hit(e, "button[data-dock]");
    if (b) setDock(b.dataset.dock === "data" ? "data" : "code");
  });
  byId("mobile-tabs").addEventListener("click", (e) => {
    const b = hit(e, "button[data-panel]");
    if (b) setPanel(/** @type {Panel} */ (b.dataset.panel));
  });

  // ---- resizable panel (right on a desktop, bottom on a tablet); the size is remembered

  const viewport = () => ({ width: innerWidth, height: innerHeight });
  /** @param {number} px */
  const resizeTo = (px) => {
    const bottom = bottomDock();
    const v = clampDock(px, bottom, viewport());
    root.setProperty(bottom ? "--dock-h" : "--dock-w", `${v}px`);
    prefs.setDockSize(bottom, v);
  };
  const resizer = byId("resizer");
  resizer.addEventListener("pointerdown", (e) => {
    resizer.setPointerCapture(e.pointerId);
    resizer.classList.add("drag");
    const move = (/** @type {PointerEvent} */ ev) => resizeTo(dockSizeAt(bottomDock(), ev.clientX, ev.clientY, viewport()));
    const up = () => {
      resizer.classList.remove("drag");
      resizer.removeEventListener("pointermove", move);
      resizer.removeEventListener("pointerup", up);
    };
    resizer.addEventListener("pointermove", move);
    resizer.addEventListener("pointerup", up);
  });
  resizer.addEventListener("keydown", (e) => {
    const step = dockStep(e.key);
    if (!step) return;
    e.preventDefault();
    const dock = byId("dock").getBoundingClientRect();
    resizeTo((bottomDock() ? dock.height : dock.width) + step);
  });

  // what the browser remembered, before anything shows
  const restore = () => {
    byId("list-toggle").setAttribute("aria-pressed", String(listOpen()));
    const w = prefs.dockSize(false);
    const hgt = prefs.dockSize(true);
    if (w) root.setProperty("--dock-w", `${w}px`);
    if (hgt) root.setProperty("--dock-h", `${hgt}px`);
  };

  return {
    get view() {
      return state.view;
    },
    get width() {
      return state.width;
    },
    restore,
    setPanel,
    showPanel,
    setDock,
    setDockPos,
    dockOpen,
    setDockOpen,
    openCode,
    listOpen,
    setList,
    focusFilter,
    setView,
    setWidth,
  };
};

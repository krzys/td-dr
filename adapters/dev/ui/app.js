// The dev page: which email, mode and data set are open, rendering them, and live reload. The parts
// live beside it: panels (layout), problems (diagnostics), crossview (click-to-locate), editor
// (data sets), emails (list and switcher); the pure rules they follow are in layout, dataset,
// navigate, requests and size, which run without a browser.
import * as api from "./api.js";
import { createCode } from "./code.js";
import { createCrossView } from "./crossview.js";
import { dataSource, saveAsName } from "./dataset.js";
import { countBySeverity, sourceCol } from "./diagnostics.js";
import { byId, debounce, h, icon, readableFields } from "./dom.js";
import { createEditor } from "./editor.js";
import { createEmailList, frameworkName, MODE_LABEL } from "./emails.js";
import { blockify, chipify } from "./fields.js";
import { readHash, writeHash } from "./hash.js";
import { createPrefs, initialLayout, isView } from "./layout.js";
import { createPanels } from "./panels.js";
import { createPreview } from "./preview.js";
import { createProblems } from "./problems.js";
import { createGate, createLatest } from "./requests.js";
import { parseSims, SIMS, simulate } from "./simulate.js";
import { sizeView } from "./size.js";

/** @typedef {import("../protocol.ts").ApiError} ApiError */
/** @typedef {import("../protocol.ts").ChangeEvent} ChangeEvent */
/** @typedef {import("../protocol.ts").EmailSummary} EmailSummary */
/** @typedef {import("../protocol.ts").EventsPath} EventsPath */
/** @typedef {import("../protocol.ts").RenderMode} RenderMode */
/** @typedef {import("../protocol.ts").RenderRequest} RenderRequest */
/** @typedef {import("../protocol.ts").RenderResponse} RenderResponse */
/** @typedef {import("../protocol.ts").ServerEvents} ServerEvents */
/** @typedef {import("../protocol.ts").SizeInfo} SizeInfo */
/** @typedef {import("./hash.js").Hash} Hash */
/** @typedef {import("./layout.js").ViewChoice} ViewChoice */
/** @typedef {import("./simulate.js").Sim} Sim */

/** @type {EventsPath} */
const EVENTS = "/__tddr/events";
const STRUCTURAL = new Set(["add", "unlink", "addDir", "unlinkDir"]);
const FAILED = { error: 1, warning: 0, info: 0 };

const initial = readHash();
// below 1200px the list becomes a drawer; a phone shows one panel and one frame at a time
const compact = matchMedia("(max-width: 1200px)");
const narrow = matchMedia("(max-width: 700px)");
const prefs = createPrefs(() => localStorage);

/**
 * @type {{
 *   emails: EmailSummary[], email: EmailSummary | null, set: string, mode: RenderMode,
 *   fields: boolean, sims: Sim[], failed: boolean, last: RenderResponse | null,
 * }}
 */
const state = {
  emails: [],
  email: null,
  set: "",
  mode: "html",
  fields: initial.fields === "1",
  sims: parseSims(initial.sim),
  failed: false,
  last: null,
};

/** @param {EmailSummary} e @param {string | undefined} m @returns {RenderMode | undefined} */
const modeOf = (e, m) => (m === "html" ? m : e.template.find((t) => t === m));

const preview = createPreview({
  stage: byId("stage"),
  frames: byId("frames"),
  panes: { source: byId("pane-source"), compiled: byId("pane-compiled") },
  onDoc: (kind, doc) => cross.hookFrame(kind, doc),
});

const code = createCode(
  {
    tabs: byId("code-tabs"),
    gutter: byId("code-gutter"),
    pre: byId("code-text"),
    copyBtn: byId("code-copy", HTMLButtonElement),
    downloadBtn: byId("code-download", HTMLButtonElement),
    meta: byId("code-meta"),
  },
  { click: (at) => cross.codeAt(at) },
);

const fieldsOn = () => state.fields && state.mode !== "html" && state.last?.template !== undefined;

const panels = createPanels({
  initial: initialLayout(initial, narrow.matches),
  prefs,
  compact,
  narrow,
  onView: (v) => {
    cross.clear();
    preview.view(v);
    showInbox();
    paintSims();
    sync();
  },
  onWidth: (w) => {
    cross.clear();
    preview.width(w);
    sync();
  },
});

const cross = createCrossView({
  preview,
  code,
  last: () => state.last,
  fields: fieldsOn,
  narrow: () => narrow.matches,
  openCode: () => panels.openCode(),
});

const problems = createProblems({
  place: (input, loc) => {
    const at = code.locate("source", loc.line, sourceCol(input, loc));
    return { line: at.line, col: at.col + 1 };
  },
  reveal: (input, d) => {
    if (!panels.dockOpen()) panels.setDockOpen(true);
    panels.setDock("code");
    panels.showPanel("code");
    code.reveal("source", d.loc.line, d.severity === "error" ? "error" : "", sourceCol(input, d.loc));
  },
});

const sync = () =>
  writeHash({
    email: state.email?.name,
    data: state.set,
    mode: state.mode,
    view: panels.view,
    width: panels.width,
    fields: state.fields && state.mode !== "html" ? "1" : "",
    sim: state.sims.join(","),
  });

// ---- status strip

/** @param {SizeInfo | null} size */
const showSize = (size, stale = false) => {
  const box = byId("size");
  if (!size) return void (box.hidden = true);
  const v = sizeView(size, stale);
  box.hidden = false;
  box.dataset.level = v.level;
  box.classList.toggle("stale", stale);
  byId("size-text").textContent = v.text;
  byId("size-max").textContent = v.max;
  const meter = byId("meter");
  /** @type {HTMLElement} */ (meter.firstElementChild).style.width = `${v.meter}%`;
  meter.setAttribute("aria-label", v.label);
  byId("size-note").textContent = v.note;
  box.title = v.title;
};

/** @param {RenderResponse | null} r */
const showFilled = (r) => {
  const pill = byId("filled");
  pill.hidden = !r?.filled;
  if (!r?.filled) return;
  pill.textContent = (r.filled === "engine" ? `filled by ${MODE_LABEL[state.mode]}` : "filled by preview()") + (r.unlinked ? " · links off" : "");
  pill.className = `pill ${r.filled === "engine" && !r.unlinked ? "" : "warn"}`;
  pill.title =
    (r.filled === "engine"
      ? "The real template engine filled the compiled template"
      : `${MODE_LABEL[state.mode]} isn't installed, so td;dr's preview() filled it — close, but not the ESP's engine`) +
    (r.unlinked ? `. Clicks can't be linked across the frames: ${r.unlinked}` : "");
};

/** @param {boolean} on */
const showLive = (on) => {
  byId("live").className = `live ${on ? "on" : "off"}`;
  byId("live-text").textContent = on ? "Live" : "Disconnected";
  byId("live").title = on ? "Live reload connected" : "Live reload disconnected, retrying";
};

// ---- rendering

/** @param {ApiError | null} err */
const showError = (err) => {
  const box = byId("render-error");
  state.failed = !!err;
  byId("stale-note").hidden = !err;
  if (err) byId("inbox").hidden = true;
  paintSims();
  if (!err) {
    box.hidden = true;
    byId("frames").classList.remove("stale");
    byId("size").classList.remove("stale");
    return;
  }
  const where = err.file ? `${err.file}${err.line !== undefined ? `:${err.line}:${err.col}` : ""}` : "";
  const frames = err.stack ? err.stack.split("\n").filter((l) => /^\s*at /.test(l)).length : 0;
  // replaceChildren would print a missing part as "undefined"
  box.replaceChildren(
    h("div", { class: "err-top" }, icon("error"), h("span", {}, "Render failed"), h("span", { class: "rec" }, "Recovers on the next save")),
    h(
      "div",
      { class: "err-body" },
      ...[
        h("p", { class: "err-msg" }, err.message ?? "unknown error"),
        where && h("div", { class: "err-where" }, where),
        err.frame && h("pre", { class: "err-frame" }, err.frame),
        err.stack && h("details", {}, h("summary", {}, frames ? `Stack trace (${frames} frames)` : "Stack trace"), h("pre", {}, err.stack)),
      ].filter(Boolean),
    ),
  );
  box.hidden = false;
  byId("frames").classList.add("stale");
  byId("size").classList.add("stale");
};

let shown = ""; // which email/mode the frames show; an error elsewhere shouldn't leave them up

const clearOutput = () => {
  preview.show("", "");
  code.set({});
  problems.set([], "");
  showSize(null);
  showFilled(null);
  shown = "";
};

const showFrames = () => {
  const r = state.last;
  cross.clear();
  if (!r) return;
  // both frames show their own unfilled form: the author's markup and the compiled template
  if (fieldsOn()) preview.show(chipify(blockify(readableFields(r.input ?? r.source))), simulate(chipify(r.template ?? "", true), state.sims));
  // filled frames are the annotated copies, when there are any: same look, plus what each element came from
  else preview.show(r.sourceShown ?? r.source, simulate(r.htmlShown ?? r.html, state.sims));
};

// ---- client simulation: the Compiled frame only, and said so wherever it shows

const simBox = byId("sim", HTMLDetailsElement);
const simInputs = SIMS.map((s) => {
  const input = h("input", { type: "checkbox", id: `sim-${s.id}`, value: s.id, "aria-describedby": `sim-${s.id}-does` });
  byId("sim-opts").append(
    h(
      "div",
      { class: "sim-opt" },
      h("label", {}, input, h("span", {}, s.label)),
      h("p", { id: `sim-${s.id}-does` }, s.does, s.like && h("span", { class: "like" }, ` For example ${s.like}.`)),
    ),
  );
  return input;
});

const paintSims = () => {
  const on = new Set(state.sims);
  for (const input of simInputs) {
    const id = /** @type {Sim} */ (input.value);
    // no @media is part of no <style>
    input.disabled = id === "nomedia" && on.has("nostyle");
    input.checked = on.has(id) || input.disabled;
  }
  const active = SIMS.filter((s) => on.has(s.id) && !(s.id === "nomedia" && on.has("nostyle")));
  simBox.classList.toggle("active", active.length > 0);
  byId("sim-value").textContent = active.length > 1 ? `${active.length} limits` : (active[0]?.label ?? "Off");
  const shown = active.length > 0 && panels.view !== "source";
  byId("sim-bar").hidden = !shown || !state.last || state.failed;
  byId("sim-text").textContent = `Simulated: ${active.map((s) => s.label).join(", ")}${on.has("dark") ? " (an approximation)" : ""}. The code, size and Copy show the real output.`;
  byId("sim-tag").hidden = !active.length;
  byId("pane-compiled").classList.toggle("simulated", active.length > 0);
};

/** @param {Sim[]} sims */
const setSims = (sims) => {
  state.sims = parseSims(sims.join(","));
  paintSims();
  sync();
  showFrames();
};

byId("sim-opts").addEventListener("change", () => setSims(simInputs.filter((i) => i.checked && !i.disabled).map((i) => /** @type {Sim} */ (i.value))));
byId("sim-off").addEventListener("click", () => setSims([]));
// a menu: Escape or a click elsewhere closes it
simBox.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || !simBox.open) return;
  simBox.open = false;
  simBox.querySelector("summary")?.focus();
});
addEventListener("click", (e) => {
  if (simBox.open && !simBox.contains(/** @type {Node} */ (e.target))) simBox.open = false;
});

// subject and preheader as an inbox would show them, read from the compiled markup
const showInbox = () => {
  const box = byId("inbox");
  const r = state.last;
  const single = panels.view === "source" || panels.view === "compiled";
  box.hidden = !r || !single || state.failed;
  if (!r || box.hidden) return;
  const doc = new DOMParser().parseFromString(r.html, "text/html");
  const hidden = [...doc.querySelectorAll("div, span")].find(
    (el) => /display:\s*none/.test(el.getAttribute("style") ?? "") && el.textContent?.trim(),
  );
  const subject = doc.title.trim();
  byId("inbox-subject").textContent = subject || "(no subject)";
  byId("inbox-pre").textContent = `— ${hidden ? (hidden.textContent ?? "").trim().replace(/\s+/g, " ") : "(no preheader)"}`;
};

/** @param {EmailSummary} e @param {RenderResponse} r */
const apply = (e, r) => {
  showError(null);
  shown = `${e.name}/${state.mode}`;
  state.last = r;
  showFrames();
  showInbox();
  paintSims();
  code.set({
    compiled: { text: r.html, file: `${e.name}.html` },
    ...(r.template !== undefined && { template: { text: r.template, file: `${e.name}.${state.mode}.html` } }),
    source: { text: readableFields(r.input ?? r.source), file: `${e.name}.source.html` },
  });
  problems.set(r.diagnostics, r.input ?? r.source);
  showSize(r.size);
  showFilled(r);
  list.counts.set(e.name, countBySeverity(r.diagnostics));
  list.paint();
};

const renders = createLatest({
  send: api.render,
  // a reload under 300 ms shouldn't flash anything
  busy: (on) => document.body.classList.toggle("busy", on),
  done: (r, ms) => {
    const e = state.email;
    byId("reload").textContent = `Reloaded in ${Math.round(ms)} ms`;
    if (!e) return;
    if (r.ok) return apply(e, r.body);
    if (shown !== `${e.name}/${state.mode}`) clearOutput();
    showError(r.body.error ?? { message: api.errorMessage(r) });
    list.counts.set(e.name, FAILED);
    list.paint();
  },
});

const render = async () => {
  if (!state.email) return;
  /** @type {RenderRequest} */
  const req = { email: state.email.name, mode: state.mode, ...dataSource(state.set, editor.model) };
  await renders.run(req);
};

const renderSoon = debounce(render, 250);

// ---- data sets

const hideNotice = () => {
  byId("data-notice").hidden = true;
};

const picker = byId("data-set", HTMLSelectElement);
const editor = createEditor(
  {
    picker,
    textarea: byId("data-text", HTMLTextAreaElement),
    back: byId("data-back"),
    status: byId("data-status"),
    save: byId("data-save", HTMLButtonElement),
    saveAs: byId("data-save-as", HTMLButtonElement),
    revert: byId("data-revert", HTMLButtonElement),
  },
  {
    edit: renderSoon,
    state: (v) => {
      byId("data-dot").hidden = !v.dirty;
      byId("unsaved").hidden = !v.dirty;
      const pill = byId("data-pill");
      pill.textContent = v.pill;
      pill.className = `pill ${v.pillTone}`;
      if (!v.dirty) hideNotice();
    },
    pick: async (set) => {
      if (!confirmDiscard()) return void (picker.value = state.set);
      state.set = set;
      renders.cancel();
      sync();
      await loadSet();
      render();
    },
    save: async () => {
      if (!state.email) return;
      const r = await api.putData(state.email.name, state.set, editor.model.text);
      if (!r.ok) return editor.notice(`Save failed: ${api.errorMessage(r)}`, true);
      // the file is pretty-printed now; show what's on disk
      await loadSet();
      editor.notice("Saved");
    },
    saveAs: async () => {
      if (!state.email) return;
      const name = prompt("Name for the new data set", saveAsName(state.set));
      if (name === null) return;
      const r = await api.newData(state.email.name, name, editor.model.text);
      if (!r.ok) return editor.notice(`Save as failed: ${api.errorMessage(r)}`, true);
      state.set = r.body.name;
      sync();
      await refreshList();
      await loadSet();
      render();
    },
  },
);

const confirmDiscard = () => !editor.model.dirty || confirm("Discard unsaved data edits?");

const loads = createGate();
const loadSet = async () => {
  const e = state.email;
  if (!e) return;
  const ticket = loads.begin();
  hideNotice();
  byId("data-file").textContent = state.set ? `${state.set}.json` : "no data set";
  if (!state.set) return editor.load(e.data, "", "{}\n");
  const set = state.set;
  const r = await api.getData(e.name, set);
  // another email or set was picked meanwhile; its own load fills the editor
  if (!ticket.current) return;
  if (r.ok) return editor.load(e.data, set, r.body.text);
  editor.load(e.data, set, "{}\n");
  editor.notice(api.errorMessage(r), true);
};

// the file changed while there are unsaved edits: say so, change nothing
const diskChanged = () => {
  byId("data-notice-text").textContent = `${state.set}.json changed on disk. You have unsaved edits, so nothing was reloaded.`;
  byId("data-notice").hidden = false;
};

byId("notice-load").addEventListener("click", async () => {
  await loadSet();
  render();
});
byId("notice-keep").addEventListener("click", hideNotice);

// ---- emails

const list = createEmailList({
  emails: () => state.emails,
  current: () => state.email?.name,
  open: (name, from) => {
    panels.showPanel("preview");
    if (from === "list" && compact.matches) panels.setList(false);
    select(name);
  },
  instead: () => {
    if (!narrow.matches) return false;
    panels.setPanel("emails");
    return true;
  },
});

// the other emails' counts, rendered one at a time in the background
const counting = createGate();
/** @param {string[]} names */
const countOthers = async (names) => {
  const ticket = counting.begin();
  for (const name of names) {
    if (!ticket.current) return;
    const e = state.emails.find((x) => x.name === name);
    if (!e || e.name === state.email?.name) continue;
    const r = await api.render({ email: e.name, mode: e.template[0] ?? "html", ...(e.data[0] ? { data: e.data[0] } : { json: {} }) });
    if (!ticket.current) return;
    list.counts.set(name, r.ok ? countBySeverity(r.body.diagnostics) : FAILED);
    list.paint();
  }
};

const paintModes = () => {
  /** @type {RenderMode[]} */
  const modes = ["html", ...(state.email?.template ?? [])];
  const box = byId("modes");
  box.replaceChildren(
    ...modes.map((m) => h("button", { type: "button", "aria-pressed": String(m === state.mode), onclick: () => setMode(m) }, MODE_LABEL[m] ?? m)),
  );
  box.hidden = modes.length < 2;
  // raw fields only mean something for a template dialect
  const fields = byId("fields");
  fields.hidden = state.mode === "html";
  for (const b of /** @type {NodeListOf<HTMLButtonElement>} */ (fields.querySelectorAll("button"))) {
    b.setAttribute("aria-pressed", String((b.dataset.fields === "1") === state.fields));
  }
};

const paintTitle = () => {
  const e = state.email;
  byId("title").textContent = e?.name ?? "No emails";
  byId("title-fw").textContent = e ? frameworkName(e.framework) : "";
  byId("title-tpl").hidden = !e?.template.length;
};

const lists = createGate();
const refreshList = async () => {
  const ticket = lists.begin();
  const r = await api.listEmails();
  if (!ticket.current) return false;
  if (!r.ok) {
    showError(r.body.error ?? { message: api.errorMessage(r) });
    return false;
  }
  state.emails = r.body.emails;
  byId("dir").textContent = r.body.dir ?? "";
  byId("dir").title = r.body.dir ?? "";
  const was = state.email;
  if (was) state.email = state.emails.find((e) => e.name === was.name) ?? null;
  list.paint();
  paintTitle();
  return true;
};

/** @param {string | undefined} name @param {Hash} [prefer] */
const select = async (name, prefer = {}) => {
  if (state.email && name !== state.email.name && !confirmDiscard()) return;
  const e = state.emails.find((x) => x.name === name) ?? state.emails[0];
  if (!e) return;
  state.email = e;
  problems.clearPick();
  // a template email is mostly looked at filled in, so start in its first dialect
  state.mode = modeOf(e, prefer.mode) ?? e.template[0] ?? "html";
  state.set = prefer.data !== undefined && e.data.includes(prefer.data) ? prefer.data : (e.data[0] ?? "");
  // whatever is still rendering is for what was open before
  renders.cancel();
  paintTitle();
  list.paint();
  paintModes();
  sync();
  await loadSet();
  await render();
  countOthers(state.emails.map((x) => x.name).filter((n) => !list.counts.has(n)));
};

/** @param {boolean} on */
const setFields = (on) => {
  state.fields = on;
  paintModes();
  sync();
  showFrames();
};

byId("fields").addEventListener("click", (e) => {
  const b = /** @type {Element} */ (e.target).closest("button[data-fields]");
  if (b instanceof HTMLElement) setFields(b.dataset.fields === "1");
});

/** @param {RenderMode} m */
const setMode = (m) => {
  state.mode = m;
  paintModes();
  sync();
  render();
};

// ---- code panel and the rest of the controls

/** @param {boolean} on */
const setFormat = (on) => {
  byId("code-format").setAttribute("aria-pressed", String(on));
  prefs.setFormat(on);
  code.setFormat(on);
  cross.clear();
  problems.render();
};
byId("code-format").addEventListener("click", () => setFormat(byId("code-format").getAttribute("aria-pressed") !== "true"));
byId("counts").addEventListener("click", () => {
  if (!panels.dockOpen()) panels.setDockOpen(true);
  panels.showPanel("data");
  problems.expand();
});
const opacity = byId("overlay-opacity", HTMLInputElement);
opacity.addEventListener("input", () => preview.opacity(opacity.value));

// ---- keyboard

/** @type {Record<string, ViewChoice>} */
const VIEW_KEYS = { 1: "source", 2: "compiled", 3: "compare" };

addEventListener("keydown", (e) => {
  const mod = e.metaKey || e.ctrlKey;
  const key = e.key.toLowerCase();
  if (mod && key === "k") {
    e.preventDefault();
    return list.togglePalette();
  }
  if (mod && key === "s") {
    // inside the editor its own handler already saved
    if (!e.defaultPrevented && state.email) {
      e.preventDefault();
      const save = byId("data-save", HTMLButtonElement);
      if (!save.disabled) save.click();
    }
    return;
  }
  if (e.key === "Escape" && compact.matches && panels.listOpen()) return panels.setList(false);
  if (mod || e.altKey || (e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable]"))) return;
  const view = VIEW_KEYS[key];
  if (view) panels.setView(view);
  else if (key === "d") panels.setWidth(600);
  else if (key === "m") panels.setWidth(375);
  else if (key === "`") panels.setDockOpen(!panels.dockOpen());
  else if (key === "/") {
    e.preventDefault();
    panels.focusFilter();
  }
});

// someone edited the hash by hand, or followed a link
addEventListener("hashchange", () => {
  const next = readHash();
  if ((next.sim ?? "") !== state.sims.join(",")) setSims(parseSims(next.sim));
  if (next.view && next.view !== panels.view && isView(next.view)) panels.setView(next.view);
  if (next.width && Number(next.width) !== panels.width && Number(next.width) > 0) panels.setWidth(Number(next.width));
  if (next.email && next.email !== state.email?.name) return void select(next.email, next);
  const e = state.email;
  if (!e) return;
  const data = next.data;
  const set = data !== undefined && data !== "" && data !== state.set && e.data.includes(data) && confirmDiscard();
  if (set) {
    state.set = data;
    renders.cancel();
  }
  if ((next.fields === "1") !== state.fields) setFields(next.fields === "1");
  // a mode the email isn't written for is left alone
  const mode = next.mode !== state.mode ? modeOf(e, next.mode) : undefined;
  (set ? loadSet() : Promise.resolve()).then(() => (mode ? setMode(mode) : set && render()));
});

// ---- live reload

/** @template {keyof ServerEvents} K @param {EventSource} es @param {K} name @param {(data: ServerEvents[K]) => void} fn */
const onEvent = (es, name, fn) => es.addEventListener(name, (e) => fn(JSON.parse(/** @type {MessageEvent<string>} */ (e).data)));

/** @param {ChangeEvent[]} events */
const onChanges = async (events) => {
  if (events.some((e) => STRUCTURAL.has(e.kind))) {
    const before = state.email;
    await refreshList();
    // the email we were on went away: land on another one
    if (before && !state.email) return select(state.emails[0]?.name);
    const e = state.email;
    if (e && state.set && !e.data.includes(state.set)) {
      state.set = e.data[0] ?? "";
      sync();
      await loadSet();
    }
    if (!before && state.emails.length) return select(state.emails[0]?.name);
  }
  const touched = events.some((e) => e.email === state.email?.name && e.data === state.set && e.kind === "change");
  if (touched) {
    if (editor.model.dirty) diskChanged();
    else await loadSet();
  }
  render();
  // other emails may share the file that changed; refresh their counts quietly
  const current = state.email?.name;
  const others = [...new Set(events.flatMap((e) => (e.email && e.email !== current ? [e.email] : [])))];
  if (events.some((e) => !e.email)) list.counts.clear();
  countOthers(others.length ? others : state.emails.map((x) => x.name).filter((n) => !list.counts.has(n)));
};

const live = () => {
  /** @type {ChangeEvent[]} */
  let pending = [];
  let lost = false;
  const flush = debounce(() => {
    const evs = pending;
    pending = [];
    onChanges(evs);
  }, 120);
  const es = new EventSource(EVENTS);
  es.addEventListener("open", () => {
    showLive(true);
    // the server restarted or we slept: anything could have changed
    if (lost) {
      pending.push({ kind: "add", file: "" });
      flush();
    }
    lost = false;
  });
  es.addEventListener("error", () => {
    showLive(false);
    lost = true;
  });
  onEvent(es, "change", (ev) => {
    pending.push(ev);
    flush();
  });
};

// ---- start

byId("host").textContent = location.host;
panels.restore();
if (!prefs.format()) setFormat(false);
panels.setDockPos(prefs.dockPos());
if (!prefs.codeOpen()) panels.setDockOpen(false);
panels.setPanel("preview");
panels.setView(panels.view);
panels.setWidth(panels.width);
panels.setDock("code");
preview.opacity(opacity.value);
paintSims();
if (await refreshList()) await select(initial.email ?? state.emails[0]?.name, initial);
live();

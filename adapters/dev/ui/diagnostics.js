// The Problems list: one row per diagnostic, worst first, rows in the author's own markup clickable.
import { h, icon, readableFields } from "./dom.js";

/** @typedef {import("../protocol.ts").Diagnostic} Diagnostic */
/** @typedef {Diagnostic["severity"]} Severity */
/** @typedef {NonNullable<Diagnostic["loc"]>} Loc */
/** @typedef {Record<Severity, number>} Counts */
/** @typedef {Severity | "all"} Filter */

export const SEVERITIES = /** @type {const} */ (["error", "warning", "info"]);
const ORDER = { error: 0, warning: 1, info: 2 };
const NAME = { error: "Error", warning: "Warning", info: "Info" };

/** @param {Diagnostic[]} ds @returns {Counts} */
export const countBySeverity = (ds) => {
  const c = { error: 0, warning: 0, info: 0 };
  for (const d of ds) c[d.severity] = (c[d.severity] ?? 0) + 1;
  return c;
};

// filter chips: only severities that exist, so a clean build stays quiet
/** @param {Counts} c @param {number} total @returns {{ id: Filter, text: string, sev: Severity | null }[]} */
export const chipsFor = (c, total) => {
  if (!total) return [];
  /** @type {{ id: Filter, text: string, sev: Severity | null }[]} */
  const chips = [{ id: "all", text: `All ${total}`, sev: null }];
  for (const s of SEVERITIES) if (c[s]) chips.push({ id: s, text: String(c[s]), sev: s });
  return chips;
};

// a field marker is one char in the input and two ({{ or }}) in Source
/** @param {string} input @param {Loc} loc */
export const sourceCol = (input, loc) => {
  const before = (input.split("\n")[loc.line - 1] ?? "").slice(0, loc.col - 1);
  return loc.col - 1 + (before.match(/[]/g)?.length ?? 0);
};

// hints are written in a little markdown: `code` and [text](https://…)
/** @param {string} text */
const rich = (text) =>
  text.split(/(`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/).map((part) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 1) return h("code", {}, part.slice(1, -1));
    const link = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(part);
    return link ? h("a", { href: link[2], target: "_blank", rel: "noreferrer" }, link[1]) : part;
  });

// the line a diagnostic points at, with a caret under the column
/** @param {string[]} lines @param {Loc} loc */
const excerpt = (lines, loc) => {
  const text = lines[loc.line - 1];
  if (text === undefined) return null;
  // long minified lines: keep a window around the column
  const start = Math.max(0, loc.col - 60);
  const shown = (start > 0 ? "…" : "") + text.slice(start, start + 120).replace(/\t/g, " ");
  const at = Math.max(0, loc.col - 1 - start + (start > 0 ? 1 : 0));
  const caret = " ".repeat(readableFields(shown.slice(0, at)).length) + "^";
  return h("pre", { class: "excerpt" }, `${readableFields(shown)}\n${caret}`);
};

/** @param {Diagnostic} d */
export const diagKey = (d) => `${d.code}@${d.loc ? `${d.loc.file ?? ""}:${d.loc.line}:${d.loc.col}` : ""}`;

// `source` is the markup the locations point into. Rows that point into it are buttons;
// `onPick(d)` runs on click, and the row matching `selected` is marked and shows its line.
/**
 * @param {HTMLElement} list @param {Diagnostic[]} ds @param {string} source
 * @param {{ filter?: Filter, selected?: string | null, onPick: (d: Diagnostic & { loc: Loc }) => void, place?: (loc: Loc) => { line: number, col: number } }} o
 */
export const renderDiagnostics = (list, ds, source, { filter = "all", selected = null, onPick, place = (loc) => loc }) => {
  list.replaceChildren();
  if (ds.length === 0) {
    list.append(h("li", { class: "empty" }, icon("check"), "No problems in the last compile."));
    return;
  }
  const shown = ds.filter((d) => filter === "all" || d.severity === filter);
  if (shown.length === 0) {
    list.append(h("li", { class: "empty" }, "Nothing at this severity."));
    return;
  }
  const lines = source.split("\n");
  const sorted = [...shown].sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || (a.loc?.line ?? 0) - (b.loc?.line ?? 0));
  for (const d of sorted) {
    const loc = d.loc;
    const own = loc && !loc.file ? loc : null;
    const key = diagKey(d);
    const isSel = key === selected;
    // a location in our own markup is shown where the panel shows it (the panel may format the text)
    const at = own ? place(own) : loc;
    const where = loc && at ? `${loc.file ? `${loc.file}:` : ""}${at.line}:${at.col}` : "";
    const row = h(
      own ? "button" : "div",
      { class: "diag-row", ...(own && { type: "button", "aria-pressed": String(isSel), title: "Show in source markup", onclick: () => onPick({ ...d, loc: own }) }) },
      h("span", { class: "diag-ic" }, icon(d.severity), h("span", { class: "sr-only" }, NAME[d.severity])),
      h(
        "span",
        { class: "diag-body" },
        h("span", { class: "diag-line" }, h("code", { class: "diag-code" }, d.code), h("span", { class: "diag-msg" }, d.message)),
        d.hint && h("span", { class: "diag-hint" }, rich(d.hint)),
      ),
      where && h("span", { class: "loc" }, where),
    );
    list.append(h("li", { class: `diag ${d.severity}${isSel ? " selected" : ""}` }, row, isSel && own && excerpt(lines, own)));
  }
};

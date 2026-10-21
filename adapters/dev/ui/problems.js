// The Problems panel and the counts in the status strip: what the last compile said, a severity
// filter, and the picked row, which marks its line in the Source tab.
import { chipsFor, countBySeverity, diagKey, renderDiagnostics, SEVERITIES } from "./diagnostics.js";
import { byId, h, icon } from "./dom.js";

/** @typedef {import("./diagnostics.js").Diagnostic} Diagnostic */
/** @typedef {import("./diagnostics.js").Filter} Filter */
/** @typedef {import("./diagnostics.js").Loc} Loc */

/**
 * @param {{
 *   place: (input: string, loc: Loc) => { line: number, col: number },
 *   reveal: (input: string, d: Diagnostic & { loc: Loc }) => void,
 * }} on place: where the code panel shows a location; reveal: show a picked one there
 */
export const createProblems = (on) => {
  const section = byId("diags-section");
  const list = byId("diags");
  const toggle = byId("prob-toggle");
  /** @type {Diagnostic[]} */
  let diags = [];
  let input = "";
  /** @type {string | null} */
  let pick = null;
  /** @type {Filter} */
  let sev = "all";

  const showCounts = () => {
    const c = countBySeverity(diags);
    for (const s of SEVERITIES) {
      const n = byId(`count-${s}`);
      n.textContent = String(c[s]);
      n.parentElement?.classList.toggle("on", c[s] > 0);
    }
    byId("counts").setAttribute("aria-label", `${c.error} errors, ${c.warning} warnings, ${c.info} info`);
    section.classList.toggle("has-errors", c.error > 0);
    const tab = byId("tab-issues");
    tab.hidden = !(c.error + c.warning);
    tab.textContent = String(c.error + c.warning);
    tab.dataset.worst = c.error ? "error" : "warning";
    byId("mobile-tabs")
      .querySelector('[data-panel="data"]')
      ?.setAttribute("aria-label", c.error + c.warning ? `Data, ${c.error} errors, ${c.warning} warnings` : "Data");
    if (sev !== "all" && !c[sev]) sev = "all";
    byId("chips").replaceChildren(
      ...chipsFor(c, diags.length).map(({ id, text, sev: s }) =>
        h(
          "button",
          {
            type: "button",
            "aria-pressed": String(sev === id),
            "aria-label": s ? `${text} ${s}s` : text,
            onclick: () => {
              sev = id;
              showCounts();
              render();
            },
          },
          s && icon(s),
          text,
        ),
      ),
    );
  };

  const render = () =>
    renderDiagnostics(list, diags, input, {
      filter: sev,
      selected: pick,
      place: (loc) => on.place(input, loc),
      onPick: (d) => {
        pick = diagKey(d);
        render();
        on.reveal(input, d);
      },
    });

  toggle.addEventListener("click", () => {
    const collapsed = section.classList.toggle("collapsed");
    toggle.setAttribute("aria-expanded", String(!collapsed));
  });

  return {
    /** @param {Diagnostic[]} ds @param {string} markup what the locations point into */
    set(ds, markup) {
      diags = ds;
      input = markup;
      if (!ds.some((d) => diagKey(d) === pick)) pick = null;
      showCounts();
      render();
    },
    // the code panel changed how it shows the markup (formatting on or off)
    render,
    clearPick() {
      pick = null;
    },
    // the counts in the strip open the list
    expand() {
      section.classList.remove("collapsed");
      toggle.setAttribute("aria-expanded", "true");
      section.scrollIntoView({ block: "nearest" });
    },
  };
};

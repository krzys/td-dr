// The email list in the sidebar and the ⌘K switcher over it, each row with its framework, a
// template badge and the error and warning counts of its last render.
import { byId, h, icon } from "./dom.js";

/** @typedef {import("../protocol.ts").EmailSummary} EmailSummary */
/** @typedef {import("./diagnostics.js").Counts} Counts */

export const MODE_LABEL = /** @type {Record<string, string>} */ ({ html: "HTML", handlebars: "Handlebars", liquid: "Liquid" });
const FRAMEWORK = /** @type {Record<string, [name: string, letter: string]>} */ ({ react: ["React", "R"], vue: ["Vue", "V"] });

/** @param {string} framework */
export const frameworkName = (framework) => FRAMEWORK[framework]?.[0] ?? framework;

/** @param {Counts | undefined} c */
const countBadges = (c) => [
  !!c?.error && h("span", { class: "cn error" }, icon("error"), String(c.error)),
  !!c?.warning && h("span", { class: "cn warning" }, icon("warning"), String(c.warning)),
];

/**
 * @param {{
 *   emails: () => EmailSummary[],
 *   current: () => string | undefined,
 *   open: (name: string, from: "list" | "palette") => void,
 *   instead: () => boolean,
 * }} o open: a row was picked; instead: true when the layout answers ⌘K itself (a phone shows the list)
 */
export const createEmailList = ({ emails, current, open, instead }) => {
  /** @type {Map<string, Counts>} errors and warnings per email, filled in as each one is rendered */
  const counts = new Map();
  const filter = byId("filter", HTMLInputElement);
  const palette = byId("palette", HTMLDialogElement);
  const paletteInput = byId("palette-input", HTMLInputElement);
  const paletteList = byId("palette-list");
  let paletteSel = 0;

  const paint = () => {
    const all = emails();
    const q = filter.value.trim().toLowerCase();
    const items = all
      .filter((e) => e.name.toLowerCase().includes(q))
      .map((e) => {
        const [fwName, fw] = FRAMEWORK[e.framework] ?? [e.framework, e.framework[0]?.toUpperCase() ?? "?"];
        const c = counts.get(e.name);
        return h(
          "li",
          {},
          h(
            "a",
            {
              href: `#email=${encodeURIComponent(e.name)}`,
              class: `email${e.name === current() ? " active" : ""}`,
              "aria-label": [e.name, fwName, e.template.length && "template", c?.error && `${c.error} errors`, c?.warning && `${c.warning} warnings`]
                .filter(Boolean)
                .join(", "),
              onclick: (/** @type {Event} */ ev) => {
                ev.preventDefault();
                open(e.name, "list");
              },
            },
            h("span", { class: "fw", title: fwName }, fw),
            h("span", { class: "email-name", title: e.name }, e.name),
            e.template.length > 0 && h("span", { class: "badge", title: `${e.template.map((t) => MODE_LABEL[t]).join(" and ")} template` }, "tpl"),
            ...countBadges(c),
          ),
        );
      });
    byId("emails").replaceChildren(...items);
    byId("email-count").textContent = String(all.length);
    document.body.classList.toggle("no-emails", all.length === 0);
  };

  // ---- ⌘K: a small switcher over every email, arrows and Enter

  const paletteRows = () => {
    const q = paletteInput.value.trim().toLowerCase();
    return emails().filter((e) => e.name.toLowerCase().includes(q));
  };
  const paintPalette = () => {
    const rows = paletteRows();
    paletteSel = Math.min(paletteSel, Math.max(0, rows.length - 1));
    paletteList.replaceChildren(
      ...rows.map((e, i) => {
        const [fwName, fw] = FRAMEWORK[e.framework] ?? [e.framework, "?"];
        return h(
          "li",
          {
            role: "option",
            "aria-selected": String(i === paletteSel),
            onclick: () => {
              palette.close();
              open(e.name, "palette");
            },
          },
          h("span", { class: "fw", title: fwName }, fw),
          h("span", { class: "email-name" }, e.name),
          e.template.length > 0 && h("span", { class: "badge" }, "tpl"),
          ...countBadges(counts.get(e.name)),
        );
      }),
    );
    paletteList.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  };
  const openPalette = () => {
    if (instead() || !emails().length) return;
    paletteInput.value = "";
    paletteSel = Math.max(0, emails().findIndex((e) => e.name === current()));
    paintPalette();
    palette.showModal();
    paletteInput.focus();
  };
  paletteInput.addEventListener("input", () => {
    paletteSel = 0;
    paintPalette();
  });
  paletteInput.addEventListener("keydown", (e) => {
    const n = paletteRows().length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      paletteSel = (paletteSel + (e.key === "ArrowDown" ? 1 : -1) + n) % Math.max(1, n);
      paintPalette();
    } else if (e.key === "Enter") {
      e.preventDefault();
      /** @type {HTMLElement | null} */ (paletteList.querySelector('[aria-selected="true"]'))?.click();
    }
  });
  palette.addEventListener("click", (e) => {
    if (e.target === palette) palette.close();
  });
  byId("switcher").addEventListener("click", () => openPalette());
  filter.addEventListener("input", paint);
  filter.addEventListener("keydown", (e) => {
    if (e.key === "Enter") /** @type {HTMLElement | null} */ (document.querySelector(".email"))?.click();
    if (e.key === "Escape") {
      filter.value = "";
      paint();
      filter.blur();
    }
  });

  return {
    paint,
    counts,
    togglePalette: () => (palette.open ? palette.close() : openPalette()),
  };
};

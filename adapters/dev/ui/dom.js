/** @typedef {Node | string | false | null | undefined} Kid */

// h("button", { class: "x", onclick }, "label") — enough DOM building for this page
/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {Record<string, unknown>} [props]
 * @param {...(Kid | Kid[])} kids
 * @returns {HTMLElementTagNameMap[K]}
 */
export const h = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = String(v);
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), /** @type {EventListener} */ (v));
    else if (k in n) Reflect.set(n, k, v);
    else n.setAttribute(k, v === true ? "" : String(v));
  }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k);
  return n;
};

// The page's own element with this id, of this type. The page is static: a miss is a bug in it.
/**
 * @template {HTMLElement} [T=HTMLElement]
 * @param {string} id
 * @param {{ new (): T, prototype: T }} [type]
 * @returns {T}
 */
export const byId = (id, type) => {
  const el = document.getElementById(id);
  if (!(el instanceof (type ?? HTMLElement))) throw new Error(`the page has no #${id}${type ? ` of type ${type.name}` : ""}`);
  return /** @type {T} */ (el);
};

/**
 * @template {unknown[]} A
 * @param {(...args: A) => void} fn
 * @param {number} ms
 * @returns {(...args: A) => void}
 */
export const debounce = (fn, ms) => {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};

// fields are private-use characters in the markup; show them the way authors write them
export const readableFields = (/** @type {string} */ s) => s.replace(//g, "{{").replace(//g, "}}");

const NS = "http://www.w3.org/2000/svg";
export const PATHS = {
  error: "M8 14.25a6.25 6.25 0 1 0 0-12.5 6.25 6.25 0 0 0 0 12.5ZM5.9 5.9l4.2 4.2M10.1 5.9l-4.2 4.2",
  warning: "M7.2 2.9 1.8 12.2a.9.9 0 0 0 .8 1.3h10.8a.9.9 0 0 0 .8-1.3L8.8 2.9a.9.9 0 0 0-1.6 0ZM8 6.6v2.8M8 11.4v.01",
  info: "M8 14.25a6.25 6.25 0 1 0 0-12.5 6.25 6.25 0 0 0 0 12.5ZM8 7.4v3.6M8 5.2v.01",
  check: "M3.25 8.5 6.5 11.75 12.75 4.5",
};

// shape per severity, so the list never depends on colour alone
/** @param {keyof typeof PATHS} name */
export const icon = (name) => {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(NS, "path");
  path.setAttribute("d", PATHS[name]);
  svg.append(path);
  return svg;
};

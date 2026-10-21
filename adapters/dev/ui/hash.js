// The selection lives in the URL hash so a reload (or a shared link) lands on the same view.
const KEYS = /** @type {const} */ (["email", "data", "mode", "view", "width", "fields", "sim"]);

/** @typedef {Partial<Record<(typeof KEYS)[number], string>>} Hash */
/** @typedef {Partial<Record<(typeof KEYS)[number], string | number | undefined>>} HashState */

/** @param {string} hash @returns {Hash} */
export const parseHash = (hash) => {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  /** @type {Hash} */
  const out = {};
  for (const k of KEYS) {
    const v = p.get(k);
    if (v !== null) out[k] = v;
  }
  return out;
};

/** @param {HashState} state */
export const formatHash = (state) => {
  const p = new URLSearchParams();
  for (const k of KEYS) if (state[k] !== undefined && state[k] !== "") p.set(k, String(state[k]));
  return `#${p}`;
};

export const readHash = () => parseHash(location.hash);

/** @param {HashState} state */
export const writeHash = (state) => {
  const next = formatHash(state);
  // replaceState: switching views shouldn't fill the back button
  if (next !== location.hash) history.replaceState(null, "", next);
};

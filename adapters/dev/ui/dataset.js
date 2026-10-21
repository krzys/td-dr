// What the data set editor holds: the text as typed, the text as saved, and the last valid object,
// which is what a render gets while the text doesn't parse. No DOM: editor.js draws it.

/** @typedef {Record<string, unknown>} Data */
/** @typedef {{ value: Data, error?: undefined } | { value?: undefined, error: string }} Parsed */

/** @param {string} text @returns {Parsed} */
export const parseData = (text) => {
  try {
    const v = JSON.parse(text);
    if (v === null || typeof v !== "object" || Array.isArray(v)) return { error: "Data must be a JSON object." };
    return { value: v };
  } catch (e) {
    return { error: /** @type {Error} */ (e).message };
  }
};

/**
 * @typedef {{
 *   dirty: boolean, hasSet: boolean, invalid: boolean,
 *   status: string, statusTone: "" | "warn" | "bad",
 *   canSave: boolean, canRevert: boolean, canSaveAs: boolean,
 *   pill: string, pillTone: "" | "warn" | "accent" | "ok",
 * }} DatasetView
 */

export const createDataset = () => {
  let saved = "";
  let text = "";
  let hasSet = false;
  /** @type {Data} */
  let lastValid = {};
  let note = "";
  let noteBad = false;

  return {
    // `t` as the textarea holds it (it turns CRLF into LF), so a file with CRLF isn't "edited"
    /** @param {string} t @param {boolean} fromSet */
    load(t, fromSet) {
      text = saved = t;
      hasSet = fromSet;
      note = "";
      lastValid = parseData(t).value ?? {};
    },
    // true when the text parses, so there is new data to render
    /** @param {string} t */
    edit(t) {
      text = t;
      note = "";
      const r = parseData(t);
      if (r.value) lastValid = r.value;
      return !!r.value;
    },
    revert() {
      text = saved;
      note = "";
      lastValid = parseData(saved).value ?? {};
      return text;
    },
    /** @param {string} msg */
    notice(msg, bad = false) {
      note = msg;
      noteBad = bad;
    },
    get dirty() {
      return text !== saved;
    },
    get text() {
      return text;
    },
    get json() {
      return lastValid;
    },
    /** @returns {DatasetView} */
    view() {
      const error = parseData(text).error;
      const dirty = text !== saved;
      const invalid = !!error;
      return {
        dirty,
        hasSet,
        invalid,
        status: error ?? (note || (dirty ? "Edited — not saved" : hasSet ? "Saved" : "No data set — edits apply live")),
        statusTone: error || (note && noteBad) ? "bad" : note ? "warn" : "",
        canSave: hasSet && dirty && !invalid,
        canRevert: dirty,
        canSaveAs: !invalid,
        pill: invalid ? "Invalid JSON" : dirty ? "Unsaved changes" : hasSet ? "Saved" : "Not saved to a file",
        pillTone: invalid ? "warn" : dirty ? "accent" : hasSet ? "ok" : "",
      };
    },
  };
};

/** @typedef {ReturnType<typeof createDataset>} Dataset */

// a saved, untouched set is read from disk; anything typed goes inline
/** @param {string} set @param {Dataset} ds @returns {{ data: string } | { json: Data }} */
export const dataSource = (set, ds) => (set && !ds.dirty ? { data: set } : { json: ds.json });

/** @param {string} set */
export const saveAsName = (set) => (set ? `${set}-copy` : "default");

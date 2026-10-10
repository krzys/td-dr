// The data set editor: a textarea over the editing state in dataset.js, coloured from behind.
import { createDataset } from "./dataset.js";
import { h } from "./dom.js";
import { paint } from "./highlight.js";

/** @typedef {import("./dataset.js").DatasetView} DatasetView */

/**
 * @param {{ picker: HTMLSelectElement, textarea: HTMLTextAreaElement, back: HTMLElement, status: HTMLElement, save: HTMLButtonElement, saveAs: HTMLButtonElement, revert: HTMLButtonElement }} els
 * @param {{ edit: () => void, state?: (v: DatasetView) => void, pick: (set: string) => void, save: () => void, saveAs: () => void }} on
 */
export const createEditor = ({ picker, textarea, back, status, save, saveAs, revert }, on) => {
  const ds = createDataset();

  // the colours sit in a <pre> behind the textarea, whose own text is transparent
  const colour = () => {
    paint(back, `${textarea.value}\n`, "json");
    follow();
  };
  const follow = () => {
    back.scrollTop = textarea.scrollTop;
    back.scrollLeft = textarea.scrollLeft;
  };
  textarea.addEventListener("scroll", follow);

  const update = () => {
    colour();
    const v = ds.view();
    textarea.classList.toggle("invalid", v.invalid);
    status.className = `status${v.statusTone ? ` ${v.statusTone}` : ""}`;
    status.textContent = v.status;
    save.disabled = !v.canSave;
    revert.disabled = !v.canRevert;
    on.state?.(v);
    saveAs.disabled = !v.canSaveAs;
  };

  textarea.addEventListener("input", () => {
    const parsed = ds.edit(textarea.value);
    update();
    if (parsed) on.edit();
  });
  textarea.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      if (!save.disabled) on.save();
    } else if (e.key === "Tab" && !e.shiftKey) {
      // two spaces, not a jump to the next control
      e.preventDefault();
      textarea.setRangeText("  ", textarea.selectionStart, textarea.selectionEnd, "end");
      textarea.dispatchEvent(new Event("input"));
    }
  });
  picker.addEventListener("change", () => on.pick(picker.value));
  save.addEventListener("click", () => on.save());
  saveAs.addEventListener("click", () => on.saveAs());
  revert.addEventListener("click", () => {
    textarea.value = ds.revert();
    update();
    on.edit();
  });

  return {
    /** @param {string[]} sets @param {string} set @param {string} text */
    load(sets, set, text) {
      picker.replaceChildren(
        ...(sets.length ? sets.map((s) => h("option", { value: s, selected: s === set }, s)) : [h("option", { value: "" }, "no data sets")]),
      );
      picker.disabled = sets.length === 0;
      textarea.value = text;
      // the textarea turns CRLF into LF, so compare against what it holds, not the file
      ds.load(textarea.value, !!set);
      update();
    },
    /** @param {string} msg */
    notice(msg, bad = false) {
      ds.notice(msg, bad);
      update();
    },
    model: ds,
  };
};

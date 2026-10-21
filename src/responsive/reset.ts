import { isInherited } from "../style/props.ts";

// What a property goes back to when the base has it and a variant doesn't: its initial value, for the
// properties whose initial value doesn't depend on the element; anything else has no safe reset (E017).
const RESET: Readonly<Record<string, string>> = {
  width: "auto",
  height: "auto",
  margin: "0",
  "margin-top": "0",
  "margin-right": "0",
  "margin-bottom": "0",
  "margin-left": "0",
  "table-layout": "auto",
  "max-height": "none",
  "max-width": "none",
  "min-width": "0",
  "min-height": "0",
  overflow: "visible",
  float: "none",
  opacity: "1",
  padding: "0",
  "background-color": "transparent",
  "background-image": "none",
  "border-radius": "0",
  border: "none",
  "border-top": "none",
  "border-right": "none",
  "border-bottom": "none",
  "border-left": "none",
  "text-transform": "none",
  "text-decoration": "none",
  "letter-spacing": "normal",
  "font-style": "normal",
  "font-variant": "normal",
  "font-weight": "normal",
  "font-optical-sizing": "auto",
  "white-space": "normal",
};

// display:none undone: the element's own display, which the tag decides
const TABLE_PARTS: Readonly<Record<string, string>> = { td: "table-cell", th: "table-cell", tr: "table-row", table: "table" };
const INLINE = new Set(["a", "abbr", "b", "bdi", "bdo", "br", "button", "cite", "code", "del", "dfn", "em", "font", "i", "img", "input", "ins", "kbd", "label", "mark", "q", "s", "samp", "small", "span", "strong", "sub", "sup", "time", "u", "var"]);

export const displayReset = (tag: string): string => TABLE_PARTS[tag] ?? (INLINE.has(tag) ? "inline" : "block");

// mso-* never gets here: Outlook ignores head rules, so the diff skips them
export const resetFor = (tag: string, prop: string): string | undefined => {
  if (prop === "display") return displayReset(tag);
  return RESET[prop];
};

// Inherited properties missing in a variant take the value of the nearest ancestor that has one.
export const inheritsFrom = (prop: string): boolean => isInherited(prop) && !prop.startsWith("--");

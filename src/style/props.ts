// Inherited properties. Also what an InlineNode carries in `style` (minus custom props).
export const INHERITED: ReadonlySet<string> = new Set([
  "color",
  "font-family",
  "font-size",
  "font-style",
  "font-variant",
  "font-weight",
  "line-height",
  "letter-spacing",
  "word-spacing",
  "text-align",
  "text-indent",
  "text-transform",
  "white-space",
  "word-break",
  "overflow-wrap",
  "direction",
  "visibility",
  "list-style-type",
  "list-style-position",
  "list-style-image",
  "border-collapse",
  "border-spacing",
]);

export const isInherited = (prop: string): boolean => INHERITED.has(prop) || prop.startsWith("--");

// Initial values for properties rules ask about; a missing computed value means this.
export const INITIAL: Readonly<Record<string, string>> = {
  display: "inline",
  position: "static",
  float: "none",
  transform: "none",
  "flex-direction": "row",
  "flex-wrap": "nowrap",
  "flex-grow": "0",
  "flex-shrink": "1",
  "flex-basis": "auto",
  "justify-content": "normal",
  "align-items": "normal",
  "align-self": "auto",
  "box-sizing": "content-box",
  "row-gap": "normal",
  "column-gap": "normal",
  "font-size": "16px",
  "font-weight": "400",
  "line-height": "normal",
  "text-align": "start",
  color: "#000000",
};

// Unitless line-height inherits as a factor; clients need px (and Outlook needs
// mso-line-height-rule next to it).
export const lineHeightPx = (style: Readonly<Record<string, string>>): string | undefined => {
  const lh = style["line-height"];
  if (lh === undefined || !/^\d*\.?\d+$/.test(lh)) return lh;
  const fs = Number.parseFloat(style["font-size"] ?? "16");
  return `${Math.round(Number.parseFloat(lh) * fs * 100) / 100}px`;
};

// text-align as a side: Word and LiteHTML know no start or end. Wherever a direction is set the side is
// always stated, as the cells above it state the document's (docs/support.md#the-email-shell).
export const textAlignOf = (style: Readonly<Record<string, string>>): string | undefined => {
  const ta = style["text-align"];
  if (ta !== undefined && ta !== "start" && ta !== "end") return ta;
  if (ta === undefined && style["direction"] === undefined) return undefined;
  return (ta !== "end") === (style["direction"] !== "rtl") ? "left" : "right";
};

export const get = (style: Readonly<Record<string, string>>, prop: string): string | undefined =>
  style[prop] ?? INITIAL[prop];

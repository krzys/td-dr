// What a table cell paints and where its space sits, read from its attributes and inline style.
import { children, isElement, isText, type DomChild, type DomElement, type DomNode } from "../../../src/parse/dom.ts";

export type Box = [top: number, right: number, bottom: number, left: number];

export const CELL = ["td", "th"];
export const SECTION = ["tbody", "thead", "tfoot"];

const PX = /^(?:0|(\d*\.?\d+)px)$/;
// background, borders, an explicit height or line-height (a spacer), mso-* (Outlook only), vendor-prefixed too
const PAINTS = /^(?:-(?:webkit|moz|ms|o)-)?(?:background|border(?!-collapse|-spacing)|outline|box-shadow|height|min-height|max-height|line-height|mso-)/;

// `;` ends a declaration only outside quotes and parentheses (url(data:image/png;base64,…)); comments are dropped
const split = (style: string): string[] => {
  const out: string[] = [];
  let cur = "";
  let depth = 0;
  let quote = "";
  for (let i = 0; i < style.length; i++) {
    const c = style[i]!;
    if (!quote && c === "/" && style[i + 1] === "*") {
      const end = style.indexOf("*/", i + 2);
      i = end < 0 ? style.length : end + 1;
      continue;
    }
    if (quote) {
      if (c === "\\") cur += c + (style[++i] ?? "");
      else cur += c;
      if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (c === ";" && depth === 0) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
};

export const declarations = (style: string): Array<[string, string]> =>
  split(style).flatMap((d) => {
    const i = d.indexOf(":");
    return i < 0 ? [] : [[d.slice(0, i).trim().toLowerCase(), d.slice(i + 1).trim()] as [string, string]];
  });

export const styleOf = (el: DomElement): Array<[string, string]> => declarations(el.attribs["style"] ?? "");

// a hidden cell counts too: padding moved onto or off it shows or vanishes
const HIDDEN = (p: string, v: string): boolean => {
  const w = v.replace(/\s*!\s*important\s*$/, "");
  return (p === "display" && w === "none") || (p === "visibility" && w !== "visible");
};

export const paints = (el: DomElement): boolean => {
  const a = el.attribs;
  if ("hidden" in a || "bgcolor" in a || "background" in a || "height" in a || (a["border"] !== undefined && a["border"] !== "0")) return true;
  return styleOf(el).some(([p, v]) => PAINTS.test(p) || HIDDEN(p, v.toLowerCase()));
};

// A border, rules or a frame draw lines between the rows. Without cellspacing and cellpadding a table
// spaces its cells 2px apart and pads each side a style leaves out by 1px, so only an explicit 0 is plain.
export const plainTable = (t: DomElement): boolean =>
  !paints(t) && t.attribs["cellspacing"] === "0" && t.attribs["cellpadding"] === "0" && !("rules" in t.attribs) && !("frame" in t.attribs);

const SIDE = { top: 0, right: 1, bottom: 2, left: 3 } as const;

// undefined: a value that isn't plain px (em, %, calc, !important), which this doesn't reason about
export const paddingOf = (el: DomElement): Box | undefined => {
  const box: Box = [0, 0, 0, 0];
  for (const [p, v] of styleOf(el)) {
    if (!p.startsWith("padding")) continue;
    const side = SIDE[p.slice(8) as keyof typeof SIDE];
    const tokens = v.split(/\s+/);
    const nums = tokens.map((t) => (PX.exec(t) ? Number.parseFloat(t) : Number.NaN));
    if (nums.some(Number.isNaN)) return undefined;
    if (p === "padding" && nums.length <= 4) {
      const [t = 0, r = t, b = t, l = r] = nums;
      box.splice(0, 4, t, r, b, l);
    } else if (p.length > 8 && side !== undefined && nums.length === 1) box[side] = nums[0]!;
    else return undefined;
  }
  return box;
};

export const setPadding = (el: DomElement, box: Box): void => {
  const rest = styleOf(el)
    .filter(([p]) => !p.startsWith("padding"))
    .map(([p, v]) => `${p}:${v}`);
  if (box.some((n) => n !== 0)) rest.push(`padding:${box.map((n) => (n === 0 ? "0" : `${n}px`)).join(" ")}`);
  if (rest.length) el.attribs["style"] = rest.join(";");
  else delete el.attribs["style"];
};

export const add = (a: Box, b: Box): Box => [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]];

// The space a painted cell has outside it once its wrapper is gone. Only the passes write it, keyed
// by node, so nothing in the input can stand for it; serialize prints it.
export type Gaps = Map<DomElement, Box>;
export const gapOf = (gaps: Gaps, td: DomElement): Box => gaps.get(td) ?? [0, 0, 0, 0];
export const setGap = (gaps: Gaps, td: DomElement, box: Box): void => {
  if (box.some((n) => n !== 0)) gaps.set(td, box);
  else gaps.delete(td);
};

// a cell that got a gap was painted
export const painted = (gaps: Gaps, td: DomElement): boolean => paints(td) || gaps.has(td);

const BLANK = /^[ \t\r\n\f]*$/;
export const blank = (n: DomNode): boolean => isText(n) && BLANK.test(n.data);
export const kidsOf = (el: DomElement): DomNode[] => children(el).filter((c) => !blank(c));
export const only = (el: DomElement, names: string[]): DomElement | undefined => {
  const [k, ...more] = kidsOf(el);
  return k && !more.length && isElement(k) && names.includes(k.name) ? k : undefined;
};

// the rows beside a cell that spans them are columns
export const spansRows = (section: DomElement): boolean =>
  children(section).some((tr) => isElement(tr) && children(tr).some((td) => isElement(td) && (td.attribs["rowspan"] ?? "1") !== "1"));

// sets the parent and sibling pointers too, so the tree stays one a walker can trust
export const adopt = (parent: DomElement, kids: DomChild[]): void => {
  parent.children = kids;
  kids.forEach((k, i) => {
    k.parent = parent;
    k.prev = kids[i - 1] ?? null;
    k.next = kids[i + 1] ?? null;
  });
};

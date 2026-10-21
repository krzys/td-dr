import { FIELD_OPEN } from "../template/tokens.ts";
import { ATTR, TAG } from "./dead-classes.ts";

// Four sides written out (an author's padding-top … padding-left, a cell's four equal border sides)
// said as their shorthand: the same longhands, which every target reads the same way (caniemail's
// css-padding, css-margin, css-border and css-border-radius cover the shorthand and the longhands alike). Only where
// nothing else in the attribute sets those longhands, so the order the declarations come in doesn't
// matter. Outlook-only markup (in comments) is left as it is.
const SIDES = ["top", "right", "bottom", "left"] as const;
const BOXES: ReadonlyArray<readonly [string, (s: string) => string]> = [
  ["padding", (s) => `padding-${s}`],
  ["margin", (s) => `margin-${s}`],
  ["border-width", (s) => `border-${s}-width`],
  ["border-style", (s) => `border-${s}-style`],
  ["border-color", (s) => `border-${s}-color`],
];
// what else in the attribute sets the longhands a group stands for (`border` resets border-image too)
const BORDER = /^border(-(top|right|bottom|left))?(-(width|style|color))?$|^border-image/;
const CORNERS = ["top-left", "top-right", "bottom-right", "bottom-left"];
const covers = (short: string): RegExp => {
  if (short === "border") return BORDER;
  if (short === "border-radius") return /^border(-(top|bottom)-(left|right))?-radius$/;
  const part = /^border-(width|style|color)$/.exec(short)?.[1];
  return part ? new RegExp(`^border(-(top|right|bottom|left))?(-${part})?$`) : new RegExp(`^${short}(-(top|right|bottom|left))?$`);
};

type Decl = [prop: string, value: string];

// `;` inside url() or quotes doesn't split; undefined when the attribute isn't plain declarations
const split = (style: string): Decl[] | undefined => {
  const out: Decl[] = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  for (let i = 0; i <= style.length; i++) {
    const c = style[i];
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "(") depth++;
    else if (c === ")") depth--;
    else if ((c === ";" || c === undefined) && depth === 0) {
      const d = style.slice(start, i).trim();
      start = i + 1;
      if (!d) continue;
      const colon = d.indexOf(":");
      if (colon <= 0) return undefined;
      out.push([d.slice(0, colon).trim().toLowerCase(), d.slice(colon + 1).trim()]);
    }
  }
  return out;
};

const plain = (v: string): boolean => v !== "" && !/!important|var\(/i.test(v) && !v.includes(FIELD_OPEN);

const box = ([t, r, b, l]: readonly string[]): string =>
  (l !== r ? [t, r, b, l] : b !== t ? [t, r, b] : r !== t ? [t, r] : [t]).join(" ");

// Replaces the group's longhands with one declaration at the first of them.
const fold = (decls: Decl[], short: string, names: readonly string[], value: (vals: string[]) => string | undefined): Decl[] => {
  const at = names.map((n) => decls.findIndex(([p]) => p === n));
  if (at.some((i) => i < 0)) return decls;
  const others = decls.filter(([p], i) => !at.includes(i) && covers(short).test(p));
  const vals = at.map((i) => decls[i]![1]);
  const v = others.length === 0 && vals.every(plain) ? value(vals) : undefined;
  if (v === undefined) return decls;
  const first = Math.min(...at);
  return decls.flatMap((d, i) => (i === first ? [[short, v] as Decl] : at.includes(i) ? [] : [d]));
};

const same = (vals: string[]): string | undefined => (vals.every((v) => v === vals[0]) ? vals[0] : undefined);

export const compactStyle = (style: string): string => {
  const parsed = split(style);
  if (!parsed) return style;
  let decls = parsed;
  for (const [short, side] of BOXES) decls = fold(decls, short, SIDES.map(side), box);
  // one width, style and colour on every side, or four equal side shorthands: one border
  decls = fold(decls, "border", ["border-width", "border-style", "border-color"], (v) => (v.every((x) => !x.includes(" ")) ? v.join(" ") : undefined));
  decls = fold(decls, "border", SIDES.map((s) => `border-${s}`), same);
  // an elliptical corner (`6px 3px`) would need the slash form
  decls = fold(decls, "border-radius", CORNERS.map((c) => `border-${c}-radius`), (v) => (v.every((x) => !x.includes(" ")) ? box(v) : undefined));
  if (decls === parsed) return style;
  return decls.map(([p, v]) => `${p}:${v}`).join(";") + (/;\s*$/.test(style) ? ";" : "");
};

const COMMENT = /<!--[\s\S]*?-->/g;

export const compactSides = (html: string): string => {
  const out: string[] = [];
  let last = 0;
  const rewrite = (part: string): string =>
    part.replace(TAG, (tag) =>
      tag.replace(ATTR, (whole, space: string, name: string, _eq?: string, dq?: string) =>
        name.toLowerCase() === "style" && dq !== undefined ? `${space}style="${compactStyle(dq)}"` : whole,
      ),
    );
  for (const m of html.matchAll(COMMENT)) {
    out.push(rewrite(html.slice(last, m.index)), m[0]);
    last = m.index + m[0].length;
  }
  out.push(rewrite(html.slice(last)));
  return out.join("");
};

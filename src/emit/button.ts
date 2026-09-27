// Bulletproof button, docs/outlook.md#bulletproof-buttons (a padded cell, plus VML for rounded corners).
import { insetX, insetY, type ButtonNode } from "../ir/index.ts";
import { borderDecls, legacyColor, paddingValue, radiusValue, styleString } from "./attrs.ts";
import { ghostClose, ghostOpen, ifNotMso, vmlButton } from "./mso.ts";
import { open, wrap } from "./serialize.ts";
import { lineHeightRule } from "./text.ts";
import type { TraceScope } from "./trace.ts";

const VML_TEXT = ["color", "font-family", "font-size", "font-weight", "font-style", "letter-spacing"] as const;

const px = (v: string | undefined): number | undefined => {
  const n = Number.parseFloat(v ?? "");
  return Number.isFinite(n) && v?.endsWith("px") ? n : undefined;
};

const plainText = (html: string): string =>
  html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;|&#\d+;/gi, "x")
    .replace(/\s+/g, " ")
    .trim();

// Outlook needs a fixed shape: the set width, else a guess from the label, never past the cap.
const vmlSize = (n: ButtonNode): { width: number; height: number } => {
  const { box, style } = n;
  const fontSize = px(style["font-size"]) ?? 16;
  const padX = insetX(box);
  const padY = insetY(box);
  const text = Math.round(plainText(n.content).length * fontSize * 0.6);
  const cap = box.maxWidth ?? Infinity;
  const width = box.width && "px" in box.width ? box.width.px : box.width ? cap : Math.min(text + padX, cap);
  // a label longer than the shape wraps, so the shape grows a line at a time
  const lines = Math.max(1, Math.ceil(text / Math.max(1, width - padX)));
  const lineHeight = px(style["line-height"]) ?? Math.round(fontSize * 1.2);
  return { width, height: Math.round(lines * lineHeight + padY) };
};

const vmlFor = (n: ButtonNode): string => {
  const { box } = n;
  const { width, height } = vmlSize(n);
  const edge = box.border?.top ?? box.border?.left ?? box.border?.bottom ?? box.border?.right;
  const stroke = edge ? { color: legacyColor(edge.color) ?? edge.color, weight: edge.width } : undefined;
  const fill = legacyColor(box.background);
  return vmlButton({
    href: n.href,
    width,
    height,
    arcsize: Math.min(50, Math.round(((box.radius ?? 0) / Math.min(width, height)) * 100)),
    ...(fill ? { fill } : {}),
    ...(stroke ? { stroke } : {}),
    // Outlook's own default inside the shape is 11pt, not the browser's 16px
    textStyle: styleString(VML_TEXT.map((p) => [p, n.style[p] ?? (p === "font-size" ? "16px" : undefined)] as const)),
    label: n.content,
  });
};

export const emitButton = (s: TraceScope, n: ButtonNode): string => {
  const { box, style } = n;
  const w = box.width;
  const cap = box.maxWidth;
  const pad = paddingValue(box.padding);
  const link = wrap(
    s,
    "a",
    [
      ["href", n.href],
      ...Object.entries(n.attrs ?? {}),
      [
        "style",
        styleString([
          // a set width makes the link fill its cell, so the whole area stays clickable
          ["display", w ? "block" : "inline-block"],
          ["padding", pad],
          ...Object.entries(style).map(([p, v]) => [p, v] as const),
          // the cell centers the link; a wrapped label keeps the source's own alignment
          ["text-align", style["text-align"] ? undefined : "left"],
          ["mso-line-height-rule", lineHeightRule(style)],
        ]),
      ],
    ],
    n.content,
  );
  const cell = wrap(
    s,
    "td",
    [
      ["align", "center"],
      ["bgcolor", legacyColor(box.background)],
      [
        "style",
        styleString([
          ["background-color", box.background],
          ...borderDecls(box.border),
          ["border-radius", radiusValue(box)],
          ["mso-padding-alt", pad],
        ]),
      ],
    ],
    `\n${link}\n`,
  );
  const table = `${open(s, "table", [
    ["role", "presentation"],
    ["border", "0"],
    ["cellpadding", "0"],
    ["cellspacing", "0"],
    ["width", w ? ("px" in w ? w.px : `${w.pct}%`) : undefined],
    ["align", box.align ?? (w ? undefined : "left")],
    [
      "style",
      styleString([
        ["width", w ? ("px" in w ? `${w.px}px` : `${w.pct}%`) : undefined],
        // a content-sized button's cap only sizes the VML; browsers shrink-to-fit anyway
        ["max-width", cap !== undefined && w && "pct" in w ? `${cap}px` : undefined],
        // browsers drop border-radius on cells of a collapsed table
        ["border-collapse", box.radius ? "separate" : undefined],
      ]),
    ],
  ])}\n<tr>\n${cell}\n</tr>\n</table>`;
  // a percentage width has no known Outlook size, so those buttons keep square corners there
  const sizeKnown = !(w && "pct" in w) || cap !== undefined;
  const html = box.radius && sizeKnown ? `${vmlFor(n)}\n${ifNotMso(table)}` : table;
  // Outlook ignores max-width, so a fluid button gets its cap as a fixed ghost table
  return cap !== undefined && w && "pct" in w ? `${ghostOpen(cap, box.align)}\n${html}\n${ghostClose()}` : html;
};

// The only place MSO conditional markup lives. See docs/support.md#outlook-and-mso.
import { isOutlookOnlyCol, OUTLOOK_ONLY_CLOSE, OUTLOOK_ONLY_OPEN, type Align, type Column, type VAlign } from "../ir/index.ts";

export const ifMso = (html: string): string => `<!--[if mso]>${html}<![endif]-->`;

const CONDITIONAL = String.raw`<!--\[if([^\]]*)\]>(?:<!--(?:\s*-->|>)?|-->)?|(?:<!--)?<!\[endif\]-->`;
// ESP block markers (docs/templates.md) are not comments for the client: they stay.
const BLOCK_MARKER = /^<!--\/?tddr:(?:each|if|elseif|else)[ >-]/;
const MARKER = new RegExp(`${CONDITIONAL}|<!--[\\s\\S]*?-->`, "gi");

// Every Outlook (2007+) passes these, so their content can join the outer block.
const ALL_OUTLOOK = /^\s*(?:mso|gte mso 9|\(?\s*mso\s*\)?\s*\|\s*\(?\s*ie\s*\)?|\(\s*gte mso 9\s*\)\s*\|\s*\(\s*ie\s*\))\s*$/i;

// Conditional comments don't nest: the first <![endif]--> inside ends the outer block. So keep
// the Outlook side of inner conditionals (ghost tables, VML) and drop the rest, comments too
// (but not the ESP block markers).
// A version-gated branch can't be kept without showing it to every Outlook; onDrop hears of it.
export const msoOnly = (html: string, onDrop?: (condition: string) => void): string => {
  const keep: boolean[] = [];
  let out = "";
  let at = 0;
  for (const m of html.matchAll(MARKER)) {
    if (keep.every(Boolean)) out += html.slice(at, m.index);
    at = m.index + m[0].length;
    if (BLOCK_MARKER.test(m[0])) {
      if (keep.every(Boolean)) out += m[0];
    } else if (m[1] !== undefined) {
      const ok = ALL_OUTLOOK.test(m[1]);
      if (!ok && !/!\s*\(?\s*mso/i.test(m[1])) onDrop?.(m[1].trim());
      keep.push(ok);
    }
    else if (/endif/i.test(m[0])) keep.pop();
  }
  if (keep.every(Boolean)) out += html.slice(at);
  return ifMso(out);
};

const SENTINEL = /<!--\/?tddr:outlook-only-->/g;
const TOKEN = new RegExp(`${CONDITIONAL}|${OUTLOOK_ONLY_OPEN}|${OUTLOOK_ONLY_CLOSE}`, "gi");

// Turns the analyzer's outlook-only markers on text-level elements into conditionals. Inside a
// conditional already (a VML label, an author block) the element is plain content: Outlook is the
// only reader there. Inside a !mso block it is dropped, since Outlook never sees that block.
export const resolveInlineMso = (html: string, onDrop?: (condition: string) => void): string => {
  if (!html.includes(OUTLOOK_ONLY_OPEN)) return html;
  const tokens = [...html.matchAll(TOKEN)];
  const frames: ("hidden" | "other")[] = [];
  let out = "";
  let at = 0;
  for (let i = 0; i < tokens.length; i++) {
    const m = tokens[i]!;
    out += html.slice(at, m.index);
    at = m.index + m[0].length;
    if (m[1] !== undefined) {
      frames.push(/!\s*\(?\s*mso/i.test(m[1]) ? "hidden" : "other");
      out += m[0];
    } else if (/endif/i.test(m[0])) {
      frames.pop();
      out += m[0];
    } else if (m[0] === OUTLOOK_ONLY_OPEN) {
      let depth = 1;
      let j = i + 1;
      while (j < tokens.length && depth) {
        if (tokens[j]![0] === OUTLOOK_ONLY_OPEN) depth++;
        else if (tokens[j]![0] === OUTLOOK_ONLY_CLOSE) depth--;
        j++;
      }
      if (depth) continue; // unpaired: drop just the marker
      const close = tokens[j - 1]!;
      const inner = html.slice(at, close.index);
      if (!frames.includes("hidden")) out += frames.length ? inner.replace(SENTINEL, "") : msoOnly(inner, onDrop);
      at = close.index + close[0].length;
      i = j - 1;
    }
  }
  return out + html.slice(at);
};

// The non-Outlook side of html: Outlook branches (ghost tables, VML) and outlook-only elements go,
// inner [if !mso] guards are unwrapped; other comments and the ESP block markers stay.
const notMsoSide = (html: string): string => {
  const keep: boolean[] = [];
  let out = "";
  let at = 0;
  for (const m of html.matchAll(new RegExp(`${CONDITIONAL}|${OUTLOOK_ONLY_OPEN}|${OUTLOOK_ONLY_CLOSE}`, "gi"))) {
    if (keep.every(Boolean)) out += html.slice(at, m.index);
    at = m.index + m[0].length;
    if (m[0] === OUTLOOK_ONLY_OPEN) keep.push(false);
    else if (m[1] !== undefined) keep.push(/!\s*\(?\s*mso/i.test(m[1]));
    else keep.pop();
  }
  return keep.every(Boolean) ? out + html.slice(at) : out;
};

// Hidden from Outlook, visible everywhere else (downlevel-revealed form). Conditionals don't nest,
// so whatever Outlook would get inside is dropped first.
export const ifNotMso = (html: string): string => `<!--[if !mso]><!-->${notMsoSide(html)}<!--<![endif]-->`;

const TABLE = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';

// Fixed-width Outlook table around fluid markup; always pair with ghostClose().
export const ghostOpen = (width: number, align?: Align): string =>
  ifMso(`<table ${TABLE} width="${width}"${align ? ` align="${align}"` : ""}><tr><td width="${width}">`);

// One ghost table per row of fluid columns: opens the table, then ghostCell() per column.
// Close with ghostClose(). Adjacent comments, so no whitespace reaches the inline-blocks.
export const ghostRowOpen = (width: number | undefined, align?: Align): string =>
  ifMso(`<table ${TABLE}${width !== undefined ? ` width="${width}"` : ""}${align ? ` align="${align}"` : ""}><tr>`);

// Each cell after the first closes the previous one.
export const ghostCellOpen = (width: number | undefined, valign: VAlign, first = false): string =>
  `${first ? "" : "</td>"}<td${width !== undefined ? ` width="${width}"` : ""} valign="${valign}">`;

export const ghostCell = (width: number | undefined, valign: VAlign, first = false): string => ifMso(ghostCellOpen(width, valign, first));

export const shownCols = (cols: readonly Column[]): Column[] => cols.filter((c) => !isOutlookOnlyCol(c));

export const ghostClose = (): string => ifMso("</td></tr></table>");

export type VmlButton = {
  href: string;
  width: number;
  height: number;
  arcsize: number; // percent
  fill?: string; // #rrggbb or a placeholder; none = unfilled
  stroke?: { color: string; weight: number };
  textStyle: string; // style of the <center> holding the label
  label: string;
};

// Rounded button for Outlook classic; pair with ifNotMso(<html button>). See docs/support.md#bulletproof-buttons.
export const vmlButton = (b: VmlButton): string => {
  const attrs = [
    `href="${b.href.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`,
    'xmlns:w="urn:schemas-microsoft-com:office:word"',
    `style="height:${b.height}px;v-text-anchor:middle;width:${b.width}px;"`,
    `arcsize="${b.arcsize}%"`,
    b.stroke ? `strokecolor="${b.stroke.color}" strokeweight="${b.stroke.weight}px"` : 'stroke="f"',
    b.fill ? `fillcolor="${b.fill}"` : 'filled="f"',
  ];
  return ifMso(`<v:roundrect ${attrs.join(" ")}><w:anchorlock/><center style="${b.textStyle}">${b.label}</center></v:roundrect>`);
};

export type VmlBackground = {
  src: string;
  color?: string; // #rrggbb or a placeholder, shown while the image loads or when Outlook skips VML
  width: number;
  height: number; // a rect without a height is a guess; callers skip VML instead
  tile: boolean;
};

const attr = (v: string): string => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

// Photo behind a cell's content for Outlook classic, docs/support.md#vml-background-images. The content goes between
// the two halves; the cell carries no padding itself (an inner table does), so the rect covers all of it.
export const vmlBackgroundOpen = (v: VmlBackground): string =>
  ifMso(
    `<v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:${v.width}px;height:${v.height}px;">` +
      `<v:fill type="${v.tile ? "tile" : "frame"}" src="${attr(v.src)}"${v.color ? ` color="${v.color}"` : ""}/>` +
      `<v:textbox inset="0,0,0,0">`,
  );

export const vmlBackgroundClose = (): string => ifMso("</v:textbox></v:rect>");

export const OFFICE_SETTINGS =ifMso(
  "<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>",
);

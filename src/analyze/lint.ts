import type { Code } from "../diagnostics/codes.ts";
import type { Ctx } from "../ctx.ts";
import { get } from "../style/props.ts";
import { readBlocks } from "../template/hints.ts";
import { INLINE_TAGS, isGrid, looksLikeButton, TEXT_BLOCK_TAGS } from "./classify.ts";
import { warnUnevenFloatMargin } from "./float.ts";
import type { StyledElement, StyledNode } from "../style/types.ts";
import type { WidthSpec } from "../ir/index.ts";

type Problem = { code: Code; message: string; hint?: string };

// Tags with no email-safe equivalent at all.
const UNSUPPORTED_TAGS: ReadonlySet<string> = new Set([
  "video", "audio", "canvas", "iframe", "object", "embed", "svg",
  "form", "input", "select", "textarea", "button",
]);

// The UA sheet gives these table-* displays, so they're fine.
const TABLE_TAGS: ReadonlySet<string> = new Set([
  "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col",
]);

const OFFSETS = ["top", "right", "bottom", "left"] as const;

const isZero = (v: string | undefined): boolean => v === undefined || v === "auto" || Number.parseFloat(v) === 0;

const FLEX_WRAP_HINT = "Use flex-wrap with a px flex-basis for a responsive grid; it stacks on phones.";

// Splits on top-level whitespace, so repeat(2, 1fr 2fr) stays one token.
const tokens = (v: string): string[] => {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of v.trim()) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (cur) out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
};

const trackOf = (t: string): WidthSpec | undefined => {
  // minmax(0, Nfr) is an fr track without a content minimum, which a fixed table layout is anyway
  const fr = /^minmax\(\s*0(?:px)?\s*,\s*(\d*\.?\d+)fr\s*\)$/.exec(t);
  if (fr) return { grow: Number.parseFloat(fr[1] ?? "") };
  const m = /^(\d*\.?\d+)(px|fr|%)$/.exec(t);
  if (m) {
    const n = Number.parseFloat(m[1] ?? "");
    return m[2] === "px" ? { px: n } : m[2] === "fr" ? { grow: n } : { pct: n };
  }
  return t === "0" ? { px: 0 } : undefined;
};

export type GridSpec = { cols: WidthSpec[]; problems: Array<{ message: string; hint: string }> };

// The columns of a simple grid (px / fr / % / minmax(0, fr) tracks, repeat(N, …)) and what keeps it from being lowered.
export const parseGrid = (el: StyledElement): GridSpec => {
  const problems: GridSpec["problems"] = [];
  const bad = (message: string, hint: string): void => void problems.push({ message, hint });
  const cols: WidthSpec[] = [];
  const template = get(el.style, "grid-template-columns");
  const shorthand = ["grid-template", "grid"].find((p) => el.declared[p] !== undefined);
  if (shorthand) {
    bad(`the ${shorthand} shorthand is not supported`, "Write grid-template-columns (and nothing for rows) instead of the shorthand.");
  }
  if (template === undefined || template === "none") {
    if (!shorthand) bad(`display: ${get(el.style, "display")} without grid-template-columns`, "Give the grid its columns (px, fr or % tracks), or use block layout.");
  } else {
    for (const t of tokens(template)) {
      const rep = /^repeat\(\s*(\d+)\s*,(.*)\)$/s.exec(t);
      if (rep && Number(rep[1]) < 1) {
        bad("repeat(0, …) is not supported", "A grid needs at least one column; use repeat(N, track) with N of 1 or more.");
        continue;
      }
      if (rep) {
        const inner = tokens(rep[2] ?? "").map(trackOf);
        if (inner.length > 0 && inner.every((x) => x !== undefined)) {
          for (let i = 0; i < Number(rep[1]); i++) cols.push(...(inner as WidthSpec[]));
          continue;
        }
      }
      const spec = trackOf(t);
      if (spec) cols.push(spec);
      else if (/^repeat\(\s*auto-(fill|fit)/.test(t) || t.startsWith("minmax(")) bad(`grid-template-columns: ${t} is not supported`, FLEX_WRAP_HINT);
      else if (t === "subgrid") bad("subgrid is not supported", "Give the nested grid its own px, fr or % columns.");
      else bad(`grid track ${t} is not supported`, "Use px, fr or % tracks, or repeat(N, track) with a fixed N.");
    }
  }
  const areas = get(el.style, "grid-template-areas");
  if (areas !== undefined && areas !== "none") bad("grid-template-areas is not supported", "Use grid-template-columns and let items fill in source order.");
  const rows = get(el.style, "grid-template-rows");
  if (rows !== undefined && rows !== "none" && !tokens(rows).every((t) => t === "auto")) {
    bad(`grid-template-rows: ${rows} is not supported`, "Email has no fixed row heights; drop it and let rows size to their content.");
  }
  const flow = get(el.style, "grid-auto-flow");
  if (flow !== undefined && flow !== "row") bad(`grid-auto-flow: ${flow} is not supported`, "Items are placed in source order, row by row; reorder the HTML instead of packing.");
  for (const p of ["grid-auto-rows", "grid-auto-columns"]) {
    const v = get(el.style, p);
    if (v !== undefined && v !== "auto") bad(`${p}: ${v} is not supported`, "Rows and columns size to their content or the template.");
  }
  return { cols, problems };
};

// A div-like element with display: table, which the table-display rule lowers (a real <table> passes through as text).
// Text blocks and inline tags keep E001: lowering them would drop their tag (list bullets, headings).
export const isDivTable = (el: StyledElement): boolean =>
  get(el.style, "display") === "table" && !TABLE_TAGS.has(el.tag) && !TEXT_BLOCK_TAGS.has(el.tag) && !INLINE_TAGS.has(el.tag);

// Text-level tags never take part in a lowered display: table-cell/row (they stay E001).
const TEXT_LEVEL: ReadonlySet<string> = new Set(["a", "img", "br", "wbr"]);

const tablePart = (el: StyledElement): "cell" | "row" | undefined => {
  const d = get(el.style, "display");
  return d === "table-cell" ? "cell" : d === "table-row" ? "row" : undefined;
};

const isBlankNode = (n: StyledNode): boolean => n.type === "comment" || (n.type === "text" && /^[ \t\n\r\f]*$/.test(n.text));
const shown = (el: StyledElement): boolean => get(el.style, "display") !== "none";
const spans = (el: StyledElement): boolean => ["rowspan", "colspan"].some((a) => Number.parseInt(el.attrs[a] ?? "1", 10) > 1);

export type TableSpec = { mode: "cells" | "rows" | "block"; problems: Array<{ message: string; hint: string }> };

// How a display: table element is built: cells side by side, rows of cells, or plain block content.
export const parseTable = (el: StyledElement): TableSpec => {
  const problems: TableSpec["problems"] = [];
  const bad = (message: string, hint: string): void => void problems.push({ message, hint });
  const visible = (nodes: readonly StyledNode[]): StyledNode[] => nodes.filter((c) => !isBlankNode(c) && (c.type !== "element" || shown(c)));
  const part = (c: StyledNode): "cell" | "row" | "other" => (c.type === "element" ? tablePart(c) : undefined) ?? "other";
  const kids = visible(el.children);
  const cells = kids.filter((c) => part(c) === "cell");
  const rows = kids.filter((c) => part(c) === "row");
  const mode = cells.length > 0 ? "cells" : rows.length > 0 ? "rows" : "block";
  if (mode !== "block" && cells.length + rows.length < kids.length) {
    bad(`display: table mixes ${mode === "cells" ? "table-cell" : "table-row"} children with other content`, "Make every child a display: table-cell, or every child a display: table-row of cells.");
  } else if (cells.length > 0 && rows.length > 0) {
    bad("display: table mixes table-cell and table-row children", "Put the cells inside rows, or drop the rows.");
  }
  const rowCells = rows.flatMap((r) => (r.type === "element" ? visible(r.children) : []));
  if (rowCells.some((c) => part(c) !== "cell")) {
    bad("display: table-row holds something other than table-cell children", "Wrap each piece of content in a display: table-cell.");
  }
  if ([...cells, ...rowCells].some((c) => c.type === "element" && spans(c))) {
    bad("rowspan / colspan on a table-cell is not supported", "Use one cell per column, or nest a second display: table in the cell.");
  }
  return { mode, problems };
};

// cells sit in a table or a row of one; rows sit in a table
const inTable = (el: StyledElement, display: string): boolean => {
  const parent = el.parentStyle?.["display"];
  return display === "table-row" ? parent === "table" : parent === "table" || parent === "table-row";
};

const TABLE_HINT = "Use display: table with display: table-cell children (or table-row of cells), or display: flex.";

// Pure, so the unsupported rule can call it from matches() without reporting.
// lowered: the element is a layout container the table-display rule builds; inside a text run nothing lowers it.
const TEXT_TABLE_HINT = "display: table inside text is not lowered; make it its own block, outside the paragraph or text run.";
const problems = (el: StyledElement, allowSvg = false, lowered = true): Problem[] => {
  const out: Problem[] = [];
  const add = (code: Code, message: string): void => void out.push({ code, message });

  const display = get(el.style, "display") ?? "inline";
  if (/^(inline-)?grid$/.test(display)) {
    if (!isGrid(el)) out.push({ code: "E001", message: `display: ${display} on <${el.tag}> is not supported`, hint: "Put the grid on a <div> and the link inside it." });
    else for (const g of parseGrid(el).problems) out.push({ code: "E001", message: g.message, hint: g.hint });
  } else if (isDivTable(el) && !lowered) {
    out.push({ code: "E001", message: `display: table on <${el.tag}> is not supported inside text`, hint: TEXT_TABLE_HINT });
  } else if (isDivTable(el)) {
    for (const t of parseTable(el).problems) out.push({ code: "E001", message: t.message, hint: t.hint });
  } else if ((display === "table-cell" || display === "table-row") && !TABLE_TAGS.has(el.tag) && !TEXT_LEVEL.has(el.tag) && lowered && inTable(el, display)) {
    // a part of a display: table, built by that table's rule
  } else if (display === "subgrid" || (/^(inline-)?table/.test(display) && !TABLE_TAGS.has(el.tag))) {
    out.push({ code: "E001", message: `display: ${display} on <${el.tag}> is not supported`, ...(display === "subgrid" ? {} : { hint: lowered ? TABLE_HINT : TEXT_TABLE_HINT }) });
  }

  const position = get(el.style, "position");
  if (position === "absolute" || position === "fixed" || position === "sticky") {
    add("E002", `position: ${position} on <${el.tag}> is not supported`);
  } else if (position === "relative") {
    const off = OFFSETS.find((s) => !isZero(el.style[s]));
    if (off) add("E002", `position: relative with ${off}: ${el.style[off]} is not supported`);
  }

  const transform = get(el.style, "transform");
  if (transform !== undefined && transform !== "none") add("E003", `transform: ${transform} is not supported`);

  // float on an image becomes its align attribute (docs/images-and-fonts.md#floated-images); anything else floating is out
  const float = get(el.style, "float");
  if ((float === "left" || float === "right") && el.tag !== "img") add("E004", `float: ${float} is not supported`);

  // a <picture> is compiled as its <img> by sanitize; one without an <img> has nothing to show
  if (el.tag === "picture" && !el.children.some((c) => c.type === "element" && c.tag === "img")) add("E008", "<picture> without an <img> has no email-safe equivalent");

  // authored only. Durations and friends don't count, only a real name/property does.
  const anim = Object.entries(el.declared).find(
    ([p, v]) => /^(animation|animation-name|transition|transition-property)$/.test(p) && v !== "none",
  );
  if (anim) add("E009", `${anim[0]}: ${anim[1]} is not supported`);

  if (el.tag === "svg" && allowSvg) add("W010", "<svg> kept: Gmail and Outlook don't show it");
  else if (UNSUPPORTED_TAGS.has(el.tag)) add("E008", `<${el.tag}> has no email-safe equivalent`);

  return out;
};

export const canLower = (el: StyledElement): boolean => problems(el).length === 0;

// Reports out-of-scope CSS/elements on ONE element; true when it can't be lowered.
export const lintElement = (el: StyledElement, ctx: Ctx, lowered = true): boolean => {
  const found = problems(el, ctx.options.allowSvg, lowered);
  for (const p of found) ctx.diagnostics.report(p.code, { message: p.message, ...(p.hint ? { hint: p.hint } : {}), loc: el.loc });
  return found.length > 0;
};

export const HINT_VALUES = ["raw", "outlook-only", "preheader", "button"];

// On a text-level element only outlook-only means anything here (the serializer wraps it).
const lintHint = (el: StyledElement, ctx: Ctx): void => {
  const v = el.attrs["data-email"];
  if (v === undefined || v === "outlook-only" || v === "preheader") return;
  if (!HINT_VALUES.includes(v)) {
    ctx.diagnostics.report("E011", { message: `Unknown data-email value "${v}"`, hint: `Valid values: ${HINT_VALUES.join(", ")}.`, loc: el.loc });
  } else if (!(v === "button" && looksLikeButton(el))) {
    ctx.diagnostics.report("W001", {
      message: `data-email="${v}" is ignored on <${el.tag}>, which is part of a text line`,
      hint: v === "raw" ? 'Put data-email="raw" on a block element, e.g. a <div> around the text.' : 'data-email="button" works on an <a> with an href that is its own block.',
      loc: el.loc,
    });
  }
};

// The serializer writes the block markers for a text-level element; what it left out is reported here.
const lintTemplateHints = (el: StyledElement, ctx: Ctx): void => {
  for (const p of readBlocks(el.attrs).problems) ctx.diagnostics.report("E012", { ...p, loc: el.loc });
};

export const lintTree = (el: StyledElement, ctx: Ctx, lowered = false): void => {
  warnUnevenFloatMargin(el, ctx);
  lintHint(el, ctx);
  lintTemplateHints(el, ctx);
  // only a link that is its own block child becomes a bulletproof button (an unsupported one has its error already)
  if (!lintElement(el, ctx, lowered) && looksLikeButton(el)) {
    ctx.diagnostics.report("W003", {
      message: "this button sits inside text, so it isn't bulletproofed: Outlook drops its padding and background",
      hint: "Make it its own block: move it out of the paragraph or text run, e.g. into a <div> of its own.",
      loc: el.loc,
    });
  }
  for (const c of el.children) if (c.type === "element") lintTree(c, ctx);
};

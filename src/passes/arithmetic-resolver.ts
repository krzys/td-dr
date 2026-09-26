import type { Ctx } from "../ctx.ts";
import { columnCap, floorPx, gutterX, insetX, locKey, roundPct, SCREEN, screenAt, type Fluid, type ResolvedWidth, type RowNode, type WidthSpec } from "../ir/index.ts";
import type { ResolvedColumns, WidthResolver } from "./pass.ts";

const EPS = 1e-6;
// A basis-less grow item's basis is its content width, which is not measured: a wrapping line counts it
// as this many px of content. A guess, and the flex rule says so with a W003 on every such item.
const GROW_CONTENT_GUESS = 100;
// The narrowest screen the output answers for (the narrowest phones in use). A difference from the source
// that only starts below it is not reported; anything from it up is.
const NARROWEST_SCREEN = 320;
const round1 = (n: number) => Math.round(n * 10) / 10; // px in messages

const capOf = (row: RowNode, i: number): number => columnCap(row.cols[i]!) ?? Infinity;

// % and calc() columns are shares of the row: exact (unrounded) widths, a share on phones.
const isShare = (s: WidthSpec): boolean => "pct" in s || "calc" in s;
const shareOf = (s: WidthSpec, content: number): number | undefined =>
  "pct" in s ? (content * s.pct) / 100 : "calc" in s ? Math.max(0, (content * s.calc.pct) / 100 + s.calc.px) : undefined;

const growOf = (s: WidthSpec): number => ("grow" in s ? s.grow : 0);

// The emitter cuts lines again from the floored widths plus gutters; the source cuts them from
// exact widths and, for % columns, from the viewport. Say so when the two can part ways.
// The widest narrower screen whose own rules lay out the row or one of its items (ctx.otherScreens): below
// it the output follows that screen, not this layout.
const relaidUpTo = (row: RowNode, ctx: Ctx): number => {
  const below = ctx.otherScreens?.relaidBelow;
  if (!below) return 0;
  const locs = [row.loc, ...row.cols.map((c) => c.child.loc)];
  return Math.max(0, ...locs.map((l) => (l ? (below.get(locKey(l)) ?? 0) : 0)));
};

// `lines`: column indexes per line as the source cuts them; `out`: the widths the emitter gets;
// `screen`: how the row's content box follows a narrow screen.
const reportLineMismatch = (row: RowNode, lines: number[][], out: number[], content: number, ctx: Ctx, screen: Fluid): void => {
  const specs = row.cols.map((c) => c.width);
  const gap = row.gap;
  // the emitter's own test (fluid.ts linesOf) comes to columns plus a gap per extra column, since
  // gap-to-padding takes the edge shortfall once per line
  const rejoined = lines.slice(1).some((next, k) => {
    const prev = lines[k] as number[];
    return prev.reduce((s, i) => s + out[i]!, 0) + out[next[0]!]! + gap * prev.length <= content + EPS;
  });
  const ownBox = insetX(row.box);
  // a line of % / calc columns fits while sum(N) + gaps <= W * (1 - sum(P)/100)
  const pctOf = (s: WidthSpec): number => ("pct" in s ? s.pct : "calc" in s ? s.calc.pct : 0);
  const pxOf = (s: WidthSpec): number => ("calc" in s ? s.calc.px : 0);
  const breakWidth = (line: number[]): number => {
    if (line.length < 2 || !line.every((i) => "pct" in (specs[i] as object) || "calc" in (specs[i] as object))) return 0;
    const share = line.reduce((s, i) => s + pctOf(specs[i] as WidthSpec), 0) / 100;
    const fixed = line.reduce((s, i) => s + pxOf(specs[i] as WidthSpec), 0) + gap * (line.length - 1);
    return share < 1 && fixed > 0 ? fixed / (1 - share) : 0;
  };
  const breaks = Math.max(0, ...lines.map(breakWidth));
  const late = breaks > 0 ? breaks + ownBox : 0; // only a line of % / calc columns breaks late
  // the row is narrower than the screen by what surrounds it; a row of a fixed width never breaks late
  const lateScreen = breaks > 0 ? screenAt(screen, breaks) : 0;
  if (rejoined) {
    ctx.diagnostics.report("W003", { message: "a wrapping line the browser cuts here fits on one line once widths are rounded to whole pixels", hint: "The output keeps those items on one line; nudge a width or the gap by a pixel to make both agree.", loc: row.loc });
  }
  if (lateScreen > NARROWEST_SCREEN && relaidUpTo(row, ctx) < lateScreen) {
    const onScreen = Math.ceil(lateScreen) === Math.ceil(late) ? "" : ` (screens narrower than ${Math.ceil(lateScreen)}px)`;
    ctx.diagnostics.report("W003", {
      message: `${lines.some((l) => l.some((i) => "calc" in (specs[i] as object))) ? "% and calc() columns" : "% columns"} with a gap stop sharing a line once the row is narrower than ${Math.ceil(late)}px${onScreen} in the source, but stay side by side in the output`,
      hint: "The gap is fixed while the columns shrink with the line; use a smaller gap or percentages that leave more room.",
      loc: row.loc,
    });
  }
};

// A wrapping row breaks lines instead of scaling, so px/% columns keep their exact widths
// (one wider than the line shrinks to it, like flex-shrink does for a lone item). The lines
// are cut at the design width as the browser cuts them; grow items then fill their own line's
// leftover, a px-basis one on top of its basis. Below the design width the emitter caps
// each column at this width (docs/layout.md#fluid-hybrid-columns-wrapping-rows).
const resolveWrap = (row: RowNode, content: number, ctx: Ctx, screen: Fluid): ResolvedColumns => {
  const specs: WidthSpec[] = row.cols.map((c) => c.width);
  const hasAuto = specs.some((s) => "auto" in s);
  const padOf = (i: number): number => gutterX(row.cols[i]!);
  const pure = (i: number): boolean => !("px" in (specs[i] as object)) && "grow" in (specs[i] as object);

  // the width a column starts from; a basis-less grow item starts from its margins
  let clamped = false;
  // the share each % / calc column has of the line before its max-width clamps it; the emitter
  // pairs it with the item's max-width so a phone shows the source's min(share, max-width)
  const share: Array<number | undefined> = specs.map((s) => {
    const v = shareOf(s, content);
    return v === undefined || content <= 0 ? undefined : Math.min(100, (v / content) * 100);
  });
  const base = specs.map((s, i): number | null => {
    let v = "px" in s ? s.px : isShare(s) ? (shareOf(s, content) as number) : "grow" in s && !hasAuto ? padOf(i) : null;
    // flexbox cuts lines by the max-width-clamped basis; a clamped grow item hands its room to the rest
    if (v !== null) v = Math.min(v, capOf(row, i));
    if (v !== null && v > content + EPS) {
      clamped = true;
      return content;
    }
    return v;
  });
  if (clamped) ctx.diagnostics.report("W003", { message: `a wrapping item is wider than the row (${round1(content)}px) and was shrunk to fit`, loc: row.loc });

  const lines: number[][] = [];
  if (hasAuto && specs.some((s) => growOf(s) > 0)) {
    ctx.diagnostics.report("W003", { message: "flex-grow is ignored in a wrapping row with auto-width items", hint: "The auto items' widths are decided by the table, so there is no leftover to grow into; give every item a basis.", loc: row.loc });
  }
  if (!hasAuto) {
    let used = 0;
    base.forEach((b, i) => {
      const w = (b as number) + (pure(i) ? GROW_CONTENT_GUESS : 0);
      if (lines.length === 0 || used + row.gap + w > content + EPS) {
        lines.push([i]);
        used = w;
      } else {
        lines.at(-1)!.push(i);
        used += row.gap + w;
      }
    });
  }
  const exact = [...base];
  // a % or calc column keeps its exact width: flooring it would emit a share the authored % doesn't
  // give and leave the line short (3 x 33.3333% at 600 is 3 x 200, not 3 x 199)
  const out: Array<number | null> = exact.map((v, i) => (v === null ? null : isShare(specs[i] as WidthSpec) ? v : floorPx(v)));
  let sharedGrowth = false;
  for (const line of lines) {
    const growers = line.filter((i) => growOf(specs[i] as WidthSpec) > 0);
    if (growers.length === 0) continue;
    const taken = line.reduce((s, i) => s + (base[i] as number), 0) + row.gap * (line.length - 1);
    let free = Math.max(0, content - taken);
    // a grower stops at its max-width (the column's own margins ride on top); what it
    // can't take goes to the others, like flex does when an item freezes
    let open = growers;
    for (;;) {
      const total = open.reduce((s, i) => s + growOf(specs[i] as WidthSpec), 0);
      const frozen = open.filter((i) => (base[i] as number) + (free * growOf(specs[i] as WidthSpec)) / total > capOf(row, i) + EPS);
      if (frozen.length === 0) {
        for (const i of open) exact[i] = (base[i] as number) + (free * growOf(specs[i] as WidthSpec)) / total;
        break;
      }
      for (const i of frozen) {
        exact[i] = capOf(row, i);
        free -= capOf(row, i) - (base[i] as number);
      }
      open = open.filter((i) => !frozen.includes(i));
      if (open.length === 0) break;
    }
    for (const i of growers) out[i] = floorPx(exact[i] as number);
    // The pixels lost to rounding go to the line's last grow item that isn't at its cap, so the line
    // stays full. Grow columns stay whole px even beside an unrounded % column: the target is
    // what those leave, floored.
    const fixedSum = line.reduce((s, i) => s + (growOf(specs[i] as WidthSpec) > 0 ? 0 : (out[i] as number)), 0);
    const target = floorPx(content - row.gap * (line.length - 1) - fixedSum);
    const sum = growers.reduce((s, i) => s + (out[i] as number), 0);
    const last = growers.filter((i) => (exact[i] as number) < capOf(row, i) - EPS).at(-1);
    if (free > EPS && target > sum && last !== undefined) out[last] = (out[last] as number) + target - sum;
    if (line.length > 1 && free > EPS) sharedGrowth = true;
  }
  reportLineMismatch(row, lines, out as number[], content, ctx, screen);
  if (sharedGrowth) {
    ctx.diagnostics.report("W003", {
      message: `flex-grow in a wrapping row is resolved at the design width (${round1(content)}px); below it, grown items keep that width as a cap`,
      hint: "On a phone, stacked grow items fill the line only up to their grown width, and a line stacks earlier than in the browser.",
      loc: row.loc,
    });
  }

  // pct is the column's share of the line. A % or calc column keeps its pre-cap share (see above);
  // everything else, and a column shrunk to the row, is what px says.
  return out.map((px, i): ResolvedWidth | null => {
    if (px === null) return null;
    const sh = share[i];
    if (sh !== undefined) return { px, pct: sh };
    return { px, pct: content > 0 ? roundPct((px / content) * 100) : 0 };
  });
};

// Fixed-width arithmetic for rows (docs/decisions.md §1): px/% columns are exact, grow columns share
// what is left, auto columns stay unresolved and the table decides.
export const arithmeticResolver: WidthResolver = {
  resolve(row: RowNode, available: number, ctx: Ctx, screen: Fluid = SCREEN): ResolvedColumns {
    const n = row.cols.length;
    if (n === 0) return [];
    const content = Math.max(0, available);
    if (row.wrap) return resolveWrap(row, content, ctx, screen);
    const space = Math.max(0, content - row.gap * (n - 1));
    const specs: WidthSpec[] = row.cols.map((c) => c.width);
    const hasAuto = specs.some((s) => "auto" in s);

    const exact: Array<number | null> = specs.map((s) => {
      if ("px" in s) return s.px;
      if (isShare(s)) return shareOf(s, content) as number;
      return null;
    });
    let scaled = false;
    let fixed = exact.reduce<number>((sum, v) => sum + (v ?? 0), 0);

    if (fixed > space + EPS) {
      ctx.diagnostics.report("W003", {
        message: `columns overflow the row (${round1(fixed)} > ${round1(space)}) and were scaled down`,
        loc: row.loc,
      });
      scaled = true;
      const k = space / fixed;
      for (let i = 0; i < n; i++) if (exact[i] !== null) exact[i] = (exact[i] as number) * k;
      fixed = space;
    }

    const growTotal = specs.reduce((sum, s) => sum + ("grow" in s ? s.grow : 0), 0);
    // a grow item's margins (lifted into its cell padding) don't flex
    const padOf = (i: number): number => gutterX(row.cols[i]!);
    const growPad = specs.reduce((sum, s, i) => sum + ("grow" in s ? padOf(i) : 0), 0);
    const left = Math.max(0, space - fixed - growPad);
    specs.forEach((s, i) => {
      if (!("grow" in s)) return;
      if (hasAuto) exact[i] = null;
      // flex-grow:0 everywhere still has to fill a table row; split evenly
      else exact[i] = (growTotal > 0 ? (left * s.grow) / growTotal : left / specs.filter((x) => "grow" in x).length) + padOf(i);
    });

    const out: Array<number | null> = exact.map((v) => (v === null ? null : floorPx(v)));
    const resolvedIdx = exact.flatMap((v, i) => (v === null ? [] : [i]));
    if (!hasAuto && resolvedIdx.length > 0) {
      // Rounding leftovers go to one column, but only when the row is meant to fill
      // (33.33% × 3 counts). Prefer a grow column, then %, then px.
      const sumExact = resolvedIdx.reduce((sum, i) => sum + (exact[i] as number), 0);
      if (Math.abs(sumExact - space) < n) {
        const sumInt = resolvedIdx.reduce((sum, i) => sum + (out[i] as number), 0);
        const pick = (k: "grow" | "share" | "px") => resolvedIdx.filter((i) => (k === "share" ? isShare(specs[i] as WidthSpec) : k in (specs[i] as object))).at(-1);
        const last = (pick("grow") ?? pick("share") ?? pick("px")) as number;
        out[last] = (out[last] as number) + Math.floor(space) - sumInt;
      }
    }

    // A % column keeps its authored percentage so the table reproduces the fractional pixels.
    return out.map((px, i): ResolvedWidth | null => {
      if (px === null) return null;
      const spec = specs[i] as WidthSpec;
      if ("pct" in spec && !scaled) return { px, pct: spec.pct };
      return { px, pct: content > 0 ? roundPct((px / content) * 100) : 0 };
    });
  },
};

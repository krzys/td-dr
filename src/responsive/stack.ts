import { elementKey } from "../style/computed.ts";
import { get } from "../style/props.ts";
import type { ComputedStyle, StyledElement, Unstack } from "../style/types.ts";

type Layout = "row" | "row-reverse" | "column" | "column-reverse" | "grid" | "grid-one" | "block" | "other";
type Seen = { layout: Layout; el: StyledElement; loc: StyledElement["loc"]; wrapped: boolean };

// How many tracks a grid-template-columns names; 0 when it names none (or something we don't read).
const trackCount = (template: string | undefined): number => {
  if (template === undefined || template === "none") return 0;
  const tokens: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of template.trim()) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (cur) tokens.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) tokens.push(cur);
  return tokens.reduce((n, t) => {
    const rep = /^repeat\(\s*(\d+)\s*,(.*)\)$/s.exec(t);
    return n + (rep ? Number(rep[1]) * trackCount(rep[2]) : 1);
  }, 0);
};

const layoutOf = (style: ComputedStyle): Layout => {
  const display = get(style, "display");
  if (display === "flex") {
    if (get(style, "flex-wrap") !== "nowrap") return "other"; // a wrapping row stacks by itself (docs/support.md#wrapping-rows)
    return get(style, "flex-direction") as Layout;
  }
  if (display === "grid") {
    const tracks = trackCount(get(style, "grid-template-columns"));
    return tracks === 0 ? "other" : tracks === 1 ? "grid-one" : "grid";
  }
  return display === "block" ? "block" : "other";
};

// What a row (or grid) turns into on a narrow screen to count as stacking.
const STACKS: Readonly<Record<string, ReadonlySet<Layout>>> = {
  row: new Set<Layout>(["column", "block"]),
  grid: new Set<Layout>(["grid-one", "block"]),
};

// The layout props a stacked compile takes from the base: it still builds the row the base has.
// justify-content is vertical in a column, so it stays what the row had.
const KEYS = ["display", "flex-direction", "column-gap", "grid-column-gap", "grid-template-columns", "justify-content"] as const;

const unstackTo = (base: ComputedStyle, kind: string): Unstack => (style) => {
  const here = layoutOf(style);
  if (!STACKS[kind]?.has(here)) return undefined;
  const out: Record<string, string> = { ...style };
  for (const k of KEYS) {
    const v = base[k];
    if (v === undefined) delete out[k];
    else out[k] = v;
  }
  // block layout has no gap between its children
  if (here === "block") {
    out["row-gap"] = "0px";
    out["grid-row-gap"] = "0px";
  }
  return { style: out, to: here === "block" ? "block" : "column" };
};

const layouts = (body: StyledElement): Map<string, Seen> => {
  const out = new Map<string, Seen>();
  // a wrapping row stacks by itself; what is inside it keeps today's behaviour (docs/support.md#wrapping-rows)
  const walk = (el: StyledElement, wrapped: boolean): void => {
    const key = elementKey(el.loc);
    if (key !== undefined) out.set(key, { layout: layoutOf(el.style), el, loc: el.loc, wrapped });
    const wraps = wrapped || (get(el.style, "display") === "flex" && get(el.style, "flex-wrap") !== "nowrap");
    for (const c of el.children) if (c.type === "element") walk(c, wraps);
  };
  walk(body, false);
  return out;
};

// Flex rows and grids that lay out in columns on the base screen and stack on another, by source
// position. Every compile keeps their row; where the screen stacks it, the row is marked, so the
// emitted structure is the same everywhere.
export const stackedElsewhere = (desktop: StyledElement, screens: readonly StyledElement[]): Map<string, Unstack> => {
  const base = layouts(desktop);
  const others = screens.map(layouts);
  const out = new Map<string, Unstack>();
  for (const [key, b] of base) {
    const kind = b.layout === "row" ? "row" : b.layout === "grid" ? "grid" : undefined;
    if (kind === undefined || b.wrapped) continue;
    if (others.some((o) => STACKS[kind]!.has(o.get(key)?.layout ?? "other"))) out.set(key, unstackTo(b.el.style, kind));
  }
  return out;
};

const at = (loc: StyledElement["loc"]): string => (loc ? `line ${loc.line}, column ${loc.col}` : "the source");

// Why a screen's layout can't be a stacked copy of the base, for the E017 that follows.
export const layoutNotes = (base: StyledElement, other: StyledElement): string[] => {
  const was = layouts(base);
  const notes: string[] = [];
  for (const [key, now] of layouts(other)) {
    const b = was.get(key);
    if (!b || b.layout === now.layout) continue;
    const fromRow = b.layout === "row" || b.layout === "grid";
    if (fromRow && now.layout === "column-reverse") {
      notes.push(`the container at ${at(b.loc)} is a row in the base and column-reverse here; column-reverse can't be stacked, use flex-direction: column or display: block`);
    } else if (b.layout === "column" && (now.layout === "row" || now.layout === "grid")) {
      notes.push(`the container at ${at(b.loc)} is a column in the base and a row here; only a row that stacks on narrow screens can change, so write the row as the base and stack it below`);
    }
  }
  return notes;
};

export type StackNote = { message: string; hint: string; loc: StyledElement["loc"] };

const px = (v: string | undefined): number => (v !== undefined && /px$/.test(v) ? Number.parseFloat(v) || 0 : 0);
const END = new Set(["center", "flex-end", "end", "right"]);
const grows = (el: StyledElement): boolean => (Number.parseFloat(get(el.style, "flex-grow") ?? "0") || 0) > 0;
const painted = (s: ComputedStyle): boolean => {
  const bg = get(s, "background-color");
  const border = ["top", "right", "bottom", "left"].some((side) => (Number.parseFloat(get(s, `border-${side}-width`) ?? "0") || 0) > 0 && get(s, `border-${side}-style`) !== "none");
  return (bg !== undefined && bg !== "transparent") || (get(s, "background-image") ?? "none") !== "none" || border;
};

// What a stacked row can't take back or place the way the column layout does, for W003. The base
// compile reports it: the screens that stack are compiled quietly.
export const stackNotes = (desktop: StyledElement, screens: readonly StyledElement[]): StackNote[] => {
  const base = layouts(desktop);
  const others = screens.map(layouts);
  const out: StackNote[] = [];
  const seen = new Set<string>();
  const add = (n: StackNote): void => {
    const id = `${n.message}@${n.loc?.line}:${n.loc?.col}`;
    if (!seen.has(id)) {
      seen.add(id);
      out.push(n);
    }
  };
  for (const [key, b] of base) {
    if (b.layout !== "row" || b.wrapped) continue;
    const jc = get(b.el.style, "justify-content") ?? "normal";
    const items = b.el.children.filter((c): c is StyledElement => c.type === "element" && get(c.style, "display") !== "none");
    for (const o of others) {
      const here = o.get(key);
      if (!here || !STACKS["row"]!.has(here.layout)) continue;
      if (END.has(jc) && !items.some(grows)) {
        add({
          message: `justify-content: ${jc} is not undone where this row stacks`,
          hint: "The packed row stays centered or right-aligned on the narrow screen, where flex would stretch the blocks. Use justify-content: flex-start or space-between, or give a column flex: 1.",
          loc: b.loc,
        });
      }
      const kids = here.el.children.filter((c): c is StyledElement => c.type === "element" && get(c.style, "display") !== "none");
      for (const c of kids) {
        if (px(get(c.style, "min-height")) > 0) {
          add({
            message: "min-height is dropped where this row stacks",
            hint: "The stacked block is as tall as its content. Put the min-height on a block inside the item.",
            loc: c.loc ?? b.loc,
          });
        }
      }
      if (here.layout === "block") {
        // block flow: inline children share a line, and vertical margins collapse
        if (kids.some((c) => (get(c.style, "display") ?? "inline").startsWith("inline"))) {
          add({
            message: "inline children are stacked as blocks where this row turns into display: block",
            hint: "In block flow they would sit on one line. Make them blocks, or use flex-direction: column.",
            loc: b.loc,
          });
        }
        if (kids.some((c, i) => i > 0 && px(get(kids[i - 1]!.style, "margin-bottom")) > 0 && px(get(c.style, "margin-top")) > 0)) {
          add({
            message: "vertical margins between the items don't collapse where this row turns into display: block",
            hint: "Both margins are kept, so the gap is their sum. Keep the spacing on one side of the items.",
            loc: b.loc,
          });
        }
        continue; // block layout ignores align-items
      }
      for (const c of kids) {
        if (get(c.style, "margin-left") === "auto" || get(c.style, "margin-right") === "auto") {
          add({
            message: "an auto margin no longer places this item where its row stacks",
            hint: "In the column layout the item shrinks to its content and sits at that side; the stacked cell fills the width. Give the item a width, or use align-self.",
            loc: c.loc ?? b.loc,
          });
        }
        const basis = Number.parseFloat(get(c.style, "flex-basis") ?? "");
        if (basis > 0 && /px$/.test(get(c.style, "flex-basis") ?? "")) {
          add({
            message: `flex-basis: ${basis}px is a height where this row stacks, and is dropped there`,
            hint: "The stacked block is as tall as its content. Give the item a height or min-height if it needs one.",
            loc: c.loc ?? b.loc,
          });
        }
        const w = get(c.style, "width");
        if (w !== undefined && w !== "auto") continue; // a width of its own is carried
        const self = get(c.style, "align-self") ?? "auto";
        const v = self === "auto" ? (get(here.el.style, "align-items") ?? "normal") : self;
        const where = END.has(v) || v === "self-end" ? "centered or right-aligned" : painted(c.style) && ["flex-start", "start", "self-start", "baseline"].includes(v) ? "left" : undefined;
        if (where === undefined) continue;
        add({
          message: `a stacked column stays full width where align-items places it ${where}`,
          hint: "In the column layout a content-sized item shrinks to its content and sits at the side; the stacked cell fills the width. Give the item a width, or use align-items: stretch.",
          loc: c.loc ?? b.loc,
        });
      }
    }
  }
  return out;
};

// Layout IR (docs/architecture.md). No CSS syntax, no tables. Changing a field's meaning needs an
// entry in docs/decisions.md §4.
// Lengths are px numbers. Column widths are outer (margin-box) widths, maxWidth/width
// are border-box, image width/height are the rendered image size. Margins are >= 0 after the bleed pass (the analyzer lets through only negatives that cancel the parent's padding),
// `auto` margins become `align`, and after margin-to-padding every margin is 0.

import type { SrcLoc } from "../loc.ts";
export type { SrcLoc };

export type Sides<T = number> = { top: T; right: T; bottom: T; left: T };

export type BorderSide = { width: number; style: "solid" | "dashed" | "dotted"; color: string };

/** Per-side borders; a missing side has no border. */
export type Border = Partial<Sides<BorderSide>>;

/** Declarations to inline verbatim, property → value (longhands, lowered values). */
export type Style = Readonly<Record<string, string>>;

export type Align = "left" | "center" | "right";
export type VAlign = "top" | "middle" | "bottom";

export type Box = {
  padding: Sides;
  margin: Sides;
  border?: Border;
  background?: string; // a solid colour, also the fallback under backgroundImage
  // What clients that paint CSS backgrounds get (url() or a gradient). `url` is set for a photo,
  // so Outlook can get it through VML; gradients only ever fall back to `background` there.
  backgroundImage?: { css: string; url?: string; size?: string; position?: string; repeat?: string };
  minHeight?: number; // px; a hero's height when its content is shorter than its photo
  radius?: number; // the largest corner, so "is it rounded" stays a plain check
  radii?: readonly [number, number, number, number]; // only when corners differ: tl, tr, br, bl
  clip?: boolean; // content wider than the box is cut off at its edge
  maxWidth?: number;
  width?: { px: number } | { pct: number }; // pct of the parent's content box
  // where the node sits in the space its parent gives it (margin: auto, align-items…)
  align?: Align;
  // A wrapper around a node that is display:none on some screens only: its cell is emitted hidden
  // where it is "hidden", and present but plain where it is "shown", so every compile has one structure.
  hide?: "hidden" | "shown";
};

// calc(P% ± Npx): its own key, so no `"px" in` check mistakes it for a fixed width.
export type WidthSpec = { px: number } | { pct: number } | { calc: { pct: number; px: number } } | { grow: number } | { auto: true };

// px for Outlook width= attrs, pct for everyone else.
export type ResolvedWidth = { px: number; pct: number };

// What resolve-widths decided for a column: its width, or null where the table sizes it on purpose
// (auto columns, grow columns beside them, Outlook-only items without a width). Absent: not resolved yet.
export type ColumnResolution = ResolvedWidth | null;

export type Column = {
  width: WidthSpec;
  valign: VAlign;
  child: Node;
  // content alignment inside the cell; the flex rule derives it from justify-content
  align?: Align;
  padding?: Sides; // transparent cell padding (gutters from gap-to-padding), inside `resolved`
  stretch?: boolean; // align-items: stretch — a painted full-width child fills the row's height
  hidden?: boolean; // the item is display:none on some screens only: its cells are emitted hidden (the others show it)
  noShrink?: boolean; // flex-shrink: 0 on a px column: a squeezed row overflows rather than narrow it
  resolved?: ColumnResolution; // set by resolve-widths (ir/phase.ts)
};

export type StackNode = {
  kind: "stack";
  box: Box;
  children: Node[];
  // vertical gap between children (flex columns). gap-to-padding wraps children in
  // transparent stacks with padding-top and sets it to 0
  gap: number;
  collapse: boolean; // block flow: children's vertical margins collapse. Flex columns: false
  // where the children sit when box.minHeight leaves spare height (absent: at the top)
  justify?: "end" | "center" | "between" | "around" | "evenly";
  resolvedWidth?: number; // border-box width, set by resolve-widths (ir/phase.ts)
  reportedWide?: true; // a root W011 already reported as wider than the width option (no W004 for its clamp)
  loc?: SrcLoc;
};

// cap: its own px width; pct: its own % width; place: where align-items puts a capped column;
// inset: side margins that stay between it and the screen edge.
export type StackItem = { cap?: number; pct?: number; place?: Align; inset: { left: number; right: number } };

export type RowNode = {
  kind: "row";
  box: Box;
  gap: number; // 0 after gap-to-padding
  wrap: boolean;
  cols: Column[];
  // Stacks on this screen: the columns are still a row here, and the emitter writes them as blocks
  // with `gap` px above all but the first. `items`: what each column keeps of its own in the column
  // layout, by column index.
  stacked?: { gap: number; items?: ReadonlyArray<StackItem | undefined> };
  resolvedWidth?: number; // border-box width, set by resolve-widths (ir/phase.ts)
  reportedWide?: true; // as on StackNode
  loc?: SrcLoc;
};

export type ImageNode = {
  kind: "image";
  box: Box;
  src: string;
  alt: string;
  width?: number; // fluid images get it from their slot in resolve-widths
  height?: number;
  fluid?: boolean; // max-width: 100%
  href?: string; // <a href><img></a>
  float?: "left" | "right"; // align attribute: text wraps around the image
  // text styles of the line an inline image sits on; that line's strut adds the space under it
  line?: Style;
  loc?: SrcLoc;
};

export type ButtonNode = {
  kind: "button";
  box: Box;
  href: string;
  content: string; // inner html of the link
  style: Style; // text styles of the link
  attrs?: Record<string, string>; // non-style attributes kept on the <a> (docs/decisions.md §4)
  loc?: SrcLoc;
};

// Text-level content passed through (p, h1, lists, runs of text…), styles already
// inlined. `style` is the inherited text style at this point — it goes on the
// enclosing cell since Outlook doesn't inherit across tables. The fragment's own
// margins are lifted into `margin` so the passes can treat them like any other.
export type InlineNode = {
  kind: "inline";
  html: string;
  style: Style;
  // Declarations the content's only top-level block element states itself; the cell leaves
  // those out (the element keeps them, so the output reads the same).
  restated?: Style;
  margin: Sides;
  loc?: SrcLoc;
};

// Emitted as-is: data-email="raw", or unsupported input.
export type RawNode = { kind: "raw"; html: string; loc?: SrcLoc };

export type ConditionalNode = {
  kind: "conditional";
  target: "mso" | "not-mso";
  child: Node;
  loc?: SrcLoc;
};

// A list or branches the ESP resolves at send time (docs/templates.md). Paths name data, never a dialect.
// A condition means what the same test means in JS on the JSON data the ESP is sent (a missing
// field reads as undefined). A dialect writes it exactly, or exactly under a data requirement it
// states (src/template/dialects.ts), never as something else.
export type Operand = { path: string } | { literal: string } | { num: number } | { bool: boolean };
export type Cond =
  | { op: "truthy"; path: string } // !!v
  | { op: "nullish"; path: string } // v == null: null or missing
  | { op: "nonEmpty"; path: string } // v.length > 0 on a list
  | { op: "==" | "!="; left: { path: string }; right: Operand } // v === right / v !== right
  | { op: "not"; cond: Cond }
  | { op: "and" | "or"; conds: readonly Cond[] };

export type Branch = { when: Cond; child: Node };

// `unless` is an if with `not`; the first branch that holds is shown, else `otherwise`.
export type TemplateNode =
  | { kind: "template"; op: "each"; path: string; as?: string; child: Node; loc?: SrcLoc } // as: loop variable, default "item"
  | { kind: "template"; op: "if"; branches: readonly Branch[]; otherwise?: Node; loc?: SrcLoc };

export type Node =
  | StackNode
  | RowNode
  | ImageNode
  | ButtonNode
  | InlineNode
  | RawNode
  | ConditionalNode
  | TemplateNode;

export type NodeKind = Node["kind"];
export type NodeOf<K extends NodeKind> = Extract<Node, { kind: K }>;

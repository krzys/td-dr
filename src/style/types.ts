import type { SrcLoc } from "../loc.ts";

export type Declarations = Readonly<Record<string, string>>;

// Longhands, lengths in px where possible, inherited props included.
// Properties at their initial value may be missing.
export type ComputedStyle = Declarations;

export type Cascaded = {
  values: Declarations;
  authored: ReadonlySet<string>; // won by author CSS or style="", not the UA sheet
};

export type StyledElement = {
  type: "element";
  tag: string; // lowercase
  attrs: Readonly<Record<string, string>>;
  style: ComputedStyle; // for decisions
  // only what was authored on this element (computed values) — for re-serializing
  declared: ComputedStyle;
  children: StyledNode[];
  vwProps?: ReadonlySet<string>; // props whose value came from a viewport unit
  parentStyle?: ComputedStyle; // e.g. an inline-block sits where its parent's text-align puts it
  // display:none on some screens and shown on others: kept in every compile, hidden where it is none (docs/head-styles.md#show-hide-and-stack)
  keep?: "hidden" | "shown";
  // a row or grid this screen stacks: cascaded as the row it is elsewhere (src/responsive/stack.ts)
  // "block": it stacks as display:block (no align-items); "column": as a flex column
  stacked?: "column" | "block";
  loc?: SrcLoc;
};

// For a container that stacks on some screens: the style it has as a row, or undefined where it doesn't stack.
export type Unstack = (style: ComputedStyle) => { style: ComputedStyle; to: "column" | "block" } | undefined;

export type StyledText = { type: "text"; text: string; loc?: SrcLoc };

// Only MSO conditional comments survive sanitize.
export type StyledComment = { type: "comment"; data: string; loc?: SrcLoc };

export type StyledNode = StyledElement | StyledText | StyledComment;

// The screen a compile assumes; @media and :hover are evaluated against it (docs/head-styles.md).
export type Env = { readonly viewport: number; readonly dark: boolean; readonly hover: boolean };
export const DESKTOP: Env = { viewport: Infinity, dark: false, hover: false };

// What the author's rules tell apart. `ranges` are inclusive px viewports, below the desktop one,
// where the width queries answer differently from the next range up.
export type Conditions = { ranges: { min: number; max: number }[]; dark: boolean; hover: boolean };

// @import and @font-face rules for web fonts, verbatim and in source order (docs/images-and-fonts.md#web-fonts)
export type FontRules = { imports: string[]; faces: string[] };

export type StyledDoc = { body: StyledElement; conditions: Conditions; fonts: FontRules };

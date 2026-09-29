import type { Ctx } from "../ctx.ts";
import type { StyledElement, StyledNode } from "../style/types.ts";
import { FIELD_OPEN } from "../template/tokens.ts";
import { WHITE, paintOf, type Paint } from "./colour.ts";

// What the compile knows beyond the styled tree; without it the document checks stay quiet.
export type LintDoc = { lang: string | undefined; dark: boolean };
export type Check = (body: StyledElement, ctx: Ctx, doc: LintDoc | undefined) => void;

const MERGE_TAG = /\{\{|\{%|\*\|[^|]*\|\*|%%[^%]+%%|<%|\$\{/;
export const hasMergeTag = (s: string): boolean => s.includes(FIELD_OPEN) || MERGE_TAG.test(s);

// Gone from view: not read, not seen, so not linted. The preheader leaves the body in sanitize.
export const isInvisible = (el: StyledElement): boolean =>
  el.style["display"] === "none" ||
  el.style["mso-hide"] === "all" ||
  el.style["visibility"] === "hidden" ||
  el.attrs["aria-hidden"] === "true" ||
  el.attrs["data-email"] === "preheader" ||
  el.attrs["data-email"] === "outlook-only";

const BLANK = /[\s​-‏⁠͏﻿]/g;
export const isRealText = (s: string): boolean => s.replace(BLANK, "") !== "";

// An element whose own text node carries its colour and size.
export const hasOwnText = (el: StyledElement): boolean => el.children.some((c) => c.type === "text" && isRealText(c.text));

export const elementsOf = (el: StyledElement): StyledElement[] => el.children.filter((c): c is StyledElement => c.type === "element");

// All visible text below an element, as a screen reader would speak it.
export const textOf = (el: StyledElement): string =>
  el.children.map((c: StyledNode) => (c.type === "text" ? c.text : c.type === "element" && !isInvisible(c) ? textOf(c) : "")).join("");

// Document order; hidden subtrees are skipped. `paint` is what sits behind the element's content.
export const walk = (body: StyledElement, visit: (el: StyledElement, paint: Paint) => void): void => {
  const go = (el: StyledElement, parent: Paint): void => {
    if (isInvisible(el)) return;
    const paint = paintOf(el, parent);
    visit(el, paint);
    for (const c of elementsOf(el)) go(c, paint);
  };
  go(body, WHITE);
};

// font-size in px, 16 when the cascade left it at the initial value; undefined for units we can't read
export const fontPx = (el: StyledElement): number | undefined => {
  const v = el.style["font-size"];
  if (v === undefined) return 16;
  return v.endsWith("px") ? Number.parseFloat(v) : undefined;
};

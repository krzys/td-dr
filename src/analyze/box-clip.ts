// How overflow:hidden survives in email: edge children wear the box's rounded corners, or a
// no-wrap line is cut off by its cell. Anything else it clipped is reported dropped.
import type { Ctx } from "../ctx.ts";
import type { BorderSide, Box } from "../ir/index.ts";
import { get } from "../style/props.ts";
import type { StyledElement, StyledNode } from "../style/types.ts";
import { CORNERS, isPaintedNode } from "./box-paint.ts";
import { INLINE_TAGS, isContainer, isFlex, isGrid, isTextBlock, isTransparent } from "./classify.ts";

export const CLIPS = /^(hidden|clip)$/;
export const clipsOverflow = (el: StyledElement): boolean =>
  ["overflow", "overflow-x", "overflow-y"].some((p) => CLIPS.test(el.style[p] ?? ""));

const blank = (n: StyledNode): boolean => n.type === "comment" || (n.type === "text" && /^[ \t\n\r\f]*$/.test(n.text));

// A rounded box with overflow:hidden clips its content to the corners. Email can't clip, but a first or
// last child that fills the box edge to edge (a photo, a painted block) can wear the same corners.
const edgeFill = (c: StyledNode): c is StyledElement => {
  if (c.type !== "element" || ["margin-top", "margin-right", "margin-bottom", "margin-left"].some((m) => c.style[m] !== undefined && Number.parseFloat(c.style[m]!) !== 0)) return false;
  const kids = c.children.filter((k) => !blank(k));
  const img = c.tag === "img" ? c : c.tag === "a" && kids.length === 1 && kids[0]?.type === "element" && kids[0].tag === "img" ? kids[0] : undefined;
  if (img) return [c, img].some((e) => e.style["width"] === "100%");
  const bg = c.style["background-color"];
  const painted = (bg !== undefined && !isTransparent(bg)) || (c.style["background-image"] ?? "none") !== "none";
  return painted && isContainer(c) && (c.style["width"] === undefined || c.style["width"] === "auto" || c.style["width"] === "100%");
};

const edgeIndex = (el: StyledElement, from: "first" | "last"): number | undefined => {
  const idx = el.children.map((c, i) => (blank(c) ? -1 : i)).filter((i) => i >= 0);
  const i = from === "first" ? idx[0] : idx.at(-1);
  const pad = (s: string): boolean => Number.parseFloat(el.style[`padding-${s}`] ?? "0") > 0;
  if (i === undefined || pad(from === "first" ? "top" : "bottom") || pad("left") || pad("right")) return undefined;
  return edgeFill(el.children[i]!) ? i : undefined;
};

export const hasRadius = (el: StyledElement): boolean => CORNERS.some((c) => Number.parseFloat(el.style[`border-${c}-radius`] ?? "0") > 0);

// Only a stack or row becomes a box cell that can hold the clip, and a text block, whose box moves to a
// wrapping stack's cell (passThrough). Links and images never do, so for them overflow stays a dropped property.
const lowersToCell = (el: StyledElement): boolean =>
  !INLINE_TAGS.has(el.tag) && el.tag !== "hr" && (isTextBlock(el) || isContainer(el) || isFlex(el) || isGrid(el));

const roundsEdges = (el: StyledElement): boolean =>
  clipsOverflow(el) && isContainer(el) && !/flex|grid/.test(el.style["display"] ?? "") && (edgeIndex(el, "first") !== undefined || edgeIndex(el, "last") !== undefined);

export const clipMode = (el: StyledElement): "corners" | "line" | undefined =>
  !clipsOverflow(el) ? undefined : hasRadius(el) && roundsEdges(el) ? "corners" : lowersToCell(el) && get(el.style, "white-space") === "nowrap" ? "line" : undefined;

const paints = (k: StyledNode): boolean =>
  k.type === "element" && (k.tag === "img" || isPaintedNode(k) || k.children.some(paints));

// Rounded corners that overflow:hidden no longer rounds: a painted child sits at the corner and neither
// wears the radius (it has a margin, is narrower, or the radius could not be resolved) nor is inset by padding.
export const unclippedCorners = (el: StyledElement): string[] =>
  CORNERS.filter((corner) => {
    if (!(Number.parseFloat(el.style[`border-${corner}-radius`] ?? "0") > 0)) return false;
    const [v, h] = corner.split("-") as [string, string];
    if (Number.parseFloat(el.style[`padding-${v}`] ?? "0") > 0 || Number.parseFloat(el.style[`padding-${h}`] ?? "0") > 0) return false;
    const kids = el.children.filter((c) => !blank(c));
    const child = v === "top" ? kids[0] : kids.at(-1);
    if (child === undefined || !paints(child)) return false;
    return !(edgeFill(child) && Number.parseFloat(child.style[`border-${corner}-radius`] ?? "0") > 0);
  });

// The cell cuts a no-wrap line off at its edge, except in Outlook (W003).
export const lineClip = (el: StyledElement, ctx: Ctx): boolean => {
  if (clipMode(el) !== "line") return false;
  ctx.diagnostics.report("W003", {
    message: "overflow: hidden cuts the line off in most clients; Outlook ignores it, so the line may wrap or stretch the table there",
    hint: "Outlook Windows has no overflow clipping. Keep the content within the width, or accept that Outlook shows all of it.",
    loc: el.loc,
  });
  return true;
};

// The element as its children are lowered: the edge children wear the box's corners, minus the border
// they sit inside, wherever overflow:hidden would have clipped them. A new element; `el` stays as it is.
export const roundEdges = (el: StyledElement, box: Box): StyledElement => {
  const largest = box.radius ?? 0;
  if (!(largest > 0) || !roundsEdges(el)) return el;
  const radii = box.radii ?? [largest, largest, largest, largest];
  const border = box.border ?? {};
  const inner = (i: number, a: BorderSide | undefined, b: BorderSide | undefined): number => Math.max(0, radii[i]! - Math.max(a?.width ?? 0, b?.width ?? 0));
  const edges = [
    ["first", [["top-left", inner(0, border.top, border.left)], ["top-right", inner(1, border.top, border.right)]]],
    ["last", [["bottom-right", inner(2, border.bottom, border.right)], ["bottom-left", inner(3, border.bottom, border.left)]]],
  ] as const;
  const children = [...el.children];
  for (const [from, corners] of edges) {
    const i = edgeIndex(el, from);
    const child = i === undefined ? undefined : children[i];
    if (child?.type !== "element") continue;
    const style: Record<string, string> = { ...child.style };
    for (const [corner, r] of corners) {
      const key = `border-${corner}-radius`;
      if (r > 0 && !Number.parseFloat(style[key] ?? "0")) style[key] = `${r}px`;
    }
    children[i!] = { ...child, style };
  }
  return { ...el, children };
};

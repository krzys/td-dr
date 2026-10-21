import type { Ctx } from "../ctx.ts";
import { locKey, unwrapHide, withLoc, zeroSides, type InlineNode, type Node, type Sides } from "../ir/index.ts";
import { INHERITED, lineHeightPx, saysNothing, textAlignOf } from "../style/props.ts";
import type { ComputedStyle, StyledElement, StyledNode } from "../style/types.ts";
import { INLINE_TAGS, isHidden, isInlineLevel, isTransparent } from "./classify.ts";
import { buildBox, reportDropped } from "./box.ts";
import { bleedsParent, legacyAlign, negativeMarginHint } from "./box-geometry.ts";
import { firstStop, firstStopRaw, isGradientText } from "./box-paint.ts";
import { warnFloatWrapStops } from "./float.ts";
import { hideWrap } from "./hide.ts";
import type { Item } from "./order.ts";
import { lintTree } from "./lint.ts";
import { ownStyle, serializeStyled } from "./serialize-styled.ts";

export const textStyle = (style: ComputedStyle): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const p of INHERITED) {
    const v = p === "line-height" ? lineHeightPx(style) : p === "text-align" ? textAlignOf(style) : style[p];
    if (v !== undefined && !saysNothing(undefined, style, p, v)) out[p] = v;
  }
  return out;
};

const lintNodes = (nodes: readonly StyledNode[], ctx: Ctx): void => {
  for (const n of nodes) if (n.type === "element") lintTree(n, ctx);
};

// An anonymous run of text and inline elements becomes one InlineNode.
export const inlineRun = (nodes: readonly StyledNode[], parent: StyledElement, ctx: Ctx): InlineNode => {
  lintNodes(nodes, ctx);
  return withLoc(
    { kind: "inline", html: serializeStyled(nodes, parent.style), style: textStyle(parent.style), margin: zeroSides() },
    nodes.find((n) => n.loc)?.loc,
  );
};

const MARGINS = ["top", "right", "bottom", "left"] as const;

const marginPx = (el: StyledElement, side: (typeof MARGINS)[number], ctx: Ctx): number => {
  const v = el.style[`margin-${side}`];
  if (v === undefined || v === "auto" || v === "0") return 0;
  if (v.endsWith("%")) {
    ctx.diagnostics.report("E006", { message: `Percentage margin (margin-${side}: ${v})`, loc: el.loc });
    return 0;
  }
  const n = Number.parseFloat(v);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) {
    if (v.endsWith("px") && bleedsParent(el, side, n)) return n;
    const hint = negativeMarginHint(side, el);
    ctx.diagnostics.report("E005", { message: `Negative margin (margin-${side}: ${v})`, ...(hint ? { hint } : {}), loc: el.loc });
    return 0;
  }
  return n;
};

const pxOf = (v: string | undefined): number => {
  const n = Number.parseFloat(v ?? "0");
  return Number.isFinite(n) && n > 0 && !v?.endsWith("%") ? n : 0;
};

// Only HTML whitespace collapses; an &nbsp; is content (trim() would eat it).
export const isBlank = (n: StyledNode): boolean => n.type === "comment" || (n.type === "text" && /^[ \t\n\r\f]*$/.test(n.text));

// Block descendants whose top (or bottom) margin collapses through `el` in CSS.
// Inside a table cell they can't escape any more, so we lift them out ourselves.
const edgeChain = (el: StyledElement, side: "top" | "bottom"): StyledElement[] => {
  const chain: StyledElement[] = [];
  let cur = el;
  while (!pxOf(cur.style[`padding-${side}`]) && !(pxOf(cur.style[`border-${side}-width`]) && cur.style[`border-${side}-style`] !== "none")) {
    const kids = side === "top" ? cur.children : [...cur.children].reverse();
    const next = kids.find((k) => !isBlank(k));
    if (next?.type !== "element" || isInlineLevel(next) || isHidden(next)) break;
    chain.push(next);
    if (!/^(block|list-item)$/.test(next.style["display"] ?? "")) break; // flex/table children don't collapse
    cur = next;
  }
  return chain;
};

// Box properties Outlook ignores on p/h1/li…; they move to the enclosing cell.
export const BOX_PROP = /^(margin|padding|border|background|width$|max-width$|min-height$|box-sizing$)/;
// Lists keep their indent (docs/support.md#lists-dividers-and-author-tables); tables are already cells.
export const KEEPS_BOX: ReadonlySet<string> = new Set(["ul", "ol", "dl", "table"]);

const CLIP_PROPS = /^(-webkit-)?background-(clip|image|size|position|repeat)$|^-webkit-text-fill-color$/;

// Gradient text (background-clip: text over color: transparent) is invisible wherever the gradient is dropped,
// so the text gets the gradient's first colour and loses the gradient.
// Clipped elements further down can't be rewritten here (serialize-styled is shared); say so.
const warnNestedGradientText = (el: StyledElement, ctx: Ctx): void => {
  for (const k of el.children) {
    if (k.type !== "element") continue;
    if (isGradientText(k)) {
      ctx.diagnostics.report("W001", { message: "gradient text is invisible where gradients are dropped (Outlook, Yahoo)", hint: "Give the text a solid color instead of color: transparent.", loc: k.loc });
    }
    warnNestedGradientText(k, ctx);
  }
};

// An alpha channel would keep "solid" text see-through: #rrggbbaa → #rrggbb, rgba() → rgb().
const opaque = (c: string): string =>
  c
    .replace(/^#([0-9a-f]{6})[0-9a-f]{2}$/i, "#$1")
    .replace(/^#([0-9a-f]{3})[0-9a-f]$/i, "#$1")
    .replace(/^(rgb|hsl)a?\(([^,/)]+)[,\s]+([^,/)]+)[,\s]+([^,/)]+?)\s*(?:[,/][^)]*)?\)$/i, "$1($2, $3, $4)");

export const solidGradientText = (el: StyledElement, ctx: Ctx): StyledElement => {
  warnNestedGradientText(el, ctx);
  const clip = (el.style["background-clip"] ?? el.style["-webkit-background-clip"]) === "text";
  if (!clip) return el;
  // whatever is clipped to the glyphs (image, gradient or colour) must never become a painted cell
  const drop = (p: string): boolean => CLIP_PROPS.test(p) || p === "background-color";
  const strip = (rec: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(rec).filter(([p]) => !drop(p)));
  const bare = (color?: string): StyledElement => {
    const set = color === undefined ? {} : { color, "-webkit-text-fill-color": color };
    return { ...el, style: { ...strip(el.style), ...set }, declared: { ...strip(el.declared), ...set } };
  };
  const see = (c: string | undefined): c is string => c !== undefined && !isTransparent(c);
  const fill = el.style["-webkit-text-fill-color"] ?? el.style["color"];
  if (see(fill)) return bare(); // the text paints over its own clipped background, in the source too

  const authored = [el.declared["-webkit-text-fill-color"], el.declared["color"]].find(see);
  const image = el.style["background-image"];
  const raw = image && image !== "none" ? firstStopRaw(image) : undefined;
  const stop = raw !== undefined && firstStop(`linear-gradient(${opaque(raw)}, ${opaque(raw)})`) !== undefined ? opaque(raw) : undefined;
  const bg = el.style["background-color"];
  const inherited = el.parentStyle?.["color"];
  const [colour, why] =
    authored !== undefined ? [authored, "the authored colour is used"]
    : stop !== undefined ? [stop, "the first colour stop is used"]
    : see(bg) ? [opaque(bg), "the clipped background colour is used"]
    : see(inherited) ? [inherited, "the surrounding text colour is used"]
    : ["#000000", "no colour was found, so black is used"];
  ctx.diagnostics.report("W001", {
    message: `Text clipped to its background becomes solid ${colour}`,
    hint: `Email clients can't clip a background to text; ${why}. Set a solid color to choose it.`,
    loc: el.loc,
  });
  return bare(colour);
};

// The cell spaces the root, but an author table's auto side margins centre it in that cell (align="center" is one),
// as does a centring parent (<center>, div align). align="left" / "right" floats it there by itself;
// margin:0 auto is the only other margin a table may carry.
const tableMargin = (el: StyledElement): string =>
  el.tag === "table" && ((el.style["margin-left"] === "auto" && el.style["margin-right"] === "auto") || legacyAlign(el) === "center") ? "0 auto" : "0";

/**
 * A text block or inline element passed through as one InlineNode. The root is
 * serialized with every inherited value spelled out (no parent), so a client's
 * own `h1 { font-size: 2em }` can't double it. Its margins (plus any that
 * collapse through it) move to `margin` for the passes; a text block's padding,
 * border and background move to a wrapping stack so they end up on the cell.
 */
export const passThrough = (source: StyledElement, ctx: Ctx): Node => {
  const el = solidGradientText(source, ctx);
  // Never emit <hr>: it becomes an empty bordered box, i.e. a divider cell.
  if (el.tag === "hr") return withLoc({ kind: "stack", box: buildBox(el, ctx), children: [], gap: 0, collapse: true }, el.loc);
  lintNodes(el.children, ctx);
  const block = !isInlineLevel(el);
  const lift = block && !KEEPS_BOX.has(el.tag);
  const box = lift ? buildBox(el, ctx) : undefined;
  // the box props move to the cell; any the cell can't carry (background-image, border-image…) are lost
  if (lift) reportDropped({ ...el, declared: Object.fromEntries(Object.entries(el.declared).filter(([p]) => BOX_PROP.test(p))) }, ctx);
  const margin: Sides = box ? { ...box.margin } : zeroSides();
  if (!box) for (const side of MARGINS) margin[side] = marginPx(el, side, ctx);
  const top = block ? edgeChain(el, "top") : [];
  const bottom = block ? edgeChain(el, "bottom") : [];
  // a bleed margin can't share an edge with a collapsing child margin: max() would drop the bleed
  for (const [side, chain] of [["top", top], ["bottom", bottom]] as const) {
    const inner = Math.max(0, ...chain.map((d) => pxOf(d.style[`margin-${side}`])));
    if (margin[side] < 0 && inner > 0) {
      ctx.diagnostics.report("E005", {
        message: `margin-${side}: ${margin[side]}px is negative and a child's margin-${side} collapses into it`,
        hint: `Give the band padding-${side} (or remove the child's margin-${side}) so the bleed is the only margin on that edge.`,
        loc: el.loc,
      });
      margin[side] = 0;
    }
    margin[side] = Math.max(margin[side], inner);
  }
  let restated: Record<string, string> | undefined;
  const onLine = /^inline(-block)?$/.test(el.style["display"] ?? "inline");
  // an inline element on a line is the same element alone in its parent or in a run (a template's
  // v-if beside it must not change it): it restates only what differs from the line
  const alike = !block && onLine;
  const html = serializeStyled([el], undefined, {
    rootKept: block,
    styleOf: (n, parent) => {
      const s = ownStyle(n, n === el && alike ? el.parentStyle : parent);
      if (n === el) {
        const out: Record<string, string> = {};
        for (const [p, v] of Object.entries(s)) if (!p.startsWith("margin") && !(lift && BOX_PROP.test(p))) out[p] = v;
        // a blockified flex item (<span> → block) must keep a box, or its padding stops adding height;
        // in a row it shrink-wraps like the flex item did, instead of filling its cell
        const d = el.style["display"];
        const inRow = /flex/.test(el.parentStyle?.["display"] ?? "") && !/column/.test(el.parentStyle?.["flex-direction"] ?? "");
        if (INLINE_TAGS.has(el.tag) && !out["display"] && d && d !== "inline") out["display"] = inRow && d === "block" ? "inline-block" : d;
        // a block's own styles beat the cell's; an inline's don't reach the line's strut
        if (block) restated = out;
        return alike && margin.top + margin.right + margin.bottom + margin.left === 0 ? out : { ...out, margin: tableMargin(el) };
      }
      if (top.includes(n) && pxOf(s["margin-top"])) s["margin-top"] = "0";
      if (bottom.includes(n) && pxOf(s["margin-bottom"])) s["margin-bottom"] = "0";
      return s;
    },
  });
  // an inline-level element sits on a line made by its parent: the cell is that line, so its strut
  // (font size, line height) and alignment are the parent's; the element keeps its own on itself
  // (a flex item is blockified: it is its own box, not on a line)
  const line = onLine && el.parentStyle ? el.parentStyle : el.style;
  const inline: InlineNode = withLoc({ kind: "inline", html, style: textStyle(line), ...(restated ? { restated } : {}), margin: zeroSides() }, el.loc);
  if (!box) return { ...inline, margin };
  const { padding, border, background, backgroundImage, minHeight, radius, clip, width, maxWidth, align } = box;
  const painted = !!background || !!backgroundImage || !!minHeight || !!radius || !!clip || Object.keys(border ?? {}).length > 0;
  const sized = !!width || !!maxWidth || !!align;
  const hasPadding = padding.top || padding.right || padding.bottom || padding.left;
  // a box another screen paints or pads stays one here too (ctx.otherScreens.boxed), so both have one structure
  const boxedSomewhere = el.loc !== undefined && !!ctx.otherScreens?.boxed.has(locKey(el.loc));
  if (!painted && !sized && !hasPadding && !boxedSomewhere) return { ...inline, margin };
  return withLoc({ kind: "stack", box: { ...box, margin }, children: [inline], gap: 0, collapse: false }, el.loc);
};

const blank = isBlank;

// An item as a plain node again: hidden ones get their hide cell back.
export const itemNode = (it: Item): Node => (it.hide ? hideWrap(it.node, it.hide, it.el?.loc) : it.node);

// Flex items, each with the element it came from (text runs have none), so the
// flex rule can read flex-basis, align-self and friends.
export const analyzeItems = (
  el: StyledElement,
  ctx: Ctx,
  recurse: (n: StyledElement) => Node,
): Item[] => {
  const out: Item[] = [];
  let run: StyledNode[] = [];
  const flush = (): void => {
    if (run.some((n) => !isBlank(n))) out.push({ node: inlineRun(run, el, ctx) });
    run = [];
  };
  for (const c of el.children) {
    if (c.type !== "element") run.push(c);
    else if (isHidden(c)) ctx.diagnostics.report("I002", { message: `Hidden <${c.tag}> dropped`, loc: c.loc });
    else {
      flush();
      out.push({ ...unwrapHide(recurse(c)), el: c });
    }
  }
  flush();
  return out;
};

export type ChildMode = {
  // flex containers: every element child is its own item; only text runs are grouped
  items?: boolean;
};

/**
 * Children of a container, in order. Hidden elements are dropped (I002),
 * block-level children go through `recurse`, and consecutive inline content
 * becomes one InlineNode — unless the run is a single element (a lone <img>
 * or <a>), which goes through `recurse` so the image/button rules see it.
 */
export const analyzeChildren = (
  el: StyledElement,
  ctx: Ctx,
  recurse: (n: StyledElement) => Node,
  mode: ChildMode = {},
): Node[] => {
  if (mode.items) return analyzeItems(el, ctx, recurse).map(itemNode);
  warnFloatWrapStops(el, ctx);
  const out: Node[] = [];
  let run: StyledNode[] = [];
  const flush = (): void => {
    const solid = run.filter((n) => !blank(n));
    const only = solid[0];
    if (solid.length === 1 && only?.type === "element") out.push(recurse(only));
    else if (solid.length > 0) out.push(inlineRun(run, el, ctx));
    else if (run.some((n) => n.type === "comment")) {
      // MSO conditionals that sanitize kept on purpose
      const comments = run.filter((n) => n.type === "comment");
      const inside = comments.map((c) => (c.type === "comment" ? c.data : "")).join("");
      const open = (inside.match(/<(table|tr|td)\b/gi) ?? []).length;
      const close = (inside.match(/<\/(table|tr|td)>/gi) ?? []).length;
      if (open !== close) {
        ctx.diagnostics.report("W001", { message: "MSO conditional opens and closes in different places", hint: "Keep each [if mso] … [endif] pair around one block, or use data-email=\"raw\".", loc: comments[0]?.loc });
      }
      out.push(withLoc({ kind: "raw", html: serializeStyled(comments, undefined) }, comments[0]?.loc));
    }
    run = [];
  };
  for (const c of el.children) {
    if (c.type !== "element") run.push(c);
    else if (isHidden(c)) ctx.diagnostics.report("I002", { message: `Hidden <${c.tag}> dropped`, loc: c.loc });
    else if (isInlineLevel(c)) run.push(c);
    else {
      flush();
      out.push(recurse(c));
    }
  }
  flush();
  return out;
};

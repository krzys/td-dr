import type { Ctx } from "../../ctx.ts";
import { withLoc, type Box, type StackNode } from "../../ir/index.ts";
import { get } from "../../style/props.ts";
import type { StyledElement } from "../../style/types.ts";
import { buildBox, reportDropped, reportRtlRow, withBox } from "../box.ts";
import { analyzeItems, itemNode } from "../children.ts";
import { isFlex } from "../classify.ts";
import { ALIGN, containerAlign, gapPx, isPainted, selfAlign, unsupported } from "../flex-items.ts";
import { rowOf } from "../flex-row.ts";
import { throughLink } from "../link-leaves.ts";
import { msoItem, reorder, type Item } from "../order.ts";
import type { Rule } from "../rule.ts";

const checkUnsupported = (el: StyledElement, items: Item[], ctx: Ctx): void => {
  const dir = get(el.style, "flex-direction");
  if (dir === "row-reverse" || dir === "column-reverse") unsupported(el, ctx, "flex-direction", dir);
  const wrap = get(el.style, "flex-wrap");
  if (wrap === "wrap-reverse") unsupported(el, ctx, "flex-wrap", wrap);
  const ac = get(el.style, "align-content");
  if (ac !== undefined && !["normal", "stretch", "flex-start", "start"].includes(ac)) unsupported(el, ctx, "align-content", ac);
};

const START = new Set(["flex-start", "start", "self-start", "baseline"]);

const JUSTIFY_COLUMN: Readonly<Record<string, StackNode["justify"]>> = {
  center: "center", "flex-end": "end", end: "end",
  "space-between": "between", "space-around": "around", "space-evenly": "evenly",
};

const stackOf = (el: StyledElement, items: Item[], ctx: Ctx): StackNode => {
  const box = buildBox(el, ctx);
  const cAlign = containerAlign(el, ctx, false);
  const placed = items.map((it): Item => {
    if (it.el && (Number.parseFloat(it.el.declared["flex-grow"] ?? "0") || 0) > 0) {
      ctx.diagnostics.report("W001", { message: "flex-grow in a column is dropped (no heights)", loc: it.el.loc });
    }
    const v = selfAlign(it, ctx) ?? cAlign;
    const align = ALIGN[v];
    const loc = it.el?.loc ?? el.loc;
    const own = "box" in it.node ? it.node.box : undefined;
    const sized = !!own && (!!own.width || own.maxWidth !== undefined);
    const shrinkWrapped = (): void =>
      void ctx.diagnostics.report("W003", { message: `align-items: ${v} would shrink-wrap this item's background or border; give it a width`, loc });
    const contentSized = it.node.kind === "image" || it.node.kind === "button";
    if (!align) {
      if (START.has(v) && own && !contentSized && isPainted(it) && !sized) shrinkWrapped();
      return it;
    }
    // text-align is the author's fix: nothing to report when it already does the job
    const textDone = (): boolean => {
      const ta = get((it.el ?? el).style, "text-align");
      return align === "center" ? ta === "center" : ta === "right" || ta === "end";
    };
    const noText = (): void =>
      void ctx.diagnostics.report("W003", { message: `align-items: ${v} can't center text by its content size; use text-align`, loc });
    if (own) {
      const autoMargin = it.el?.style["margin-left"] === "auto" || it.el?.style["margin-right"] === "auto";
      const aligned: Box = autoMargin && own.align ? own : { ...own, align }; // auto margins win over align-self
      // a block button that the column shrinks is content-sized now
      const { width: _w, maxWidth: _m, ...shrunk } = aligned;
      const fluidButton = it.node.kind === "button" && !!own.width && "pct" in own.width && own.width.pct === 100 && !it.el?.declared["width"];
      const node = withBox(it.node, fluidButton ? shrunk : aligned);
      if (!contentSized) {
        if (isPainted(it) && !sized) shrinkWrapped();
        else if (!sized && !textDone()) noText();
      }
      return { ...it, node };
    }
    if (textDone()) return it;
    // A text item hugs its content, so aligning the item is aligning its text —
    // the cell can do that, as long as the text doesn't set its own alignment.
    if (it.node.kind === "inline" && !it.el?.style["text-align"]) return { ...it, node: { ...it.node, style: { ...it.node.style, "text-align": align } } };
    noText();
    return it;
  });
  // only a min-height leaves a column spare height to place its items in
  const justify = box.minHeight ? JUSTIFY_COLUMN[get(el.style, "justify-content") ?? "normal"] : undefined;
  const stack: StackNode = { kind: "stack", box, children: placed.map(itemNode), gap: gapPx(el, ctx, "row-gap"), collapse: false };
  return withLoc(justify ? { ...stack, justify } : stack, el.loc);
};

export const flexRule: Rule = {
  name: "flex",
  matches: (el) => isFlex(el),
  analyze: throughLink((el, ctx, recurse) => {
    const items = reorder(analyzeItems(el, ctx, recurse), (it, v, why) => unsupported(it, ctx, "order", v, why));
    if (get(el.style, "display") === "inline-flex") {
      ctx.diagnostics.report("W003", { message: "inline-flex is laid out as a block-level row", hint: "Text around it moves to its own lines; use display: flex and put the text inside.", loc: el.loc });
    }
    checkUnsupported(el, items, ctx);
    reportDropped(el, ctx);
    const dir = get(el.style, "flex-direction");
    if (dir === "column" || dir === "column-reverse") return stackOf(el, items, ctx);
    reportRtlRow(el, ctx, items.filter((it) => !msoItem(it)).length);
    return rowOf(el, items, ctx);
  }),
};

import type { Ctx } from "../ctx.ts";
import { mapChildren, type Node } from "../ir/index.ts";
import { isInherited } from "../style/props.ts";
import type { StyledElement, StyledNode } from "../style/types.ts";
import { isBlank } from "./children.ts";
import { isFlex, isGrid, isHidden, isInlineLevel, isLinkBox, isTextBlock } from "./classify.ts";
import type { Rule } from "./rule.ts";

// Nested links keep their own; images that become image nodes get the href there (linkImages).
const KEEP: ReadonlySet<string> = new Set(["a", "img", "br", "wbr", "hr"]);
// One per document, or a hint for the whole link, not for each copy.
const NOT_COPIED: ReadonlySet<string> = new Set(["style", "id", "data-email"]);

// A copy of the link around `children`, coloured like the text it sits in: clients paint bare links blue.
const anchor = (link: StyledElement, parent: StyledElement, children: StyledNode[]): StyledElement => {
  const attrs = Object.fromEntries(Object.entries(link.attrs).filter(([k]) => !NOT_COPIED.has(k)));
  const own = { color: parent.style["color"] ?? "#000000", "text-decoration": link.style["text-decoration"] ?? "none" };
  const inherited = Object.fromEntries(Object.entries(parent.style).filter(([p]) => isInherited(p)));
  return { type: "element", tag: "a", attrs, style: { ...inherited, ...own }, declared: own, children, parentStyle: parent.style, ...(link.loc ? { loc: link.loc } : {}) };
};

// A link can't wrap the tables a box becomes (Outlook classic drops it), so each run of text
// inside gets its own copy (docs/layout.md#linked-blocks-clickable-cards). Flex items keep their element.
export const linkLeaves = (link: StyledElement): { el: StyledElement; anchors: number } => {
  let anchors = 0;
  const wrap = (parent: StyledElement, nodes: StyledNode[]): StyledElement => {
    anchors++;
    return anchor(link, parent, nodes);
  };
  // inside text blocks and inline elements everything is html: an image there needs its own copy
  const into = (el: StyledElement, html: boolean, parent: StyledElement): StyledElement => {
    if (el.tag === "img" && html) return wrap(parent, [el]);
    if (KEEP.has(el.tag) || el.attrs["data-email"] !== undefined) return el;
    return { ...el, children: spread(el, html || isTextBlock(el) || isInlineLevel(el)) };
  };
  const spread = (parent: StyledElement, html: boolean): StyledNode[] => {
    const items = isFlex(parent) || isGrid(parent);
    const out: StyledNode[] = [];
    let run: StyledNode[] = [];
    const flush = (): void => {
      const solid = run.filter((n) => !isBlank(n));
      const only = solid[0];
      if (solid.length === 1 && only?.type === "element") out.push(...run.map((n) => (n === only ? into(only, html, parent) : n)));
      else if (solid.length > 0) out.push(wrap(parent, run));
      else out.push(...run);
      run = [];
    };
    for (const c of parent.children) {
      if (c.type !== "element") {
        if (!items) run.push(c);
        else out.push(isBlank(c) ? c : wrap(parent, [c]));
      } else if (!items && !isHidden(c) && isInlineLevel(c)) run.push(c);
      else {
        flush();
        out.push(isHidden(c) ? c : into(c, html, parent));
      }
    }
    flush();
    return out;
  };
  // its text-decoration went onto the copies
  const { "text-decoration": _deco, ...declared } = link.declared;
  const el = { ...link, declared, children: spread(link, false) };
  return { el, anchors };
};

const linkImages = (n: Node, href: string): { node: Node; images: number } => {
  let images = 0;
  const walk = (m: Node): Node => {
    if (m.kind !== "image") return mapChildren(m, walk);
    if (m.href) return m;
    images++;
    return { ...m, href };
  };
  return { node: walk(n), images };
};

// For the rules that lower containers: a link box is lowered like the box it wraps.
export const throughLink =
  (analyze: Rule["analyze"]): Rule["analyze"] =>
  (el, ctx: Ctx, recurse) => {
    if (!isLinkBox(el)) return analyze(el, ctx, recurse);
    const { el: spread, anchors } = linkLeaves(el);
    const { node, images } = linkImages(analyze(spread, ctx, recurse), el.attrs["href"]!);
    const leaves = anchors + images;
    if (leaves > 0) ctx.diagnostics.report("I004", { message: `<a href> around a block: the link moves onto the ${leaves} text runs or images inside`, loc: el.loc });
    else {
      ctx.diagnostics.report("W001", {
        message: "<a href> around a block with no text or images inside: the link is dropped",
        hint: "A link can only sit on text or images in email; put some inside the box, or link a button below it.",
        loc: el.loc,
      });
    }
    return node;
  };

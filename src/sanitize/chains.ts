import { adapter } from "parse5-htmlparser2-tree-adapter";
import type { Ctx } from "../ctx.ts";
import { children, isElement, isText, locOf, type DomChild, type DomComment, type DomNode, type DomParent } from "../parse/dom.ts";
import { scanChains, type Access } from "../template/chain.ts";
import { CHAIN_ATTRS } from "../template/hints.ts";
import { closeData, markerData, type Marker } from "../template/tokens.ts";

const access: Access<DomChild> = {
  tag: (n) => (isElement(n) ? n.name : undefined),
  attrs: (n) => (isElement(n) ? n.attribs : {}),
  blank: (n) => isText(n) && /^[ \t\n\r\f]*$/.test(n.data),
};

const marker = (data: string, at: DomNode): DomComment => {
  const c = adapter.createCommentNode(data);
  // the construct is reported (and the IR node located) where its element was
  c.sourceCodeLocation = at.sourceCodeLocation ?? null;
  return c;
};

const insertBefore = (parent: DomParent, node: DomChild, ref: DomChild): void => adapter.insertBefore(parent, node, ref);

// A transparent element's children take its place.
const unwrap = (parent: DomParent, el: DomChild): void => {
  for (const c of [...children(el)]) {
    adapter.detachNode(c);
    insertBefore(parent, c, el);
  }
  adapter.detachNode(el);
};

const stripChainAttrs = (el: DomChild): void => {
  if (!isElement(el)) return;
  for (const a of CHAIN_ATTRS) delete el.attribs[a];
};

// docs/templates.md: chains of data-email-if / -else-if / -else and the <tddr-*> elements become block
// markers around what they show, in place, so the cascade sees the children where they render.
// A lone data-email-if stays on its element (the template rule reads it).
export const markChains = (parent: DomParent, ctx: Ctx): void => {
  const pieces = scanChains(children(parent), access, (n, p) => ctx.diagnostics.report("E012", { ...p, loc: locOf(n) }));
  for (const piece of pieces) {
    if (piece.kind === "node") {
      markChains(piece.node as DomParent, ctx);
      continue;
    }
    if (piece.kind === "plain") {
      markChains(piece.node as DomParent, ctx);
      if (piece.tddr) unwrap(parent, piece.node);
      else stripChainAttrs(piece.node);
      continue;
    }
    if (piece.kind === "each") {
      const m: Marker = { op: "each", path: piece.path, ...(piece.as !== undefined ? { as: piece.as } : {}) };
      insertBefore(parent, marker(markerData(m), piece.node), piece.node);
      insertBefore(parent, marker(closeData("each"), piece.node), piece.node);
      // the close marker went in before the element; its children land between the two
      const close = piece.node.prev!;
      markChains(piece.node as DomParent, ctx);
      for (const c of [...children(piece.node)]) {
        adapter.detachNode(c);
        insertBefore(parent, c, close);
      }
      adapter.detachNode(piece.node);
      continue;
    }
    for (const n of piece.between) adapter.detachNode(n);
    const last = piece.members.at(-1)!.node;
    const end = marker(closeData("if"), last);
    if (last.next) insertBefore(parent, end, last.next);
    else adapter.appendChild(parent, end);
    piece.members.forEach((m, k) => {
      const mk: Marker = m.when === undefined ? { op: "else" } : { op: k === 0 ? "if" : "elseif", when: m.when };
      insertBefore(parent, marker(markerData(mk), m.node), m.node);
      markChains(m.node as DomParent, ctx);
      if (m.tddr) unwrap(parent, m.node);
      else stripChainAttrs(m.node);
    });
  }
};

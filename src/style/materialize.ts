import { withLoc, type SrcLoc } from "../loc.ts";
import { children, isComment, isElement, isText, locOf, type DomElement } from "../parse/dom.ts";
import type { CascadeOutput, PseudoElement } from "./cascade.ts";
import type { Cascaded, StyledComment, StyledText } from "./types.ts";

// The tree computeStyles walks: the DOM's elements with their cascaded values, and the
// ::before / ::after the cascade decided to show as elements of their own. New nodes only;
// the parsed document is never touched, so one parse serves every environment.
export type CascadedElement = {
  type: "element";
  tag: string; // lowercase
  attrs: Readonly<Record<string, string>>;
  cascaded: Cascaded;
  vw: ReadonlySet<string>; // props whose winning value used a viewport unit
  children: readonly CascadedNode[];
  loc?: SrcLoc;
};
export type CascadedNode = CascadedElement | StyledText | StyledComment;

export type CascadeQuery = Pick<CascadeOutput, "styleOf" | "vwOf" | "pseudoOf">;

// The text is the only child; it sits where its host starts in the source.
const pseudoElement = (p: PseudoElement, loc: SrcLoc | undefined): CascadedElement =>
  withLoc({ type: "element", tag: p.tag, attrs: {}, cascaded: p.cascaded, vw: p.vw, children: [{ type: "text", text: p.text }] }, loc);

export const materialize = (el: DomElement, q: CascadeQuery): CascadedElement => {
  const loc = locOf(el);
  const kids: CascadedNode[] = [];
  for (const n of children(el)) {
    if (isElement(n)) kids.push(materialize(n, q));
    else if (isText(n)) kids.push(withLoc({ type: "text", text: n.data }, locOf(n)));
    else if (isComment(n)) kids.push(withLoc({ type: "comment", data: n.data }, locOf(n)));
  }
  for (const p of q.pseudoOf(el)) {
    const node = pseudoElement(p, loc);
    if (p.side === "before") kids.unshift(node);
    else kids.push(node);
  }
  return withLoc({ type: "element", tag: el.name.toLowerCase(), attrs: { ...el.attribs }, cascaded: q.styleOf(el), vw: q.vwOf(el), children: kids }, loc);
};

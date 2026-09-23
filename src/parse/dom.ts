// Only parse/, sanitize/ and style/ touch the DOM; rules get StyledNode.
import type { Htmlparser2TreeAdapterMap } from "parse5-htmlparser2-tree-adapter";
import type { SrcLoc } from "../loc.ts";

export type DomNode = Htmlparser2TreeAdapterMap["node"];
export type DomParent = Htmlparser2TreeAdapterMap["parentNode"];
export type DomChild = Htmlparser2TreeAdapterMap["childNode"];
export type DomDocument = Htmlparser2TreeAdapterMap["document"];
export type DomElement = Htmlparser2TreeAdapterMap["element"];
export type DomText = Htmlparser2TreeAdapterMap["textNode"];
export type DomComment = Htmlparser2TreeAdapterMap["commentNode"];

export const isElement = (n: DomNode): n is DomElement => "attribs" in n && "name" in n;
export const isText = (n: DomNode): n is DomText => n.type === ("text" as DomNode["type"]);
export const isComment = (n: DomNode): n is DomComment => n.type === ("comment" as DomNode["type"]);

export const children = (n: DomNode): DomChild[] => ("children" in n ? (n.children as DomChild[]) : []);

export const locOf = (n: DomNode, file?: string): SrcLoc | undefined => {
  const l = n.sourceCodeLocation;
  if (!l) return undefined;
  return file === undefined ? { line: l.startLine, col: l.startCol } : { line: l.startLine, col: l.startCol, file };
};

export const findElement = (root: DomNode, pred: (el: DomElement) => boolean): DomElement | undefined => {
  for (const c of children(root)) {
    if (isElement(c) && pred(c)) return c;
    const hit = findElement(c, pred);
    if (hit) return hit;
  }
  return undefined;
};

export const findAllElements = (root: DomNode, pred: (el: DomElement) => boolean): DomElement[] => {
  const out: DomElement[] = [];
  const walk = (n: DomNode): void => {
    for (const c of children(n)) {
      if (isElement(c)) {
        if (pred(c)) out.push(c);
        walk(c);
      }
    }
  };
  walk(root);
  return out;
};

export const textContent = (n: DomNode): string =>
  isText(n) ? n.data : children(n).map(textContent).join("");

// Text direction, and flow-relative properties mapped onto the physical ones.
import type { Ctx } from "../ctx.ts";
import { findAllElements, isElement, locOf, type DomElement } from "../parse/dom.ts";
import type { ParsedDoc } from "../parse/html.ts";
import { beats, type Props, type Store } from "./precedence.ts";
import { isFlowRelative, pendingInRtl, toPhysical, type Direction } from "./shorthands.ts";

// Inherited, so it has to be worked out before computeValues does inheritance.
// An author `direction` beats the dir attribute; var() in it isn't resolved here.
export const directionFrom = (props: Props | undefined, attr: string | undefined, inherited: () => Direction): Direction => {
  const v = props?.get("direction")?.value.toLowerCase();
  const own = v === "ltr" || v === "rtl" ? v : v === "initial" ? "ltr" : v === "inherit" || v === "unset" ? undefined : attr;
  return own === "ltr" || own === "rtl" ? own : inherited();
};

export const directions = (store: Store): ((el: DomElement) => Direction) => {
  const known = new Map<DomElement, Direction>();
  const of = (el: DomElement): Direction => {
    const k = known.get(el);
    if (k) return k;
    const d = directionFrom(store.get(el), el.attribs["dir"]?.toLowerCase(), () => (el.parent && isElement(el.parent) ? of(el.parent) : "ltr"));
    known.set(el, d);
    return d;
  };
  return of;
};

// padding-inline-start lands on padding-left/right and fights it there, like in browsers
export const physical = (props: Props | undefined, dir: () => Direction): Props => {
  const winners: Props = new Map();
  for (const [prop, c] of props ?? []) {
    let name = prop;
    let cand = c;
    if (isFlowRelative(prop)) {
      const d = dir();
      name = toPhysical(prop, d);
      if (d === "rtl") cand = { ...c, value: pendingInRtl(c.value) };
    }
    const cur = winners.get(name);
    if (!cur || beats(cand, cur)) winners.set(name, cand);
  }
  return winners;
};

export const reportDirAuto = (doc: ParsedDoc, ctx: Ctx): void => {
  for (const el of findAllElements(doc.document, (e) => e.attribs["dir"]?.trim().toLowerCase() === "auto")) {
    ctx.diagnostics.report("W001", {
      message: 'dir="auto" is ignored, the text direction stays as inherited',
      hint: 'Clients can\'t pick a direction from the first letter; write dir="ltr" or dir="rtl" (or the direction property).',
      loc: locOf(el),
    });
  }
};

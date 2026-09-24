// Which declaration wins a property on an element (CSS Cascade 5 §6).
import type { SrcLoc } from "../loc.ts";
import type { DomElement } from "../parse/dom.ts";
import { compareSpecificity, type Specificity } from "./specificity.ts";

export type Candidate = {
  value: string;
  tier: number; // -1 @property initial-value, 0 UA normal, 1 author normal, 2 important
  inline: boolean; // style="" beats selectors at the same importance
  layer: number; // -1 = unlayered, else its index in the order layers were first named
  spec: Specificity;
  order: number;
  vw?: true; // the value used a viewport unit
  from?: { selector: string; loc: SrcLoc | undefined }; // where a pseudo-element's content was written
};

// property -> winner so far, in the order the properties were first offered
export type Props = Map<string, Candidate>;
export type Store = Map<DomElement, Props>;

// Important flips layer order: earlier layers win, unlayered loses.
const byLayer = (a: Candidate, b: Candidate): number => {
  if (a.layer === b.layer) return 0;
  const sign = a.tier === 2 ? -1 : 1;
  if (a.layer < 0) return sign;
  if (b.layer < 0) return -sign;
  return sign * (a.layer - b.layer);
};

export const beats = (a: Candidate, b: Candidate): boolean =>
  (a.tier - b.tier || Number(a.inline) - Number(b.inline) || byLayer(a, b) || compareSpecificity(a.spec, b.spec) || a.order - b.order) > 0;

export const offer = (props: Props, prop: string, c: Candidate): void => {
  const cur = props.get(prop);
  if (!cur || beats(c, cur)) props.set(prop, c);
};

export const offerTo = (store: Store, el: DomElement, prop: string, c: Candidate): void => {
  let props = store.get(el);
  if (!props) store.set(el, (props = new Map()));
  offer(props, prop, c);
};

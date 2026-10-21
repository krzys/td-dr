// A reader sees the total space between boxes, not which plain wrapper carries it, and the two renders
// differ in that (docs/templates.md#the-equivalence-check). Both sides are brought to one form, then compared line by line.
import { createCtx } from "../../../src/ctx.ts";
import { parse } from "../../../src/parse/html.ts";
import { children, isElement } from "../../../src/parse/dom.ts";
import type { Gaps } from "./boxes.ts";
import { dissolveWrappers } from "./dissolve.ts";
import { foldGaps } from "./fold.ts";
import { serialize } from "./serialize.ts";

export const normalize = (html: string): string => {
  const document = parse(html, createCtx()).document;
  const gaps: Gaps = new Map();
  for (const c of children(document))
    if (isElement(c)) {
      dissolveWrappers(c, gaps);
      foldGaps(c, gaps);
    }
  return serialize(document, gaps);
};

const WIDTH = 140;
const LEAD = 40;

// a long line is shown from a little before `from`, where it differs from the other side
const clip = (s: string | undefined, from = 0): string => {
  if (s === undefined) return "(nothing)";
  const t = s.trim();
  if (t.length <= WIDTH) return t;
  const start = from > LEAD + 20 ? from - LEAD : 0;
  const head = start ? `...${t.slice(start)}` : t;
  return head.length > WIDTH ? `${head.slice(0, WIDTH - 3)}...` : head;
};

const common = (a: string, b: string): number => {
  let k = 0;
  while (k < a.length && a[k] === b[k]) k++;
  return k;
};

// the first line where the two differ, with the line before it
export const firstDifference = (a: string, b: string): string | undefined => {
  if (a === b) return undefined;
  const x = a.split("\n");
  const y = b.split("\n");
  let i = 0;
  while (i < x.length && i < y.length && x[i] === y[i]) i++;
  const from = common(x[i]?.trim() ?? "", y[i]?.trim() ?? "");
  const before = i > 0 ? `\n    before:   ${clip(x[i - 1])}` : "";
  return `line ${i + 1}:${before}\n    html:     ${clip(x[i], from)}\n    template: ${clip(y[i], from)}`;
};

import { passThrough } from "../children.ts";
import { isPassThrough } from "../classify.ts";
import type { Rule } from "../rule.ts";

export const inlineRule: Rule = {
  name: "inline",
  matches: (el) => isPassThrough(el),
  analyze: (el, ctx) => passThrough(el, ctx),
};

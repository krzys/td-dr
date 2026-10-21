// Selector matching against the parsed document. The doc is only read: css-select walks it.
import { selectAll } from "css-select";
import type { Rule } from "postcss";
import type { Ctx } from "../ctx.ts";
import type { SrcLoc } from "../loc.ts";
import type { DomElement } from "../parse/dom.ts";
import type { ParsedDoc } from "../parse/html.ts";
import { hoverCombined, type EnvScope } from "./conditions.ts";
import { nestSelector, nestSpecForm } from "./nesting.ts";
import { classifySelector, dynamicPart, hoverSubject, pseudoTarget, subjectOf, type SelectorKind } from "./selectors.ts";
import { specificity, type Specificity } from "./specificity.ts";
import type { Env } from "./types.ts";

// Throws on a selector css-select can't parse.
export type Select = (selector: string) => DomElement[];

export const selectIn = (doc: ParsedDoc): Select => (selector) => selectAll(selector, doc.document as never) as unknown as DomElement[];

// For @supports selector(): would the cascade apply this selector?
export const canInline = (select: Select) => (selector: string): boolean => {
  if (classifySelector(selector, false) !== "static") return false;
  try {
    select(selector);
    return true;
  } catch {
    return false;
  }
};

// A style rule after nesting is flattened: one entry per parent x own selector.
// `match` keeps any :hover so nested rules still see a state they can't follow.
export type Sel = { match: string; specForm: string; kind: SelectorKind; spec: Specificity; hits: DomElement[]; pseudo?: "before" | "after" };

// Only worth a warning when the rule would have landed on something.
const reportDynamic = (selector: string, loc: SrcLoc | undefined, select: Select, ctx: Ctx): void => {
  let lands = true;
  try {
    lands = select(subjectOf(selector)).length > 0;
  } catch {
    // can't tell, so say it
  }
  if (!lands) return;
  ctx.diagnostics.report("W001", { ...dynamicNote(selector), loc });
};

// docs/support.md#css-values: ::before/::after are inserted and :hover on the subject is a head rule
const dynamicNote = (selector: string): { message: string; hint: string } => {
  const part = dynamicPart(selector);
  if ("element" in part) {
    const message = `Selector "${selector}" styles ${part.element}, which inline styles can't reach, and was skipped`;
    if (part.element === "::marker") return { message, hint: "List markers can't be styled in email; set the colour on the <li> (it colours the marker too), or use a custom bullet." };
    if (part.element === "::first-letter" || part.element === "::first-line") return { message, hint: `Wrap the first ${part.element === "::first-letter" ? "letter" : "line"} in a <span> and style the span.` };
    return { message, hint: "Of the pseudo-elements only ::before and ::after are inserted, as text; style the element itself." };
  }
  if (part.on)
    return {
      message: `Selector "${selector}" adds ${part.on} only on ${part.state} and was skipped`,
      hint: `${part.on} text is inserted from rules without a state (.note${part.on}); put it in that rule, or in the HTML.`,
    };
  if (part.state === ":hover")
    return {
      message: `Selector "${selector}" puts :hover on an element other than the one it styles and was skipped`,
      hint: "A :hover rule becomes a head rule only when the hover sits on the styled element (.card:hover, a.cta:hover); write the rule for that element.",
    };
  return {
    message: `Selector "${selector}" depends on ${part.state}, which email can't follow, and was skipped`,
    hint: "Of the states only :hover is carried (as a head rule); style the element itself.",
  };
};

export type RuleMatch = {
  sels: Sel[];
  hoverLands: boolean; // a :hover subject is on the page, so nested @media can't use it
  hoverSeen: boolean; // a :hover rule some env applies: the hover variant is needed
};

// The selectors of `rule` (under `parents` when nested) and what each lands on in `env`.
// `decls`: how many declarations the rule has itself; an empty rule warns about nothing.
export const matchRule = (rule: Rule, parents: readonly Sel[] | undefined, decls: number, hasContent: boolean, scope: EnvScope, env: Env, loc: SrcLoc | undefined, select: Select, ctx: Ctx): RuleMatch => {
  const sels: Sel[] = [];
  let hoverLands = false;
  let hoverSeen = false;
  const unusable = (match: string, err: unknown): void => ctx.diagnostics.report("W002", { message: `Selector "${match}" could not be used: ${(err as Error).message}`, loc });
  const tryAdd = (match: string, make: () => Sel): void => {
    try {
      sels.push(make());
    } catch (err) {
      unusable(match, err);
    }
  };
  for (const raw of rule.selectors) {
    const specForm = parents ? nestSpecForm(parents.map((p) => p.specForm), raw) : raw;
    const forms = parents ? parents.map((p) => ({ match: nestSelector(p.match, raw), specForm })) : [{ match: raw, specForm }];
    for (const { match, specForm } of forms) {
      const target = pseudoTarget(match);
      if (target) {
        tryAdd(match, () => ({ match, specForm, kind: "static", spec: specificity(specForm), hits: select(target.base), pseudo: target.which }));
        continue;
      }
      const kind = classifySelector(match, hasContent);
      if (kind === "noise") continue;
      const spec = specificity(specForm);
      const hovered = kind === "dynamic" ? hoverSubject(match) : undefined;
      if (hovered !== undefined) {
        const combined = hoverCombined(scope);
        let hits: DomElement[] = [];
        try {
          hits = select(hovered);
        } catch (err) {
          unusable(match, err);
          continue;
        }
        if (hits.length > 0) hoverLands = true;
        if (decls > 0 && !combined && scope.possible) hoverSeen = true;
        if (decls > 0 && combined && hits.length > 0) {
          ctx.diagnostics.report("W001", {
            message: `Selector "${match}" is inside a ${scope.width ? "width" : "prefers-color-scheme"} @media and was skipped`,
            hint: "Hover styles can't be combined with a width or dark mode query; move the :hover rule out of the @media.",
            loc,
          });
        }
        sels.push({ match, specForm, kind: "static", spec, hits: env.hover && !combined ? hits : [] });
        continue;
      }
      if (kind === "dynamic") {
        if (decls > 0) reportDynamic(match, loc, select, ctx);
        sels.push({ match, specForm, kind, spec, hits: [] });
        continue;
      }
      tryAdd(match, () => ({ match, specForm, kind, spec, hits: select(match) }));
    }
  }
  return { sels, hoverLands, hoverSeen };
};

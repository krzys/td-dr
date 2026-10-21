import { withLoc } from "../../ir/index.ts";
import { looksLikeButton } from "../classify.ts";
import { HINT_VALUES } from "../lint.ts";
import type { StyledElement, StyledNode } from "../../style/types.ts";
import type { Rule } from "../rule.ts";
import { serializeStyled } from "../serialize-styled.ts";

// preheader is taken out in sanitize; button is the button rule's when it is a link
const OTHER_RULES = new Set(["preheader"]);

// The hint is an instruction to us, not markup for the client.
const withoutHint = (el: StyledElement): StyledElement => {
  const { "data-email": _hint, ...attrs } = el.attrs;
  return { ...el, attrs };
};

// raw output is never analyzed, so hints inside it would leak into the client markup
const withoutHints = (n: StyledNode): StyledNode =>
  n.type === "element" ? { ...withoutHint(n), children: n.children.map(withoutHints) } : n;

export const hintRule: Rule = {
  name: "hint",
  matches: (el) => {
    const v = el.attrs["data-email"];
    return v !== undefined && !OTHER_RULES.has(v) && !(v === "button" && looksLikeButton(el));
  },
  analyze: (el, ctx, recurse) => {
    const value = el.attrs["data-email"];
    if (value === "raw") {
      return withLoc({ kind: "raw", html: serializeStyled([withoutHints(el)], undefined, { rootKept: true }) }, el.loc);
    }
    const plain = withoutHint(el);
    if (value === "button") {
      ctx.diagnostics.report("W001", {
        message: `data-email="button" ignored on ${el.tag === "a" ? "<a> without an href" : `<${el.tag}>`}`,
        hint: 'data-email="button" only works on an <a> with an href; the element is lowered as it would be without it.',
        loc: el.loc,
      });
      return recurse(plain);
    }
    if (value !== "outlook-only") {
      ctx.diagnostics.report("E011", {
        message: `Unknown data-email value "${value}"`,
        hint: `Valid values: ${HINT_VALUES.join(", ")}.`,
        loc: el.loc,
      });
      return recurse(plain);
    }
    return withLoc({ kind: "conditional", target: "mso", child: recurse(plain) }, el.loc);
  },
};

import { ATTR, TAG } from "../post/dead-classes.ts";
import { MSO_TAGS } from "./fonts.ts";

const RULE = "mso-line-height-rule:exactly";

// What an element's own style says of the rule: nothing, our exact one, or something else (an author's).
const ruleOf = (style: string): "none" | "exact" | "other" => {
  const said = style.split(";").filter((d) => /^\s*mso-line-height-rule\s*:/i.test(d));
  if (said.length === 0) return "none";
  return said.every((d) => d === RULE) ? "exact" : "other";
};

const styleOf = (tag: string): string | undefined => {
  for (const m of tag.matchAll(ATTR)) if (m[2]!.toLowerCase() === "style") return m[4] ?? m[5] ?? m[6] ?? "";
  return undefined;
};

const withoutRule = (tag: string): string =>
  tag.replace(ATTR, (whole, space: string, name: string, _eq?: string, dq?: string) => {
    if (name.toLowerCase() !== "style" || dq === undefined) return whole;
    const rest = dq.split(";").filter((d) => d !== RULE).join(";");
    return rest === "" ? "" : `${space}style="${rest}"`;
  });

// Word reads a head <style>, so where every element of a tag (Outlook-only or not) has exactly
// mso-line-height-rule:exactly inline, one type-selector rule in an Outlook-only block says it
// instead: it reaches the same elements. A tag with one element without it, or with an author's other
// value, keeps it inline; so does any tag the font override doesn't name. Only where that is smaller.
export const hoistLineRule = (body: string): { body: string; head: string | undefined } => {
  const count = new Map<string, { exact: number; not: number }>();
  for (const [tag] of body.matchAll(TAG)) {
    const name = /^<([^\s>/]+)/.exec(tag)![1]!.toLowerCase();
    const c = count.get(name) ?? { exact: 0, not: 0 };
    if (ruleOf(styleOf(tag) ?? "") === "exact") c.exact++;
    else c.not++;
    count.set(name, c);
  }
  const tags = MSO_TAGS.filter((t) => {
    const c = count.get(t);
    return c !== undefined && c.not === 0 && c.exact * (RULE.length + 1) > t.length + 1;
  });
  if (tags.length === 0) return { body, head: undefined };
  const head = `<!--[if mso]>\n<style>${tags.join(",")}{${RULE};}</style>\n<![endif]-->`;
  const saved = tags.reduce((n, t) => n + count.get(t)!.exact * (RULE.length + 1), 0);
  if (saved <= head.length + 1) return { body, head: undefined };
  const hoisted = new Set(tags);
  const out = body.replace(TAG, (tag) => (hoisted.has(/^<([^\s>/]+)/.exec(tag)![1]!.toLowerCase()) ? withoutRule(tag) : tag));
  return { body: out, head };
};

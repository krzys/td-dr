import { FIELD_OPEN } from "../template/tokens.ts";

// After inlining, an input class only matters if a <style> block in the output selects it.
export const TAG = /<[a-zA-Z][^\s>/]*(?:"[^"]*"|'[^']*'|[^>"'])*>/g;
// one attribute at a time, so class= inside another attribute's value is never touched
export const ATTR = /(\s+)([^\s"'>/=]+)(?:(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

// CSS escapes: up to six hex digits plus one optional space, or any other single character.
const ESC = String.raw`\\(?:[0-9a-fA-F]{1,6}[ \t\n\r\f]?|[^\n])`;
const IDENT = String.raw`(?:--|-?(?:[_a-zA-Z]|[^\x00-\x7f]|${ESC}))(?:[\w-]|[^\x00-\x7f]|${ESC})*`;

const unescape = (name: string): string =>
  name.replace(/\\(?:([0-9a-fA-F]{1,6})[ \t\n\r\f]?|([^\n]))/g, (_m, hex?: string, ch?: string) => {
    if (ch !== undefined) return ch;
    const cp = Number.parseInt(hex!, 16);
    return cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff) ? "\ufffd" : String.fromCodePoint(cp);
  });

type Used = { names: Set<string>; partial: Array<(c: string) => boolean> };

const PARTIAL: Readonly<Record<string, (v: string) => (c: string) => boolean>> = {
  "*": (v) => (c) => c.includes(v),
  "^": (v) => (c) => c.startsWith(v),
  "$": (v) => (c) => c.endsWith(v),
  "|": (v) => (c) => c === v || c.startsWith(`${v}-`),
};

const EXACT = (v: string) => (c: string) => c === v;

const folded = (make: (v: string) => (c: string) => boolean, v: string): ((c: string) => boolean) => {
  const f = make(v.toLowerCase());
  return (c) => f(c.toLowerCase());
};

const referenced = (html: string): Used => {
  const used: Used = { names: new Set(), partial: [] };
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    const css = m[1]!;
    for (const c of css.matchAll(new RegExp(`\\.(${IDENT})`, "g"))) used.names.add(unescape(c[1]!));
    // [class="a b"] and [class~=a] name classes; *= ^= $= |= match parts of any class in the list.
    // A trailing i makes the match case-insensitive; s is the default.
    for (const c of css.matchAll(/\[\s*class\s*([~|^$*]?)=\s*(?:"([^"]*)"|'([^']*)'|([^\s\]"']+))\s*([isIS])?\s*\]/g)) {
      const value = unescape(c[2] ?? c[3] ?? c[4] ?? "");
      const fold = c[5]?.toLowerCase() === "i";
      const make = PARTIAL[c[1]!];
      if (make) used.partial.push(fold ? folded(make, value) : make(value));
      else for (const n of value.split(/\s+/).filter(Boolean)) if (fold) used.partial.push(folded(EXACT, n)); else used.names.add(n);
    }
  }
  return used;
};

export const dropDeadClasses = (html: string): string => {
  const used = referenced(html);
  return html.replace(TAG, (tag) =>
    tag.replace(ATTR, (whole, space: string, name: string, _eq?: string, dq?: string, sq?: string, bare?: string) => {
      if (name.toLowerCase() !== "class") return whole;
      // a class the ESP fills in can't be judged here; a class said twice is said once, where it first was
      const keep = [...new Set((dq ?? sq ?? bare ?? "").split(/\s+/))].filter((c) => c && (c.includes(FIELD_OPEN) || used.names.has(c) || used.partial.some((f) => f(c))));
      return keep.length ? `${space}class="${keep.join(" ")}"` : "";
    }),
  );
};

// [ids, classes/attrs/pseudo-classes, types/pseudo-elements]
export type Specificity = readonly [number, number, number];

export const compareSpecificity = (a: Specificity, b: Specificity): number =>
  a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

const IDENT = /(?:[\w-]|[^\x00-\x7f]|\\.)+/y;
const LEGACY_ELEMENTS = new Set(["before", "after", "first-line", "first-letter"]);
const TAKES_MAX = new Set(["is", "matches", "-webkit-any", "-moz-any", "not", "has"]);

// Index just past the bracket that closes the one at `open`; quotes can hide brackets.
const closeOf = (s: string, open: number): number => {
  let depth = 0;
  let quote = "";
  for (let i = open; i < s.length; i++) {
    const ch = s[i]!;
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "\\") i++;
    else if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return s.length;
};

const splitTop = (s: string): string[] => {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === "(" || ch === "[") i = closeOf(s, i) - 1;
    else if (ch === "\\") i++;
    else if (ch === ",") {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out;
};

const ident = (s: string, at: number): string => {
  IDENT.lastIndex = at;
  return IDENT.exec(s)?.[0] ?? "";
};

const maxOf = (list: string): Specificity =>
  splitTop(list)
    .map(compound)
    .reduce<Specificity>((m, s) => (compareSpecificity(s, m) > 0 ? s : m), [0, 0, 0]);

function compound(sel: string): Specificity {
  let a = 0;
  let b = 0;
  let c = 0;
  const add = (s: Specificity): void => {
    a += s[0];
    b += s[1];
    c += s[2];
  };

  for (let i = 0; i < sel.length; ) {
    const ch = sel[i]!;
    if (ch === "#" || ch === ".") {
      const name = ident(sel, i + 1);
      if (ch === "#") a++;
      else b++;
      i += 1 + name.length;
    } else if (ch === "[") {
      b++;
      i = closeOf(sel, i);
    } else if (ch === ":") {
      const isElement = sel[i + 1] === ":";
      const name = ident(sel, i + (isElement ? 2 : 1));
      i += (isElement ? 2 : 1) + name.length;
      let args: string | undefined;
      if (sel[i] === "(") {
        const end = closeOf(sel, i);
        args = sel.slice(i + 1, end - 1);
        i = end;
      }
      const lower = name.toLowerCase();
      if (isElement || LEGACY_ELEMENTS.has(lower)) c++;
      else if (lower === "where") continue;
      else if (TAKES_MAX.has(lower) && args !== undefined) add(maxOf(args));
      else if ((lower === "nth-child" || lower === "nth-last-child") && args !== undefined) {
        b++;
        const of = /\sof\s([\s\S]*)$/i.exec(args);
        if (of) add(maxOf(of[1]!));
      } else b++;
    } else if (/[\w\\]|[^\x00-\x7f]/.test(ch)) {
      const name = ident(sel, i);
      c++;
      i += Math.max(name.length, 1);
    } else i++; // combinators, *, |, whitespace
  }
  return [a, b, c];
}

// A comma list gives its most specific member.
export const specificity = (selector: string): Specificity => maxOf(selector);

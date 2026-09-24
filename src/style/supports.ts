// @supports, decided for the email rather than for the author's browser.
//
//   (prop: value)                    answer
//   oklch() lab() lch() color-mix()  true   td;dr lowers them to hex
//   display flex/grid/…, gap         true   td;dr lowers them to tables
//   -webkit-/-moz-/… prop or value   false  browser sniffing; the email isn't read there
//   anything else                    undecided
//   selector(x)                      true if x is a plain selector inlining can use
//   font-tech() font-format()        undecided
//   other functions and (…)          false, as in browsers (general-enclosed)
//
// undefined = undecided, null = doesn't parse.

type Tri = boolean | undefined;

const VENDOR = /^-(?:webkit|moz|ms|o)-/i;
const VENDOR_VALUE = /(?:^|[\s,(])-[a-z]+-/i;
const LOWERED_COLOR = /(?<![\w-])(?:color-mix|oklch|oklab|lch|lab)\(/i;
const RELIED: Readonly<Record<string, RegExp>> = {
  display: /^(?:block|inline|inline-block|flex|inline-flex|grid|inline-grid|none)$/i,
  gap: /\S/,
  "row-gap": /\S/,
  "column-gap": /\S/,
};
const UNDECIDED_FNS = new Set(["font-tech", "font-format"]);

type Token = { kind: "paren"; inner: string } | { kind: "fn"; name: string; inner: string } | { kind: "word"; word: string };

const closeParen = (s: string, open: number): number => {
  let depth = 0;
  let quote = "";
  for (let i = open; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === "\\") i++;
    else if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")" && --depth === 0) return i;
  }
  return -1;
};

const tokenize = (s: string): Token[] | null => {
  const out: Token[] = [];
  const ident = /[a-z-][\w-]*/iy;
  for (let i = 0; i < s.length; ) {
    if (/\s/.test(s[i]!)) {
      i++;
      continue;
    }
    if (s[i] === "(") {
      const end = closeParen(s, i);
      if (end < 0) return null;
      out.push({ kind: "paren", inner: s.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    ident.lastIndex = i;
    const word = ident.exec(s)?.[0];
    if (!word) return null;
    i += word.length;
    if (s[i] === "(") {
      const end = closeParen(s, i);
      if (end < 0) return null;
      out.push({ kind: "fn", name: word.toLowerCase(), inner: s.slice(i + 1, end) });
      i = end + 1;
    } else out.push({ kind: "word", word: word.toLowerCase() });
  }
  return out;
};

const declaration = (prop: string, value: string): Tri => {
  if (VENDOR.test(prop) || VENDOR_VALUE.test(value)) return false;
  if (LOWERED_COLOR.test(value)) return true;
  return RELIED[prop.toLowerCase()]?.test(value) ? true : undefined;
};

const all = (xs: Tri[]): Tri => (xs.includes(false) ? false : xs.every((x) => x === true) ? true : undefined);
const any = (xs: Tri[]): Tri => (xs.includes(true) ? true : xs.every((x) => x === false) ? false : undefined);

export const evalSupports = (cond: string, canInline: (selector: string) => boolean): Tri | null => {
  const inParens = (t: Token): Tri | null => {
    if (t.kind === "word") return null;
    if (t.kind === "fn") {
      if (t.name === "selector") return canInline(t.inner.trim());
      return UNDECIDED_FNS.has(t.name) ? undefined : false;
    }
    const inner = tokenize(t.inner);
    const first = inner?.[0];
    if (first && (first.kind !== "word" || first.word === "not")) return condition(inner!) ?? false;
    const decl = /^\s*(-{0,2}[a-z][\w-]*)\s*:\s*([\s\S]*\S)\s*$/i.exec(t.inner);
    return decl ? declaration(decl[1]!, decl[2]!) : false;
  };

  const condition = (tokens: Token[]): Tri | null => {
    const [head, ...rest] = tokens;
    if (!head) return null;
    if (head.kind === "word") {
      if (head.word !== "not" || rest.length !== 1) return null;
      const v = inParens(rest[0]!);
      return v === null ? null : v === undefined ? undefined : !v;
    }
    const values: Tri[] = [];
    let op: string | undefined;
    for (let i = 0; i < tokens.length; i += 2) {
      const v = inParens(tokens[i]!);
      if (v === null) return null;
      values.push(v);
      const next = tokens[i + 1];
      if (!next) break;
      if (next.kind !== "word" || (next.word !== "and" && next.word !== "or") || (op && op !== next.word) || !tokens[i + 2]) return null;
      op = next.word;
    }
    return op === "or" ? any(values) : all(values);
  };

  const tokens = tokenize(cond);
  return tokens ? condition(tokens) : null;
};

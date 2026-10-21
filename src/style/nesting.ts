// CSS nesting, flattened one parent selector at a time.

// Where & stands, skipping strings and escapes.
const amps = (s: string): number[] => {
  const out: number[] = [];
  let quote = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === "\\") i++;
    else if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "&") out.push(i);
  }
  return out;
};

const hasCombinator = (s: string): boolean => {
  let depth = 0;
  let quote = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === "\\") i++;
    else if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (depth === 0 && /[\s>+~]/.test(ch)) return true;
  }
  return false;
};

// No & means the selector is relative to the parent: `.b` is `& .b`, `> .b` is `& > .b`.
const relative = (child: string): string => {
  const c = child.trim();
  return amps(c).length > 0 ? c : `& ${c}`;
};

const replaceAmps = (child: string, by: (at: number, c: string) => string): string => {
  const c = relative(child);
  let out = "";
  let pos = 0;
  for (const at of amps(c)) {
    out += c.slice(pos, at) + by(at, c);
    pos = at + 1;
  }
  return out + c.slice(pos);
};

// Pasting the parent in as text is exact when & leads the selector, or when the
// parent is one compound that can sit where & is; otherwise :is() keeps its meaning.
export const nestSelector = (parent: string, child: string): string => {
  const p = parent.trim();
  const compound = !hasCombinator(p);
  const startsWithType = /^(?:[\w*|-]|\\|[^\x00-\x7f])/.test(p);
  return replaceAmps(child, (at, c) => {
    const compoundStart = at === 0 || /[\s>+~(,]/.test(c[at - 1]!);
    return at === 0 || (compound && (compoundStart || !startsWithType)) ? p : `:is(${p})`;
  });
};

// For specificity, & is :is(parent list), which counts as the most specific
// member of the whole list even when another member is the one that matched.
export const nestSpecForm = (parents: readonly string[], child: string): string =>
  replaceAmps(child, () => `:is(${parents.join(", ")})`);

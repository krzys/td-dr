// Text edits on a module's code, with a source map back to it. Edits never overlap; at one
// position the closes of nodes ending there come first (innermost first), then the opens of
// nodes starting there (outermost first), then a replaced token.
export type Edit = { start: number; end: number; text: string; group: 0 | 1 | 2; depth: number };

export type SourceMap = { version: 3; sources: string[]; sourcesContent: string[]; names: string[]; mappings: string };

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const vlq = (n: number): string => {
  let v = n < 0 ? (-n << 1) | 1 : n << 1;
  let out = "";
  do {
    let digit = v & 31;
    v >>>= 5;
    if (v > 0) digit |= 32;
    out += B64[digit];
  } while (v > 0);
  return out;
};

const order = (a: Edit, b: Edit): number => a.start - b.start || a.group - b.group || (a.group === 0 ? b.depth - a.depth : a.depth - b.depth);

const lineStarts = (s: string): number[] => {
  const starts = [0];
  for (let i = s.indexOf("\n"); i >= 0; i = s.indexOf("\n", i + 1)) starts.push(i + 1);
  return starts;
};

export const applyEdits = (code: string, edits: Edit[], source: string): { code: string; map: SourceMap } => {
  const sorted = edits.toSorted(order);
  const origLines = lineStarts(code);
  const origPos = (i: number): [number, number] => {
    let lo = 0;
    let hi = origLines.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (origLines[mid]! <= i) lo = mid;
      else hi = mid - 1;
    }
    return [lo, i - origLines[lo]!];
  };

  const out: string[] = [];
  const lines: string[][] = [[]];
  let genLine = 0;
  let genCol = 0;
  let prevGenCol = 0;
  let prevLine = 0;
  let prevCol = 0;
  const mark = (orig: number) => {
    const [line, col] = origPos(orig);
    lines[genLine]!.push(vlq(genCol - prevGenCol) + "A" + vlq(line - prevLine) + vlq(col - prevCol));
    prevGenCol = genCol;
    prevLine = line;
    prevCol = col;
  };
  const emit = (text: string, from?: number) => {
    // original text gets a segment at every token, inserted text one at its start
    const tokens = from === undefined ? [] : [...text.matchAll(/[\w$]+|\S/g)].map((m) => m.index);
    let t = 0;
    let last = 0;
    if (from === undefined && text) mark(insertAt);
    for (let i = 0; i <= text.length; i++) {
      if (from !== undefined && tokens[t] === i) {
        genCol += i - last;
        last = i;
        mark(from + i);
        t++;
      }
      if (text[i] === "\n") {
        genLine++;
        genCol = 0;
        prevGenCol = 0;
        lines.push([]);
        last = i + 1;
      }
    }
    genCol += text.length - last;
    out.push(text);
  };

  let insertAt = 0;
  let cursor = 0;
  for (const e of sorted) {
    if (e.start < cursor) throw new Error(`tddr: overlapping edits at ${e.start}`);
    emit(code.slice(cursor, e.start), cursor);
    insertAt = e.start;
    emit(e.text);
    cursor = e.end;
  }
  emit(code.slice(cursor), cursor);
  return {
    code: out.join(""),
    map: { version: 3, sources: [source], sourcesContent: [code], names: [], mappings: lines.map((l) => l.join(",")).join(";") },
  };
};

// where `op` sits between two operands: past spaces, comments and their parentheses
export const findToken = (code: string, from: number, to: number, op: string): number => {
  for (let i = from; i < to; i++) {
    if (code.startsWith("/*", i)) i = code.indexOf("*/", i + 2) + 1;
    else if (code.startsWith("//", i)) i = code.indexOf("\n", i);
    else if (code.startsWith(op, i)) return i;
  }
  throw new Error(`tddr: no "${op}" between ${from} and ${to}`);
};

const skipSpace = (code: string, i: number): number => {
  for (;;) {
    if (/\s/.test(code[i] ?? "")) i++;
    else if (code.startsWith("/*", i)) i = code.indexOf("*/", i + 2) + 2;
    else if (code.startsWith("//", i)) i = code.indexOf("\n", i);
    else return i;
  }
};

// a pattern as one line: `//` comments and line breaks go, string contents stay as written
export const onOneLine = (src: string): string => {
  let out = "";
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === "\\" ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j;
    } else if (src.startsWith("//", i)) i = src.indexOf("\n", i) < 0 ? src.length : src.indexOf("\n", i) - 1;
    else out += c === "\n" ? " " : c;
  }
  return out;
};

type Spanned = { type: string; start: number; end: number };

// The edits of one module as they are planned: text opened before a node, closed after it, or put
// in place of a range. `depth` orders edits at one position (see the top of this file).
export const editor = (code: string) => {
  const edits: Edit[] = [];
  const replace = (start: number, end: number, text: string, depth: number): void => void edits.push({ start, end, text, group: 2, depth });
  return {
    code,
    edits,
    open: (pos: number, text: string, depth: number): void => void edits.push({ start: pos, end: pos, text, group: 1, depth }),
    close: (pos: number, text: string, depth: number): void => void edits.push({ start: pos, end: pos, text, group: 0, depth }),
    replace,
    // line breaks inside the range stay (ahead of the text), so later lines keep their number
    replaceLines: (start: number, end: number, text: string, depth: number): void => replace(start, end, "\n".repeat(code.slice(start, end).split("\n").length - 1) + text, depth),
    // the operator `op` between two operands, replaced
    token: (from: number, to: number, op: string, text: string, depth: number): void => {
      const at = findToken(code, from, to, op);
      replace(at, at + op.length, text, depth);
    },
    // `() => {…}` would be a block; parentheses only then, since oxc misreads `(/<!--…/`
    paren: (after: number): string => (code[skipSpace(code, after)] === "{" ? "(" : ""),
    // a sequence (or an object) needs its own parentheses as an argument or an arrow's body
    own: (n: Spanned): boolean => n.type === "SequenceExpression" || code[skipSpace(code, n.start)] === "{",
  };
};
export type Editor = ReturnType<typeof editor>;

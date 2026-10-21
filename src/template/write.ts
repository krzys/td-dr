import { dialects, type Dialect, type DialectName } from "./dialects.ts";
import type { Cond } from "../ir/types.ts";
import { isProblem, mapPaths, parseCond } from "./cond.ts";
import { FIELD_CLOSE, FIELD_OPEN, isPath, MARKER_DATA, pathProblem } from "./tokens.ts";

const TOKEN = new RegExp(`${FIELD_OPEN}([^${FIELD_CLOSE}]*)${FIELD_CLOSE}|<!--((?:/?)tddr:(?:each|if|elseif|else)(?: [^>]*?)?)-->`, "g");
const MARKER = /<!--\/?tddr:(each|if|elseif|else)[ >-]/;
// block syntax of one dialect or the other, typed by the author: it would only work in one
const HAND_WRITTEN = /\{\{~?\s*(?:[#/^>]|else\b)[^}]*\}?\}?|\{%[^%]*%?\}?/;

// `token` is the placeholder as it appears in the source, so the caller can find its location.
export type TemplateProblem = { code: "E012" | "W006"; message: string; hint?: string; token?: string };
export type Report = (p: TemplateProblem) => void;

const HAND_WRITTEN_HINT =
  "td;dr writes the ESP's syntax for the dialect you compile to, and this only works in one. Use data-email-if / -else-if / -else and data-email-each on elements (or <tddr-if test> and friends), and fields for values.";

const fail: Report = (p) => {
  throw new Error(`template: ${p.message}`);
};

// What sits inside a block: text already written in the dialect, and inner blocks.
type Part = string | Block;
type Block = { op: "each"; path: string; as: string; body: Part[] } | { op: "if"; branches: { when: Cond; body: Part[] }[]; otherwise?: Part[] };

// Writes placeholders and block markers in a dialect, and the text between them so the ESP
// reads it as text. `scopes` are the loop variables in effect; a path that starts at one of
// them is read off it, any other is read from the root. Blocks are collected first: an if chain
// may need its bodies more than once (see the dialects).
const write = (src: string, d: Dialect, report: Report, html: boolean): string => {
  const root: Part[] = [];
  const stack: { block: Block; body: Part[] }[] = [];
  const scopes: string[] = [];
  let flags = 0;
  // a hyphen can't be in a data path, so a flag never hides a field the template reads
  const fresh = (): string => `tddr-${++flags}`;
  const pathOf = (p: string): string => d.path(p, scopes.length > 0 && !scopes.includes(p.split(".")[0]!));
  const into = (): Part[] => stack.at(-1)?.body ?? root;
  const brace = (c: "{" | "}"): string => {
    const b = d.brace(c, html);
    if (b === undefined) throw new Error(`template: a "${c}" right next to a field can't be written in this dialect; put a space between them`);
    return b;
  };
  const literal = (seg: string, before: boolean, after: boolean): string => {
    let head = "";
    let tail = "";
    if (after && seg.startsWith("}")) [head, seg] = [brace("}"), seg.slice(1)];
    if (before && seg.endsWith("{")) [tail, seg] = [brace("{"), seg.slice(0, -1)];
    // one report per line is enough to find it
    for (const line of seg.split("\n")) {
      const m = HAND_WRITTEN.exec(line);
      if (m) report({ code: "E012", message: `"${m[0]}" is template syntax written by hand`, hint: HAND_WRITTEN_HINT, token: m[0] });
    }
    return head + d.text(seg, before) + tail;
  };
  const bug = (message: string): void => report({ code: "W006", message: `template: ${message}` });
  const close = (): void => {
    const top = stack.pop()!;
    if (top.block.op === "each") scopes.pop();
    into().push(top.block);
  };
  const marker = (data: string): void => {
    const [, closing, op, arg = ""] = MARKER_DATA.exec(data) ?? [];
    const top = stack.at(-1);
    if (closing) {
      if (!top) return bug(`a closing ${op} marker without an opening one; it is left out`);
      return close();
    }
    if (op === "each") {
      const [path = "", as = "item"] = arg.split(" ");
      const block: Block = { op: "each", path: pathOf(path), as, body: [] };
      scopes.push(as);
      return void stack.push({ block, body: block.body });
    }
    if (op === "else") {
      if (top?.block.op !== "if" || top.block.otherwise) return bug("an else marker outside an if chain; it is left out");
      top.block.otherwise = [];
      return void (top.body = top.block.otherwise);
    }
    const parsed = parseCond(arg, `marker "${data}"`);
    if (isProblem(parsed)) return bug(`${parsed.message}; the block is left out`);
    // both sides of a comparison are read where the block opens
    const branch = { when: mapPaths(parsed, pathOf), body: [] as Part[] };
    if (op === "if") return void stack.push({ block: { op: "if", branches: [branch] }, body: branch.body });
    if (top?.block.op !== "if" || top.block.otherwise) return bug("an elseif marker outside an if chain; it is left out");
    top.block.branches.push(branch);
    top.body = branch.body;
  };
  const field = (all: string, path: string): string => {
    if (isPath(path)) return d.field(pathOf(path));
    const why = pathProblem(path);
    report({ code: "E012", message: `field "${path}" is not a data path${why ? `: ${why}` : ""}`, hint: "A field is a dotted name such as order.total that isn't a template keyword, helper or built-in object member; it is left out.", token: all });
    return "";
  };
  let last = 0;
  for (const m of src.matchAll(TOKEN)) {
    into().push(literal(src.slice(last, m.index), true, last > 0));
    if (m[1] !== undefined) into().push(field(m[0], m[1]));
    else marker(m[2]!);
    last = m.index + m[0].length;
  }
  into().push(literal(src.slice(last), false, last > 0));
  while (stack.length) {
    bug(`an ${stack.at(-1)!.block.op} marker without a closing one; closed at the end`);
    close();
  }
  const render = (parts: readonly Part[]): string =>
    parts
      .map((p) => {
        if (typeof p === "string") return p;
        if (p.op === "each") {
          const [open, end] = d.each(p.path, p.as);
          return open + render(p.body) + end;
        }
        const branches = p.branches.map((b) => ({ when: b.when, body: render(b.body) }));
        return d.choose(branches, p.otherwise && render(p.otherwise), fresh);
      })
      .join("");
  return render(root);
};

export const writeTemplate = (html: string, dialect: DialectName, report: Report = fail): string => write(html, dialects[dialect], report, true);

// A subject line or any other string with placeholders in it. Strings take no blocks.
export const writeString = (text: string, dialect: DialectName): string => {
  if (MARKER.test(text)) throw new Error("writeString: a string takes fields, not blocks");
  return write(text, dialects[dialect], fail, false);
};

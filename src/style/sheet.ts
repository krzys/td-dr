// Stylesheet text -> postcss tree, recovering from errors the way browsers do.
import postcss, { CssSyntaxError, type ChildNode, type Root } from "postcss";
import type { Ctx } from "../ctx.ts";
import type { SrcLoc } from "../loc.ts";

// `origin` is where the css starts in the input; line and column are postcss's, 1-based.
export const mapLoc = (origin: SrcLoc, line: number | undefined, col: number | undefined): SrcLoc | undefined => {
  if (line === undefined) return undefined;
  const c = col ?? 1;
  return { line: origin.line + line - 1, col: line === 1 ? origin.col + c - 1 : c };
};

export const locAt = (origin: SrcLoc | undefined, node: ChildNode): SrcLoc | undefined => {
  const start = node.source?.start;
  return origin && start ? mapLoc(origin, start.line, start.column) : undefined;
};

const syntaxError = (err: unknown, at: SrcLoc | undefined, ctx: Ctx): void => {
  if (err instanceof CssSyntaxError) {
    const loc = at && err.line !== undefined ? mapLoc(at, err.line, err.column) : at;
    ctx.diagnostics.report("W002", { message: `CSS syntax error: ${err.reason}. The broken part was ignored`, loc });
  } else {
    ctx.diagnostics.report("W002", { message: `CSS could not be parsed: ${String(err)}`, loc: at });
  }
};

const offsetOf = (text: string, line: number, col: number): number => {
  let off = 0;
  for (let i = 1; i < line; i++) off += text.indexOf("\n", off) + 1 - off;
  return off + col - 1;
};

// Last resort: keep the longest prefix that ends at a "}" and still parses.
const goodPrefix = (text: string): Root | undefined => {
  for (let i = text.lastIndexOf("}"); i >= 0; i = text.lastIndexOf("}", i - 1)) {
    try {
      return postcss.parse(text.slice(0, i + 1));
    } catch {
      // keep stepping back
    }
  }
  return undefined;
};

// Parse, and when postcss gives up, patch the text the way a browser would and try again.
// Positions stay put because fixes blank out instead of delete. One W002 per sheet.
export const parseSheet = (css: string, origin: SrcLoc | undefined, ctx: Ctx): Root | undefined => {
  let text = css;
  let lastCut = Infinity;
  let reported = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      return postcss.parse(text);
    } catch (err) {
      if (!reported) {
        syntaxError(err, origin, ctx);
        reported = true;
      }
      if (!(err instanceof CssSyntaxError) || err.line === undefined) return goodPrefix(text);
      const off = offsetOf(text, err.line, err.column ?? 1);
      const prevEnd = Math.max(text.lastIndexOf(";", off - 1), text.lastIndexOf("{", off - 1));
      const insideRule = prevEnd >= 0 && text.lastIndexOf("}", off - 1) < prevEnd;
      if (err.reason === "Unexpected }") {
        text = `${text.slice(0, off)} ${text.slice(off + 1)}`;
      } else if (err.reason.startsWith("Unknown word") && insideRule) {
        const rest = text.slice(off).search(/[;}]/);
        const end = rest < 0 ? text.length : off + rest;
        text = text.slice(0, prevEnd + 1) + text.slice(prevEnd + 1, end).replace(/[^\n]/g, " ") + text.slice(end);
      } else {
        if (off >= lastCut) return goodPrefix(text);
        lastCut = off;
        text = text.slice(0, off);
      }
    }
  }
  return goodPrefix(text);
};

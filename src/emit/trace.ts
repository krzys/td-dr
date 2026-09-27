// Trace markers (compile option `trace`): the tags written for an author element carry its source
// position, which post/trace.ts reads into the trace and strips.
import type { SrcLoc } from "../loc.ts";
import type { StyledElement } from "../style/types.ts";
import type { Attrs } from "./attrs.ts";

// compile(…, { trace: true }) puts this attribute on the tags it emits for an author element; the
// last step reads it into the trace and strips it, so it never reaches the output. The name has a
// private-use character so an author attribute can not collide with it.
export const TRACE_ATTR = "tddr\u{F8F0}src";

export const traceValue = (loc: SrcLoc | undefined): string | undefined => (loc ? `${loc.line}:${loc.col}` : undefined);

// Passthrough html is written from the styled tree, which keeps non-data attributes: the marker rides along.
// Returns a marked copy and where its elements are: a text run or a comment also has a loc, and is not an element.
export const markTree = (el: StyledElement, found = new Set<string>()): { tree: StyledElement; found: Set<string> } => {
  const v = traceValue(el.loc);
  if (v) found.add(v);
  const children = el.children.map((c) => (c.type === "element" ? markTree(c, found).tree : c));
  return { tree: { ...el, ...(v && { attrs: { ...el.attrs, [TRACE_ATTR]: v } }), children }, found };
};

// All that writing a tag needs to know: which author element it belongs to (undefined: none).
export type TraceScope = { readonly at: string | undefined };

// For markup written outside emit(), or with trace off.
export const UNTRACED: TraceScope = { at: undefined };

// The scope of an author element's tags. With trace off nothing is marked, so the scope stays as it is;
// with it on, a node without a loc writes unmarked tags (its tags aren't any author element's).
export const scoped = <S extends TraceScope>(s: S, loc: SrcLoc | undefined, trace: boolean | undefined): S =>
  trace ? { ...s, at: traceValue(loc) } : s;

export const markAttr = (s: TraceScope): Attrs => (s.at ? [[TRACE_ATTR, s.at]] : []);

export const isMarker = (name: string): boolean => name === TRACE_ATTR;

import { TRACE_ATTR } from "../emit/trace.ts";
import { startTags } from "../template/tags.ts";

// where the author element of each start tag of the output is, in the input; undefined: none
export type TraceEntry = { line: number; col: number } | undefined;

const MARKER = new RegExp(` ${TRACE_ATTR}="(\\d+):(\\d+)"`);
const ALL_MARKERS = new RegExp(MARKER.source, "g");

// A marker inside an Outlook conditional belongs to no counted tag (a browser sees a comment there),
// so it is dropped with the rest.
export const readTrace = (html: string, elements: ReadonlySet<string>): { html: string; trace: TraceEntry[] } => {
  const trace = startTags(html).map((t): TraceEntry => {
    const m = MARKER.exec(html.slice(t.start, t.end));
    return m && elements.has(`${m[1]}:${m[2]}`) ? { line: Number(m[1]), col: Number(m[2]) } : undefined;
  });
  return { html: html.replace(ALL_MARKERS, ""), trace };
};

// The html without markers: a compile that marked its tags only for the head styles diff (trace off).
export const stripMarkers = (html: string): string => html.replace(ALL_MARKERS, "");

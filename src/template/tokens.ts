import type { Cond } from "../ir/types.ts";
import { condText, isPath } from "./cond.ts";

export { isPath, pathProblem } from "./cond.ts";

// What a placeholder looks like between the adapter's render and the dialect writer. The
// characters are private-use, so nothing in an email, an escape pass or a lowering step reads them.
export const FIELD_OPEN = "";
export const FIELD_CLOSE = "";

const WHOLE = new RegExp(`^${FIELD_OPEN}[^${FIELD_CLOSE}]*${FIELD_CLOSE}$`);
// a value that is one placeholder and nothing else, the only form CSS takes (docs/templates.md#colours-from-data)
export const isWholeField = (v: string): boolean => WHOLE.test(v.trim());

export const field = (path: string): string => {
  if (!isPath(path)) throw new Error(`field("${path}"): not a data path; use a dotted name such as order.total`);
  return `${FIELD_OPEN}${path}${FIELD_CLOSE}`;
};

// Block markers are comments, so they ride through emission as markup; the dialect writer turns
// them into the ESP's syntax. An if chain is `if c`, any `elseif c`, maybe `else`, then `/if`.
export type Marker = { op: "each"; path: string; as?: string } | { op: "if" | "elseif"; when: Cond } | { op: "else" };
export type BlockOp = "each" | "if";

export const markerData = (m: Marker): string =>
  m.op === "each" ? `tddr:each ${m.path}${m.as ? ` ${m.as}` : ""}` : m.op === "else" ? "tddr:else" : `tddr:${m.op} ${condText(m.when)}`;
export const closeData = (op: BlockOp): string => `/tddr:${op}`;
export const blockOpen = (m: Marker): string => `<!--${markerData(m)}-->`;
export const blockClose = (op: BlockOp): string => `<!--${closeData(op)}-->`;

// what a marker comment holds, without the <!-- -->
export const MARKER_DATA = /^(\/?)tddr:(each|if|elseif|else)(?: ([^]*))?$/;
export const isMarkerData = (data: string): boolean => MARKER_DATA.test(data);

export const hasTemplate = (html: string): boolean => html.includes(FIELD_OPEN) || /<!--\/?tddr:(each|if|elseif|else)[ >-]/.test(html);

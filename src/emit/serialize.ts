// Tags. Every start tag goes through open(), so the trace marker of its scope lands on it.
import { attrString, styleString, type Attrs, type Decls } from "./attrs.ts";
import { isMarker, markAttr, type TraceScope } from "./trace.ts";

export const open = (s: TraceScope, tag: string, attrs: Attrs = []): string =>
  `<${tag}${attrString(attrs.some(([k]) => isMarker(k)) ? attrs : [...attrs, ...markAttr(s)])}>`;

export const wrap = (s: TraceScope, tag: string, attrs: Attrs, inner: string): string => `${open(s, tag, attrs)}${inner}</${tag}>`;

// Every table we emit opens the same way; only width and extra style differ.
export const tableOpen = (s: TraceScope, widthAttr: string, styleDecls: Decls, align?: string): string =>
  open(s, "table", [
    ["role", "presentation"],
    ["width", widthAttr],
    ["cellpadding", "0"],
    ["cellspacing", "0"],
    ["border", "0"],
    ["align", align],
    ["style", styleString(styleDecls)],
  ]);

export const withBody = (head: string, body: string): string => (body ? `${head}\n${body}\n</table>` : `${head}\n</table>`);

export const tr = (cells: string): string => `<tr>\n${cells}\n</tr>`;

// The dev page's contract with its server: every route, its query, body and answer, and the events
// it pushes. Types only, so the browser modules (checked through JSDoc) and the server share them.
import type { CompileOptions, Diagnostic, DialectName } from "../../src/index.ts";
import type { Framework, Rendered, RenderMode } from "../vite/types.ts";

export type { Diagnostic, DialectName, Framework, RenderMode };

export type EmailSummary = { name: string; framework: Framework; data: string[]; template: DialectName[] };
export type EmailList = { dir: string; emails: EmailSummary[] };

// the compile options a page may set; the server ignores anything else
export type PageCompileOptions = Pick<CompileOptions, "width" | "targets" | "strict" | "allowSvg">;

// `data` names a saved set (read from disk); `json` is what the editor holds, and wins over `data`
export type RenderRequest = {
  email: string;
  mode?: RenderMode;
  data?: string;
  json?: Record<string, unknown>;
  compile?: PageCompileOptions;
};

// The size policy of src/limits.ts: UTF-8 bytes of the compiled email, and where Gmail clips.
export type SizeInfo = { bytes: number; limit: number };

// a trace entry with no source is undefined on the server and null once it is JSON
export type TraceLoc = { line: number; col: number };
export type RenderResponse = Omit<Rendered, "trace"> & { trace?: (TraceLoc | null | undefined)[]; size: SizeInfo };

export type DataText = { name: string; text: string };
export type DataName = { name: string };
export type NewData = { name: string; text: string };

export type DataQuery = { email: string; set: string };

// what a failed request answers; a render error also says where (Vite and Rollup errors know)
export type ApiError = { message: string; stack?: string; frame?: string; file?: string; line?: number; col?: number };
export type ErrorBody = { error: ApiError };

// "METHOD path" -> what it takes and gives. A PUT of a data set sends the file's text as it is.
export type Routes = {
  "GET /__tddr/api/emails": { query: Record<string, never>; body: undefined; response: EmailList };
  "POST /__tddr/api/render": { query: Record<string, never>; body: RenderRequest; response: RenderResponse };
  "GET /__tddr/api/data": { query: DataQuery; body: undefined; response: DataText };
  "PUT /__tddr/api/data": { query: DataQuery; body: string; response: DataName };
  "POST /__tddr/api/data": { query: { email: string }; body: NewData; response: DataName };
};
export type RouteKey = keyof Routes;

// ---- Server-Sent Events
export type EventsPath = "/__tddr/events";
export type ChangeKind = "add" | "change" | "unlink" | "addDir" | "unlinkDir";
// `file` is relative to the emails folder; `email` and `data` say what it belongs to, when anything
export type ChangeEvent = { kind: ChangeKind; file: string; email?: string; data?: string };
export type ServerEvents = { change: ChangeEvent };

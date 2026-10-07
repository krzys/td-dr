import type { CompileOptions, Diagnostic, DialectName, TraceEntry } from "../../src/index.ts";
import type { AssetFile } from "./assets.ts";

export type { AssetFile } from "./assets.ts";

export type Framework = "react" | "vue";

// one JSON file of props (or, for a template email, of ESP data)
export type DataSet = { name: string; file: string };

export type EmailEntry = {
  name: string; // folder or file name, unique within the emails dir
  entry: string; // absolute path of the module that default-exports the component
  framework: Framework;
  data: DataSet[];
  // dialects the email is written for (`export const template = [...]` in the entry); empty for plain emails
  template: DialectName[];
  lang?: string; // `export const lang = "de"` in the entry
};

// "html": render with the data as props and compile. A dialect: render once without props,
// compile to that dialect, then fill it with the data the way the ESP would.
export type RenderMode = "html" | DialectName;

export type Rendered = {
  source: string; // the component's own markup + collected CSS as a full page, data applied
  input: string; // exactly what was compiled; diagnostic locations point into it
  html: string; // the compiled email, data applied
  template?: string; // the compiled template before filling (dialect modes)
  diagnostics: Diagnostic[];
  filled?: "engine" | "preview"; // dialect modes: real engine, or preview() when it isn't installed
  assets: AssetFile[]; // local images the HTML points at under baseUrl, to upload there
  // Dev UI only (renderEmail; a build never sees these): what ties a click in one view to the others.
  // trace: the input element of each start tag of the compiled text, which is `html` (html mode) or `template`.
  trace?: TraceEntry[];
  // dialect modes: the two frames with their elements and filled fields marked (data-tddr-s / -t / -n, <tddr-f>)
  sourceShown?: string;
  htmlShown?: string;
  // why those frames could not be marked (dev only; the frames then show unlinked)
  unlinked?: string;
};

export type RenderOptions = { data: unknown; mode: RenderMode; compile?: CompileOptions; baseUrl?: string | undefined };

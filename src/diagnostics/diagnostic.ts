import type { SrcLoc } from "../loc.ts";
import { codes, type Code, type Severity } from "./codes.ts";

export type Diagnostic = {
  code: string;
  severity: Severity;
  message: string;
  hint?: string;
  loc?: SrcLoc;
};

export type DiagnosticInput = {
  message?: string | undefined; // defaults to the code's title
  hint?: string | undefined;
  loc?: SrcLoc | undefined;
};

export interface DiagnosticSink {
  report(code: Code, input?: DiagnosticInput): void;
  list(): Diagnostic[];
}

// Errors that mean no output was written, which strict: false can't keep as written.
const UNKEPT: ReadonlySet<Code> = new Set(["E018"]);

// Not strict = errors become warnings (docs/architecture.md#design-decisions).
export const createSink = (strict: boolean): DiagnosticSink => {
  const items: Diagnostic[] = [];
  return {
    report(code, input = {}) {
      const info = codes[code];
      const severity: Severity = !strict && info.severity === "error" && !UNKEPT.has(code) ? "warning" : info.severity;
      const d: Diagnostic = { code, severity, message: input.message ?? info.title, hint: input.hint ?? info.hint };
      if (input.loc) d.loc = input.loc;
      items.push(d);
    },
    list: () => [...items],
  };
};

export const hasErrors = (ds: readonly Diagnostic[]): boolean => ds.some((d) => d.severity === "error");

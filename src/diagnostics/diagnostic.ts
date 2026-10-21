import { locKey, type SrcLoc } from "../loc.ts";
import { codes, type Code, type Severity } from "./codes.ts";
import { oncePerShorthand } from "./shorthand.ts";

export type Diagnostic = {
  code: string;
  severity: Severity;
  message: string;
  hint?: string;
  loc?: SrcLoc;
  locs?: SrcLoc[]; // set when the same diagnostic stands for several places, `loc` being the first
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

const before = (a: SrcLoc, b: SrcLoc): number => (a.file ?? "").localeCompare(b.file ?? "") || a.line - b.line || a.col - b.col;

// What the author reads: a diagnostic said once however often a stage met it, once per shorthand, and
// one said the same way at several places as one "(N places)" at the first (docs/support.md#diagnostic-codes).
export const collapse = (ds: readonly Diagnostic[]): Diagnostic[] => {
  const groups = new Map<string, { first: Diagnostic; locs: Map<string, SrcLoc> }>();
  for (const d of oncePerShorthand(ds)) {
    const key = JSON.stringify([d.code, d.severity, d.message, d.hint ?? null, d.loc?.file ?? null]);
    const g = groups.get(key) ?? { first: d, locs: new Map<string, SrcLoc>() };
    groups.set(key, g);
    for (const loc of d.locs ?? (d.loc ? [d.loc] : [])) g.locs.set(locKey(loc), loc);
  }
  return [...groups.values()].map(({ first, locs }) => {
    const all = [...locs.values()].sort(before);
    const { loc: _loc, locs: _locs, ...rest } = first;
    if (all.length === 0) return rest;
    if (all.length === 1) return { ...rest, loc: all[0]! };
    return { ...rest, message: `${first.message} (${all.length} places)`, loc: all[0]!, locs: all };
  });
};

export const hasErrors = (ds: readonly Diagnostic[]): boolean => ds.some((d) => d.severity === "error");

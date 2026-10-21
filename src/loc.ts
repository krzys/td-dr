// Where something is in the input. Every stage carries it, so it sits below them all.
export type SrcLoc = { line: number; col: number; file?: string };

// One key per source position, for sets of "already reported here".
export const locKey = (loc: SrcLoc): string => `${loc.file ?? ""}:${loc.line}:${loc.col}`;

// Keeps `loc` off the object when it's undefined (exactOptionalPropertyTypes).
export const withLoc = <T extends object>(n: T, loc: SrcLoc | undefined): T => (loc ? { ...n, loc } : n);

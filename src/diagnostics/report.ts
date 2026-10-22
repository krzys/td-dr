// Diagnostics for tools rather than people: `tddr build --format json|sarif` (docs/cli.md#json-and-sarif).
import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import type { SrcLoc } from "../loc.ts";
import { codes, type CodeInfo } from "./codes.ts";
import type { Diagnostic } from "./diagnostic.ts";

// a diagnostic as the CLI says it: `file` is where a place without its own file is, `dialect` the
// template it was built for
export type Reported = { diagnostic: Diagnostic; file: string; dialect?: string };

type Place = { file: string; line: number; column: number };

const places = ({ diagnostic: d, file }: Reported): Place[] =>
  (d.locs ?? (d.loc ? [d.loc] : [])).map((l: SrcLoc) => ({ file: l.file ?? file, line: l.line, column: l.col }));

// One entry per diagnostic, at its first place; `places` has every place (none when it isn't known),
// `count` how many the message stands for.
export const jsonReport = (items: readonly Reported[]): string => {
  const list = items.map((r) => {
    const d = r.diagnostic;
    const all = places(r);
    const first = all[0];
    return {
      file: first?.file ?? r.file,
      ...(first && { line: first.line, column: first.column }),
      code: d.code,
      severity: d.severity,
      message: d.message,
      ...(d.hint !== undefined && { hint: d.hint }),
      count: Math.max(all.length, 1),
      places: all,
      ...(r.dialect !== undefined && { dialect: r.dialect }),
    };
  });
  return `${JSON.stringify(list, null, 2)}\n`;
};

const LEVEL = { error: "error", warning: "warning", info: "note" } as const;

// a relative path stays relative to where tddr ran (SARIF's uri is a URI reference)
const uri = (file: string): string => (isAbsolute(file) ? pathToFileURL(file).href : file.split("/").map(encodeURIComponent).join("/"));

// SARIF 2.1.0: one run, every code a rule, one result per diagnostic with each of its places.
export const sarifReport = (items: readonly Reported[], version: string): string => {
  const ids = (Object.keys(codes) as (keyof typeof codes)[]).sort();
  const rules = ids.map((id) => {
    const c: CodeInfo = codes[id];
    return { id, shortDescription: { text: c.title }, help: { text: c.hint }, defaultConfiguration: { level: LEVEL[c.severity] } };
  });
  const results = items.map((r) => {
    const d = r.diagnostic;
    const at = places(r);
    const index = ids.indexOf(d.code as keyof typeof codes);
    const locations = (at.length > 0 ? at : [undefined]).map((p) => ({
      physicalLocation: {
        artifactLocation: { uri: uri(p?.file ?? r.file) },
        ...(p && { region: { startLine: p.line, startColumn: p.column } }),
      },
    }));
    const properties = { ...(d.hint !== undefined && { hint: d.hint }), ...(r.dialect !== undefined && { dialect: r.dialect }) };
    return {
      ruleId: d.code,
      ...(index >= 0 && { ruleIndex: index }),
      level: LEVEL[d.severity],
      message: { text: d.message },
      locations,
      ...(Object.keys(properties).length > 0 && { properties }),
    };
  });
  const log = {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [{ tool: { driver: { name: "tddr", version, rules } }, results }],
  };
  return `${JSON.stringify(log, null, 2)}\n`;
};

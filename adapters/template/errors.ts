import { fileURLToPath } from "node:url";

// the adapters (or, built, the dist folder): frames in here are ours, not the author's
const slashes = (p: string): string => p.replaceAll("\\", "/");
const OURS = slashes(fileURLToPath(new URL(import.meta.url.endsWith(".ts") ? ".." : ".", import.meta.url)));
const ABSOLUTE = /^(?:[A-Za-z]:)?\//;

const FRAME = /^\s*at (?:.*? \()?(.+?):(\d+):(\d+)\)?$/;

const authorFile = (name: string): string | undefined => {
  const file = slashes(name.startsWith("file://") ? fileURLToPath(name) : name);
  return file.startsWith(OURS) || file.includes("/node_modules/") || !ABSOLUTE.test(file) ? undefined : file;
};

const authorAt = (line: string): string | undefined => {
  const m = FRAME.exec(line);
  const file = m && authorFile(m[1]!);
  return file ? `${file}:${m[2]}:${m[3]}` : undefined;
};

export const authorFrame = (stack: string): string | undefined => {
  for (const line of stack.split("\n").slice(1)) {
    const at = authorAt(line);
    if (at) return at;
  }
  return undefined;
};

// The frames where the code ran, before any source map, one per "at" line of the stack.
const sitesOf = (): NodeJS.CallSite[] => {
  const prepare = Error.prepareStackTrace;
  const held: { stack?: NodeJS.CallSite[] } = {};
  try {
    Error.prepareStackTrace = (_err, sites) => sites;
    Error.captureStackTrace(held, templateError);
    return Array.isArray(held.stack) ? held.stack : [];
  } catch {
    return [];
  } finally {
    Error.prepareStackTrace = prepare;
  }
};

// What a template can't do with a field. The message names the field and says why; the stack
// (source-mapped by Vite's runner) gives the component line. Vue's server render maps only parts
// of a line, so the error also says where that frame ran, for the caller to place it
// (adapters/vite/frames.ts).
export const templateError = (subject: string, why: string, hint: string): Error => {
  const err = new Error(`${subject}: ${why}\nHint: ${hint}`);
  Error.captureStackTrace(err, templateError);
  err.name = "TemplateError";
  const frames = (err.stack ?? "").split("\n").filter((l) => l.startsWith("    at "));
  const i = frames.findIndex((l) => authorAt(l) !== undefined);
  if (i < 0) return err;
  const at = authorAt(frames[i]!)!;
  err.message += `\n    at ${at}`;
  const site = sitesOf()[i];
  // code Vite's runner evaluated has no file name, only its sourceURL
  const ran = site && (site.getFileName() || site.getScriptNameOrSourceURL());
  return ran ? Object.assign(err, { at, ranAt: `${ran}:${site.getLineNumber()}:${site.getColumnNumber()}` }) : err;
};

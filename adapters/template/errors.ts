import { fileURLToPath } from "node:url";

// the adapters (or, built, the dist folder): frames in here are ours, not the author's
const slashes = (p: string): string => p.replaceAll("\\", "/");
const OURS = slashes(fileURLToPath(new URL(import.meta.url.endsWith(".ts") ? ".." : ".", import.meta.url)));
const ABSOLUTE = /^(?:[A-Za-z]:)?\//;

const FRAME = /^\s*at (?:.*? \()?(.+?):(\d+):(\d+)\)?$/;

export const authorFrame = (stack: string): string | undefined => {
  for (const line of stack.split("\n").slice(1)) {
    const m = FRAME.exec(line);
    if (!m) continue;
    const file = slashes(m[1]!.startsWith("file://") ? fileURLToPath(m[1]!) : m[1]!);
    if (file.startsWith(OURS) || file.includes("/node_modules/") || !ABSOLUTE.test(file)) continue;
    return `${file}:${m[2]}:${m[3]}`;
  }
  return undefined;
};

// What a template can't do with a field. The message names the field and says why; the stack
// (source-mapped by Vite's runner) gives the component line.
export const templateError = (subject: string, why: string, hint: string): Error => {
  const err = new Error(`${subject}: ${why}\nHint: ${hint}`);
  const at = authorFrame(err.stack ?? "");
  if (at) err.message += `\n    at ${at}`;
  err.name = "TemplateError";
  return err;
};

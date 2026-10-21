// tsc keeps our ".ts" import specifiers in the .d.ts files; published types need ".js".
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith(".d.ts") ? [join(dir, e.name)] : [],
  );

for (const file of walk("dist")) {
  const src = readFileSync(file, "utf8");
  const out = src.replace(/((?:from|import)\s*\(?\s*["'])(\.{1,2}\/[^"']+)\.ts(["'])/g, "$1$2.js$3");
  if (out !== src) writeFileSync(file, out);
}

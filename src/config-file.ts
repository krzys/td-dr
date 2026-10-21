import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { checkConfig, type TddrConfig } from "./config.ts";

export const CONFIG_FILES = ["tddr.config.ts", "tddr.config.mts", "tddr.config.js", "tddr.config.mjs"];

// The config in dir (the directory tddr runs in), if there is one. Node loads a .ts or .mts one itself,
// stripping its types (Node 22.18 and later). An error starts with the file's name.
export const loadConfig = async (dir: string): Promise<{ file: string; config: TddrConfig } | undefined> => {
  const found = CONFIG_FILES.filter((f) => existsSync(join(dir, f)));
  if (found.length > 1) throw new Error(`found ${found.join(" and ")}; keep one`);
  const [file] = found;
  if (!file) return undefined;
  let mod: { default?: unknown };
  try {
    mod = (await import(pathToFileURL(join(dir, file)).href)) as { default?: unknown };
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ERR_UNKNOWN_FILE_EXTENSION") throw new Error(`${file}: this Node can't load TypeScript; use Node 22.18 or later, or tddr.config.mjs`);
    throw new Error(`${file}: ${err.message}`);
  }
  try {
    return { file, config: checkConfig(mod.default) };
  } catch (e) {
    throw new Error(`${file}: ${(e as Error).message}`);
  }
};

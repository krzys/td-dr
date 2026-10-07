import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// A package the user may or may not have installed, resolved from their project.
export const importOptional = async <T>(root: string, name: string): Promise<T | undefined> => {
  let file: string;
  try {
    file = createRequire(join(root, "package.json")).resolve(name);
  } catch {
    return undefined;
  }
  return (await import(pathToFileURL(file).href)) as T;
};

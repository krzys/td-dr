import { fileURLToPath } from "node:url";

// Our runtime files: next to this module once built into dist/, in the source tree otherwise.
const built = !import.meta.url.endsWith(".ts");
// forward slashes, as in Vite's module ids, on Windows too
const path = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url)).replaceAll("\\", "/");
const own = (src: string, dist: string): string => path(built ? `./${dist}.js` : `../${src}`);

// the compiler and adapters themselves; never rewritten or shimmed
export const OWN_DIRS = (built ? ["./"] : ["../", "../../src/"]).map(path);
export const RUNTIME_FILE = own("template/index.ts", "template");

// what email modules import instead, in the email environment
export const SHIMS: Record<string, string> = {
  "react/jsx-runtime": own("react/jsx-runtime.ts", "react-jsx-runtime"),
  "react/jsx-dev-runtime": own("react/jsx-dev-runtime.ts", "react-jsx-dev-runtime"),
  "vue/server-renderer": own("vue/server-renderer.ts", "vue-server-renderer"),
  vue: own("vue/vue.ts", "vue-shim"),
};

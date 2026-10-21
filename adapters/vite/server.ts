import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createServer, type PluginOption, type ViteDevServer } from "vite";
import { markVue } from "./locate.ts";
import { importOptional } from "./optional.ts";
import { tddr } from "./plugin.ts";

// what Vite looks for in the root when configFile is left undefined
const CONFIG_FILES = ["vite.config.js", "vite.config.mjs", "vite.config.ts", "vite.config.cjs", "vite.config.mts", "vite.config.cts"];

type PluginFactory = { default: () => PluginOption };

// Without a config of their own, authors get Vue and Tailwind when those are installed.
const defaultPlugins = async (root: string): Promise<PluginOption[]> => {
  const found = await Promise.all(["@vitejs/plugin-vue", "@tailwindcss/vite"].map((p) => importOptional<PluginFactory>(root, p)));
  return found.flatMap((m) => (m ? [m.default()] : []));
};

// `locate`: components mark the tags they render, for a build to say component lines (adapters/vite/locate.ts)
export const createEmailServer = async (o: { root: string; configFile?: string | false; locate?: boolean }): Promise<ViteDevServer> => {
  const root = resolve(o.root);
  const configFile = typeof o.configFile === "string" ? resolve(o.configFile) : o.configFile;
  const ownConfig = configFile !== false && (configFile !== undefined || CONFIG_FILES.some((f) => existsSync(join(root, f))));
  return createServer({
    root,
    ...(configFile === undefined ? {} : { configFile }),
    appType: "custom",
    clearScreen: false,
    // the dev server pushes reloads itself; Vite's HMR socket would only hold a port
    server: { middlewareMode: true, ws: false },
    // nothing is served to a browser, so there are no client deps to pre-bundle
    optimizeDeps: { noDiscovery: true },
    plugins: [...(ownConfig ? [] : await defaultPlugins(root)), tddr(), ...(o.locate ? [markVue()] : [])],
    ...(ownConfig ? {} : { oxc: { jsx: { runtime: "automatic" as const } } }),
  });
};

import { createRunnableDevEnvironment, isCSSRequest, type Plugin } from "vite";
import { rewrite, RUNTIME, SHIM } from "../template/transform.ts";
import { OWN_DIRS, RUNTIME_FILE, SHIMS } from "./own.ts";

export const EMAIL_ENV = "email";

// Emails get their own server environment instead of borrowing `ssr`: an app's ssr may not run
// in Node (a worker target), and its runner's HMR would re-import every email on each save.
// renderEmail clears the runner before each load instead. Its own stack mapping, rather than
// Node's, keeps component lines in errors whoever else set Error.prepareStackTrace (a test runner).
export const emailEnvironment = (): Plugin => ({
  name: "tddr",
  config: () => ({
    environments: {
      [EMAIL_ENV]: {
        consumer: "server",
        // Vite turns small imported SVGs into data: URIs, which Gmail drops; placeAssets decides instead
        build: { assetsInlineLimit: 0 },
        dev: { createEnvironment: (name, config) => createRunnableDevEnvironment(name, config, { runnerOptions: { hmr: false, sourcemapInterceptor: "prepareStackTrace" } }) },
      },
    },
  }),
  // nothing listens for HMR in the email environment (Vite would log "page reload" for every save);
  // the watcher has already invalidated the graph, which is all renderEmail needs
  hotUpdate() {
    if (this.environment.name === EMAIL_ENV) return [];
  },
});

const SCRIPT = /\.(?:[cm]?[jt]sx?|vue)$/;
const NOT_CODE = /(?:^|&)(?:raw|url|inline|worker|sharedworker)\b/;
const theirs = (file: string): boolean => file.includes("/node_modules/") || OWN_DIRS.some((d) => file.startsWith(d));

// the author's own JS, after the framework compiled it
const isEmailModule = (id: string): boolean => {
  if (id.startsWith("\0") || isCSSRequest(id)) return false;
  const [file = "", query = ""] = id.split("?", 2);
  if (theirs(file) || !SCRIPT.test(file) || NOT_CODE.test(query)) return false;
  return !file.endsWith(".vue") || query === "" || /\btype=(?:script|template)\b/.test(query);
};

// docs/templates.md#native-component-code: email modules get symbolic-aware operators and the frameworks' renderers through
// shims, so the same code renders real data or a template.
export const nativeTemplates = (): Plugin => ({
  name: "tddr:native-templates",
  // after the frameworks compiled the module, before Vite resolves its imports
  enforce: "post",
  applyToEnvironment: (env) => env.name === EMAIL_ENV,
  resolveId: {
    order: "pre",
    handler(id) {
      if (id === RUNTIME) return RUNTIME_FILE;
      if (id.startsWith(SHIM)) return SHIMS[id.slice(SHIM.length)];
    },
  },
  transform(code, id) {
    if (!isEmailModule(id)) return;
    return rewrite(code, id.split("?")[0]!);
  },
});

export const tddr = (): Plugin[] => [emailEnvironment(), nativeTemplates()];

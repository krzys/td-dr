import { cpSync } from "node:fs";
import { defineConfig } from "tsup";

export const config = defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
    react: "adapters/react/index.ts",
    vue: "adapters/vue/index.ts",
    vite: "adapters/vite/index.ts",
    dev: "adapters/dev/index.ts",
    // what the tddr() plugin swaps into email modules (adapters/vite/own.ts names them)
    template: "adapters/template/index.ts",
    "react-jsx-runtime": "adapters/react/jsx-runtime.ts",
    "react-jsx-dev-runtime": "adapters/react/jsx-dev-runtime.ts",
    "vue-server-renderer": "adapters/vue/server-renderer.ts",
    "vue-shim": "adapters/vue/vue.ts",
  },
  external: ["vite", "react", "react-dom", "vue", "handlebars", "liquidjs"],
  format: ["esm"],
  target: "node22",
  dts: false, // tsup's dts plugin needs the TS 6 API; `tsc -p tsconfig.build.json` writes them
  clean: true,
  sourcemap: true,
  // the dev server's page is served as files, next to dist/dev.js
  onSuccess: async () => cpSync("adapters/dev/ui", "dist/ui", { recursive: true, filter: (f) => !f.endsWith(".d.ts") }),
});

// tsup only reads a default export.
export default config;

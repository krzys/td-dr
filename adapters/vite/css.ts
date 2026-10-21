import { isCSSRequest, normalizePath, type EnvironmentModuleNode, type RunnableDevEnvironment } from "vite";

// imported as a string or a URL for the component to use, not applied to the page
const NOT_APPLIED = /[?&](?:raw|url|inline)\b/;

// The sheets an entry imports, in the order its modules run (as a bundle or the browser would
// apply them): depth first through JS imports, each sheet once. A sheet's own imports are
// @import / Tailwind sources Vite already inlined, so the walk stops there.
export const cssModules = (entry: EnvironmentModuleNode): EnvironmentModuleNode[] => {
  const out: EnvironmentModuleNode[] = [];
  const seen = new Set<EnvironmentModuleNode>();
  const visit = (m: EnvironmentModuleNode): void => {
    for (const dep of m.importedModules) {
      if (seen.has(dep)) continue;
      seen.add(dep);
      if (!dep.id || !isCSSRequest(dep.id)) visit(dep);
      else if (!NOT_APPLIED.test(dep.id)) out.push(dep);
    }
  };
  seen.add(entry);
  visit(entry);
  return out;
};

// In SSR a plain CSS import is an empty module; `?inline` makes Vite export the processed sheet
// (PostCSS, Tailwind, Vue's scoping), whatever order the plugins are in.
const inlineUrl = (url: string): string => (url.includes("?") ? url.replace("?", "?inline&") : `${url}?inline`);

export const collectCss = async (env: RunnableDevEnvironment, file: string): Promise<string> => {
  const entry = normalizePath(file);
  const node = [...(env.moduleGraph.getModulesByFile(entry) ?? [])].find((m) => m.id === entry);
  if (!node) throw new Error(`${entry} is not in the ${env.name} module graph; import it first`);
  const sheets: string[] = [];
  for (const m of cssModules(node)) {
    const mod: { default: string } = await env.runner.import(inlineUrl(m.url));
    sheets.push(mod.default.trim());
  }
  return sheets.filter(Boolean).join("\n");
};

import type { Plugin } from "vite";
import type { Diagnostic } from "../../src/index.ts";
import type { SrcLoc } from "../../src/loc.ts";
import { startTags } from "../../src/template/tags.ts";

// A folder build says a diagnostic at the component line it came from, not in the rendered page
// nobody sees (docs/templates.md#native-component-code). Vue's compiler marks each element it
// renders with its file:line:col; the marks are taken out before compiling, and a diagnostic placed
// on a start tag is said at that tag's mark. JSX has no such hook, so React emails keep the file alone.

const MARK = "data-tddr-at";
const MARKED = new RegExp(` ${MARK}="([^"]*)"`, "g");

// @vue/compiler-core's NodeTypes.ELEMENT / ATTRIBUTE / TEXT and ElementTypes.ELEMENT: a plain tag, not
// a component, <slot> or <template>, which render no tag of their own
type Pos = { line: number; column: number };
type VueNode = { type: number; tagType?: number; props?: unknown[]; loc: { start: Pos } };
const mark = (node: VueNode, context: { filename: string }): void => {
  if (node.type !== 1 || node.tagType !== 0) return;
  const { line, column } = node.loc.start;
  const value = { type: 2, content: `${context.filename.replaceAll("\\", "/")}:${line}:${column}`, loc: node.loc };
  node.props!.push({ type: 6, name: MARK, nameLoc: node.loc, value, loc: node.loc });
};

type VueApi = { options: { template?: { compilerOptions?: { nodeTransforms?: unknown[] } } } };

// after @vitejs/plugin-vue settled its options, so the transform is in the ones it compiles with
export const markVue = (): Plugin => ({
  name: "tddr:locate",
  enforce: "post",
  configResolved(config) {
    const vue = config.plugins.find((p) => p.name === "vite:vue")?.api as VueApi | undefined;
    if (!vue?.options) return;
    const { template, ...rest } = vue.options;
    const compilerOptions = { ...template?.compilerOptions, nodeTransforms: [...(template?.compilerOptions?.nodeTransforms ?? []), mark] };
    vue.options = { ...rest, template: { ...template, compilerOptions } };
  },
});

// The page without its marks, and each start tag's mark, in order: the asset pass rewrites URLs,
// never tags, so the n-th start tag of the page compiled is the n-th here.
export const unmark = (page: string): { page: string; marks: Array<string | undefined> } => {
  if (!page.includes(MARK)) return { page, marks: [] };
  const one = new RegExp(MARKED.source);
  const marks = startTags(page).map((t) => one.exec(page.slice(t.start, t.end))?.[1]);
  return { page: page.replace(MARKED, ""), marks };
};

// SrcLoc of a mark: the file can hold colons (C:/…), the line and column can't
const parse = (m: string): SrcLoc | undefined => {
  const at = /^(.*):(\d+):(\d+)$/.exec(m);
  return at ? { file: at[1]!, line: Number(at[2]), col: Number(at[3]) } : undefined;
};

// Diagnostics on `page` (the n-th start tag carries marks[n]) with each place inside a start tag
// said at the component's line; the others keep their page place. Places one component line
// renders several times are said once.
export const inComponents = (page: string, marks: ReadonlyArray<string | undefined>, ds: readonly Diagnostic[]): Diagnostic[] => {
  if (marks.length === 0) return [...ds];
  const lines = [0];
  for (let i = 0; i < page.length; i++) if (page[i] === "\n") lines.push(i + 1);
  const tags = startTags(page);
  const at = (loc: SrcLoc): SrcLoc => {
    const offset = (lines[loc.line - 1] ?? Infinity) + loc.col - 1;
    const i = tags.findLastIndex((t) => t.start <= offset);
    if (i < 0 || offset >= tags[i]!.end) return loc;
    // a block td;dr's components write (<tddr-each>, <tddr-if>) is said at the element it holds first
    let j = i;
    while (!marks[j] && tags[j]?.tag.startsWith("tddr-") && j + 1 < tags.length && !page.slice(tags[j]!.end, tags[j + 1]!.start).includes("</tddr-")) j++;
    const m = marks[j];
    return (m && parse(m)) || loc;
  };
  return ds.map((d) => {
    if (!d.loc) return d;
    const locs = d.locs?.map(at).filter((l, i, all) => all.findIndex((o) => o.file === l.file && o.line === l.line && o.col === l.col) === i);
    return { ...d, loc: at(d.loc), ...(locs && { locs }) };
  });
};

import { stripVTControlCharacters } from "node:util";
import { isRunnableDevEnvironment, normalizePath, type RunnableDevEnvironment, type ViteDevServer } from "vite";
import { compile, preview, toText, type CompileOptions, type Diagnostic, type DialectName, type TraceEntry } from "../../src/index.ts";
import { codes } from "../../src/diagnostics/codes.ts";
import { startTags } from "../../src/template/tags.ts";
import { placeAssets, type Placed } from "./assets.ts";
import { collectCss } from "./css.ts";
import { engine } from "./engines.ts";
import { dataObject } from "./find.ts";
import { placeFrame } from "./frames.ts";
import { inComponents, unmark } from "./locate.ts";
import { EMAIL_ENV } from "./plugin.ts";
import type { AssetFile, EmailEntry, Framework, RenderOptions, Rendered } from "./types.ts";

type Props = Record<string, unknown>;
type Adapter = { render: (c: never, props: Props) => string | Promise<string>; renderTemplate: (c: never) => Promise<string> };

const adapters: Record<Framework, () => Promise<Adapter>> = {
  react: () => import("../react/index.ts"),
  vue: () => import("../vue/index.ts"),
};

// the shape of a captured fixture's input.html
export const sourcePage = (css: string, markup: string): string => `<style>\n${css}\n</style>\n${markup}\n`;

// the dev server shows these in a page, so no terminal colours
// the email's own `export const lang` beats a folder-wide --lang
const optionsFor = (email: EmailEntry, c: CompileOptions | undefined): CompileOptions => ({ ...c, ...(email.lang && { lang: email.lang }) });

const fail = (email: EmailEntry, what: string, err: unknown): never => {
  const e = err as { message?: string; frame?: string };
  const message = `${e.message ?? String(err)}${e.frame ? `\n${e.frame}` : ""}`;
  throw new Error(stripVTControlCharacters(`${email.name}: ${what} failed: ${message}`), { cause: err });
};

const emailEnv = (vite: ViteDevServer): RunnableDevEnvironment => {
  const env = vite.environments[EMAIL_ENV];
  if (!env || !isRunnableDevEnvironment(env)) throw new Error("This Vite server has no email environment; add tddr() from tddr/vite to its plugins");
  return env;
};

// whether rendering an email loaded this file, wherever it lives
export const emailImports = (vite: ViteDevServer, file: string): boolean =>
  (vite.environments[EMAIL_ENV]?.moduleGraph.getModulesByFile(normalizePath(file))?.size ?? 0) > 0;

export const loadEmail = async (vite: ViteDevServer, email: EmailEntry): Promise<{ component: unknown; css: string }> => {
  const env = emailEnv(vite);
  // the watcher invalidates the module graph; dropping what the runner evaluated makes every render see it
  env.runner.evaluatedModules.clear();
  try {
    const mod: { default?: unknown } = await env.runner.import(normalizePath(email.entry));
    if (mod.default === undefined) throw new Error(`${email.entry} has no default export; export the email component as default`);
    return { component: mod.default, css: await collectCss(env, email.entry) };
  } catch (err) {
    return fail(email, `loading ${email.entry}`, err);
  }
};

// with the server it was loaded by, a template error's frame is placed on its component line
const renderMarkup = async (email: EmailEntry, component: unknown, props: Props | undefined, vite?: ViteDevServer): Promise<string> => {
  try {
    const adapter = await adapters[email.framework]();
    return await (props ? adapter.render(component as never, props) : adapter.renderTemplate(component as never));
  } catch (err) {
    if (vite) placeFrame(emailEnv(vite), err);
    return fail(email, `rendering with ${email.framework}`, err);
  }
};

// docs/templates.md#native-component-code: the props are symbolic, so the markup holds fields and <tddr-*> blocks for every branch
// and loop the component writes natively (field() and data-email-* hints keep working).
export const templateMarkup = (email: EmailEntry, component: unknown, vite?: ViteDevServer): Promise<string> => renderMarkup(email, component, undefined, vite);

export const props = (email: EmailEntry, data: unknown): Props => {
  if (data === undefined) return {};
  try {
    return dataObject(data);
  } catch (err) {
    throw new Error(`${email.name}: ${(err as Error).message}`);
  }
};

// local images become data: URIs or hosted URLs before compiling, so diagnostics point into the page compiled
const withAssets = (vite: ViteDevServer, page: string, o: Pick<RenderOptions, "baseUrl" | "compile">): Placed =>
  placeAssets(page, {
    root: vite.config.root,
    publicDir: vite.config.publicDir || false,
    baseUrl: o.baseUrl,
    targets: o.compile?.targets,
    strict: o.compile?.strict,
  });

export type CompiledTemplate = { input: string; template: string; diagnostics: Diagnostic[]; assets: AssetFile[]; trace?: TraceEntry[] };

// I015 for a component: its markup is compiled as a fragment, so the compiler can't tell an
// email without a <title> from one placed in a page; the shell's empty <title> tells it here
const titled = (html: string): Diagnostic[] =>
  html.includes("<title></title>") ? [{ code: "I015", severity: codes.I015.severity, message: codes.I015.title, hint: codes.I015.hint }] : [];

// what a build writes for a template email: the template itself, before any data
export const compileTemplate = async (
  vite: ViteDevServer,
  email: EmailEntry,
  dialect: DialectName,
  o: Pick<RenderOptions, "baseUrl" | "compile"> = {},
): Promise<CompiledTemplate> => {
  if (!email.template.includes(dialect)) {
    const listed = email.template.length ? `it lists ${email.template.join(", ")}` : "it has no `export const template`";
    throw new Error(`${email.name} is not written as a ${dialect} template (${listed})`);
  }
  const { component, css } = await loadEmail(vite, email);
  const { page, marks } = unmark(sourcePage(css, await templateMarkup(email, component, vite)));
  // compiling the page itself keeps diagnostic locations pointing into text the dev server can show;
  // a build's marked components say theirs (adapters/vite/locate.ts)
  const placed = withAssets(vite, page, o);
  const out = compile(placed.page, { ...optionsFor(email, o.compile), template: dialect });
  const diagnostics = [...inComponents(page, marks, placed.diagnostics), ...inComponents(placed.page, marks, out.diagnostics), ...titled(out.html)];
  return { input: placed.page, template: out.html, diagnostics, assets: placed.files, ...(out.trace && { trace: out.trace }) };
};

// a compiled template filled by the dialect's engine; without it, preview() stands in.
// The dev server passes the plain preview and `trace`, so the fallback compile is also the one that traces.
export const fillTemplate = async (vite: ViteDevServer, email: EmailEntry, dialect: DialectName, t: CompiledTemplate, data: Props, o: Pick<RenderOptions, "compile">, dev?: { shown: string }) => {
  const fill = await engine(vite.config.root, dialect);
  try {
    if (fill) return { html: fill(t.template, data), filled: "engine" as const, fill };
    const out = compile(dev?.shown ?? preview(t.input, data, { dialects: [dialect] }), { ...optionsFor(email, o.compile), ...(dev && { trace: true }) });
    return { html: out.html, filled: "preview" as const, fill, out };
  } catch (err) {
    return fail(email, `filling the ${dialect} template`, err);
  }
};

// ---- dev UI: frames whose elements and fields say where they came from

// comments and closing tags come first, so a placeholder inside a comment is part of the comment
// same pattern as the dev UI's TPL_FIELD (a test keeps them equal), so builds don't load a UI file
export const TPL_FIELD = /(?<![\\{])\{\{(?![#/^!>~&{]|\s*else\b|\s*["'])[^{}]*\}\}/;
const IN_TEXT = new RegExp(`<!--[\\s\\S]*?-->|<[!?][^>]*>|</[^>]*>|(${TPL_FIELD.source})`, "g");

// Adds ` attrs[i]` to the i-th start tag (counted like the UI does); undefined leaves a tag alone.
const addAttrs = (text: string, attrs: ReadonlyArray<string | undefined>): string => {
  let out = "";
  let last = 0;
  startTags(text).forEach((t, i) => {
    if (attrs[i] === undefined) return;
    const at = t.start + 1 + t.tag.length;
    out += text.slice(last, at) + ` ${attrs[i]}`;
    last = at;
  });
  return out + text.slice(last);
};

// A compiled template with data-tddr-t (its start tag index) on every tag and each text placeholder in
// <tddr-f data-tddr-f="offset in the template">. Placeholders in attributes, comments, <title>, <style>
// and <script> stay as they are; so do the engine's block tags. Filling it gives the compiled frame.
export const annotateTemplate = (template: string): string => {
  const lower = template.toLowerCase();
  let out = "";
  let last = 0;
  const text = (to: number): void => {
    const from = last;
    out += template.slice(from, to).replace(IN_TEXT, (m, field: string | undefined, offset: number) => (field ? `<tddr-f data-tddr-f="${from + offset}">${m}</tddr-f>` : m));
    last = to;
  };
  for (const [i, t] of startTags(template).entries()) {
    if (t.start < last) continue;
    text(t.start);
    const name = t.start + 1 + t.tag.length;
    out += `${template.slice(t.start, name)} data-tddr-t="${i}"${template.slice(name, t.end)}`;
    last = t.end;
    // what a raw-text tag holds is not markup
    if (/^(script|style|title|textarea)$/.test(t.tag)) {
      const close = lower.indexOf(`</${t.tag}`, last);
      const to = close < 0 ? template.length : (template.indexOf(">", close) + 1 || template.length);
      out += template.slice(last, to);
      last = to;
    }
  }
  text(template.length);
  return out;
};

// Without the engine the frame is the compile of preview(); its tags trace back to the elements of the
// annotated preview, whose data-tddr-s / -n they get. (Fields stay plain there: no <tddr-f> survives a compile.)
const shownFromPreview = (plain: string, annotated: string, out: { html: string; trace?: TraceEntry[] }): string | undefined => {
  const wrapped = (tag: string): boolean => tag === "tddr-f";
  const marks = startTags(annotated)
    .filter((t) => !wrapped(t.tag))
    .map((t) => ["s", "n"].flatMap((k) => (new RegExp(` data-tddr-${k}="([^"]*)"`).exec(annotated.slice(t.start, t.end)) ?? []).slice(1, 2).map((v) => `data-tddr-${k}="${v}"`)).join(" "));
  const tags = startTags(plain);
  if (!out.trace || marks.length !== tags.length) return undefined;
  const lines = [0];
  for (let i = 0; i < plain.length; i++) if (plain[i] === "\n") lines.push(i + 1);
  const byStart = new Map(tags.map((t, i) => [t.start, i]));
  return addAttrs(
    out.html,
    out.trace.map((e) => {
      const at = e && lines[e.line - 1] !== undefined ? byStart.get(lines[e.line - 1]! + e.col - 1) : undefined;
      return at === undefined || marks[at] === "" ? undefined : marks[at];
    }),
  );
};

// The engine filled the annotated copy into the same page, give or take the annotations
export const fillsLike = (shown: string, html: string): boolean =>
  shown.replace(/ data-tddr-t="\d+"/g, "").replace(/<\/?tddr-f\b[^>]*>/g, "") === html;

const renderTemplate = async (vite: ViteDevServer, email: EmailEntry, o: RenderOptions, dialect: DialectName): Promise<Rendered> => {
  const data = props(email, o.data);
  const t = await compileTemplate(vite, email, dialect, { ...o, compile: { ...o.compile, trace: true } });
  const source = preview(t.input, data, { dialects: [dialect] });
  const sourceShown = preview(t.input, data, { annotate: true, dialects: [dialect] });
  const { html, filled, fill, out } = await fillTemplate(vite, email, dialect, t, data, o, { shown: source });
  let htmlShown: string | undefined;
  let unlinked: string | undefined;
  try {
    htmlShown = fill ? fill(annotateTemplate(t.template), data) : shownFromPreview(source, sourceShown, out!);
    if (htmlShown !== undefined && fill && !fillsLike(htmlShown, html)) htmlShown = undefined;
    if (htmlShown === undefined) unlinked = "the compiled preview and the annotated preview have different tags";
  } catch (err) {
    // the plain fill worked, so the page still shows; only the links between frames are lost
    unlinked = `${(err as Error).message ?? err}`;
  }
  return {
    source,
    input: t.input,
    html,
    text: toText(html),
    template: t.template,
    diagnostics: t.diagnostics,
    filled,
    assets: t.assets,
    ...(t.trace && { trace: t.trace }),
    sourceShown,
    ...(htmlShown !== undefined && { htmlShown }),
    ...(unlinked !== undefined && { unlinked }),
  };
};

// What a template should read like once filled: the component with this data, its data-email-*
// hints evaluated the way an engine would (html mode leaves them for the template).
export const renderReference = async (
  vite: ViteDevServer,
  email: EmailEntry,
  data: Props,
  o: Pick<RenderOptions, "baseUrl" | "compile">,
  loaded?: { component: unknown; css: string },
): Promise<{ html: string; diagnostics: Diagnostic[] }> => {
  const { component, css } = loaded ?? (await loadEmail(vite, email));
  const placed = withAssets(vite, unmark(sourcePage(css, await renderMarkup(email, component, data, vite))).page, o);
  // the html render itself: JS semantics, no dialect's data needs
  const out = compile(preview(placed.page, data, { dialects: [] }), optionsFor(email, o.compile));
  return { html: out.html, diagnostics: [...placed.diagnostics, ...out.diagnostics] };
};

export const renderEmail = async (vite: ViteDevServer, email: EmailEntry, o: RenderOptions): Promise<Rendered> => {
  if (o.mode !== "html") return renderTemplate(vite, email, o, o.mode);
  const data = props(email, o.data);
  const { component, css } = await loadEmail(vite, email);
  const placed = withAssets(vite, unmark(sourcePage(css, await renderMarkup(email, component, data, vite))).page, o);
  const out = compile(placed.page, { ...optionsFor(email, o.compile), trace: true });
  return { source: placed.page, input: placed.page, html: out.html, text: toText(out.html), diagnostics: [...placed.diagnostics, ...out.diagnostics, ...titled(out.html)], assets: placed.files, ...(out.trace && { trace: out.trace }) };
};

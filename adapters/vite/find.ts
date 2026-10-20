import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { LANG_TAG } from "../../src/ctx.ts";
import { stripBom } from "../../src/parse/decode.ts";
import { dialects, type DialectName } from "../../src/template/dialects.ts";
import type { DataSet, EmailEntry, Framework } from "./types.ts";

// what a data set must be, wherever it comes from: the build, the dev server, a render
export const dataObject = (v: unknown): Record<string, unknown> => {
  if (v === null || typeof v !== "object" || Array.isArray(v)) throw new Error(`data must be a JSON object, got ${JSON.stringify(v)?.slice(0, 40)}`);
  return v as Record<string, unknown>;
};

export const parseDataText = (text: string): Record<string, unknown> => {
  let v: unknown;
  try {
    v = JSON.parse(stripBom(text));
  } catch (e) {
    throw new Error(`invalid JSON: ${(e as Error).message}`);
  }
  return dataObject(v);
};

const FOLDER_ENTRIES: Array<[file: string, framework: Framework]> = [
  ["index.tsx", "react"],
  ["index.jsx", "react"],
  ["App.vue", "vue"],
];
const FILE_FRAMEWORKS: Record<string, Framework> = { ".tsx": "react", ".jsx": "react", ".vue": "vue" };

const TEMPLATE = /export\s+const\s+template\b[^=]*=\s*\[([^\]]*)\]/;
const STRING = /(["'`])([^"'`]*)\1/g;

// a .vue file exports it from a plain <script>; <script setup> can't export
const scriptOf = (file: string, src: string): string =>
  file.endsWith(".vue")
    ? [...src.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
        .filter((m) => !/\bsetup\b/.test(m[1]!))
        .map((m) => m[2])
        .join("\n")
    : src;

// read from the source, so listing emails never runs them
const readTemplate = (file: string): DialectName[] => {
  const m = TEMPLATE.exec(scriptOf(file, readFileSync(file, "utf8")));
  if (!m) return [];
  const list = m[1]!;
  if (list.replace(STRING, "").replace(/[\s,]/g, "") !== "")
    throw new Error(`${file}: \`export const template\` must list dialect names as string literals, e.g. ["handlebars", "liquid"]`);
  return [...list.matchAll(STRING)].map(([, , name]) => {
    if (!(name! in dialects)) throw new Error(`${file}: unknown template dialect "${name}" (known: ${Object.keys(dialects).join(", ")})`);
    return name as DialectName;
  });
};

const LANG = /export\s+const\s+lang\b[^=]*=\s*([^;\n]*)/;

const readLang = (file: string): { lang?: string } => {
  const m = LANG.exec(scriptOf(file, readFileSync(file, "utf8")));
  if (!m) return {};
  const value = /^(["'`])([^"'`]*)\1$/.exec(m[1]!.trim())?.[2];
  if (value === undefined || !LANG_TAG.test(value)) throw new Error(`${file}: \`export const lang\` must be a language tag in quotes, e.g. "de" or "pt-BR"`);
  return { lang: value };
};

const dataSets = (dir: string, files: string[]): DataSet[] =>
  files.sort().map((f) => ({ name: f.slice(0, -".json".length), file: join(dir, f) }));

const fromFolder = (dir: string, name: string): EmailEntry | undefined => {
  const found = FOLDER_ENTRIES.filter(([f]) => existsSync(join(dir, f)));
  if (found.length === 0) return undefined;
  if (found.length > 1) throw new Error(`${dir}: more than one email entry (${found.map(([f]) => f).join(", ")}); keep one`);
  const [file, framework] = found[0]!;
  const entry = join(dir, file);
  const json = readdirSync(dir).filter((f) => f.endsWith(".json"));
  return { name, entry, framework, data: dataSets(dir, json), template: readTemplate(entry), ...readLang(entry) };
};

const fromFile = (dir: string, file: string, siblings: string[]): EmailEntry | undefined => {
  const framework = FILE_FRAMEWORKS[extname(file)];
  if (!framework) return undefined;
  const name = file.slice(0, -extname(file).length);
  const json = siblings.filter((f) => f === `${name}.json` || (f.startsWith(`${name}.`) && f.endsWith(".json")));
  const entry = join(dir, file);
  return { name, entry, framework, data: dataSets(dir, json), template: readTemplate(entry), ...readLang(entry) };
};

export const findEmails = (dir: string): EmailEntry[] => {
  const root = resolve(dir);
  const names = readdirSync(root)
    .filter((f) => !f.startsWith(".") && f !== "node_modules")
    .sort();
  const emails: EmailEntry[] = [];
  for (const f of names) {
    const path = join(root, f);
    const email = statSync(path).isDirectory() ? fromFolder(path, f) : fromFile(root, f, names);
    if (!email) continue;
    const clash = emails.find((e) => e.name === email.name);
    if (clash) throw new Error(`Two emails are called "${email.name}": ${clash.entry} and ${email.entry}`);
    emails.push(email);
  }
  return emails.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
};

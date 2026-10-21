import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { parseDataText } from "../vite/find.ts";
import type { EmailEntry } from "../vite/types.ts";

export type HttpError = Error & { status: number };
export const httpError = (status: number, message: string): HttpError => Object.assign(new Error(message), { status });

const FOLDER_ENTRIES = new Set(["index.tsx", "index.jsx", "App.vue"]);

// a folder email keeps its data inside the folder; a single-file one as `<name>.<set>.json` next to it
const isFolderEmail = (e: EmailEntry): boolean =>
  FOLDER_ENTRIES.has(basename(e.entry)) && basename(dirname(e.entry)) === e.name;

export const inside = (parent: string, child: string): boolean => {
  const rel = relative(parent, child);
  return rel !== "" && !rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel);
};

export const parseData = (text: string): Record<string, unknown> => {
  try {
    return parseDataText(text);
  } catch (e) {
    throw httpError(400, (e as Error).message);
  }
};

const pretty = (v: unknown): string => `${JSON.stringify(v, null, 2)}\n`;

const dataFile = (email: EmailEntry, set: string): string => {
  const d = email.data.find((x) => x.name === set);
  if (!d) throw httpError(404, `no data set "${set}" for ${email.name}`);
  return d.file;
};

export const readData = (email: EmailEntry, set: string): string => readFileSync(dataFile(email, set), "utf8");

export const writeData = (dir: string, email: EmailEntry, set: string, text: string): void => {
  const file = dataFile(email, set);
  const value = parseData(text);
  if (!inside(dir, file) || extname(file) !== ".json") throw httpError(403, "refusing to write outside the emails folder");
  writeFileSync(file, pretty(value));
};

// "Summer promo!" -> "summer-promo"; anything that could leave the folder is gone by now
export const sanitizeName = (raw: string): string =>
  raw
    .trim()
    .replace(/\.json$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 64);

// writes a new data file and returns its path; never overwrites
export const createData = (dir: string, email: EmailEntry, rawName: string, text: string): string => {
  const name = sanitizeName(rawName);
  if (!name) throw httpError(400, "the name needs at least one letter or digit");
  const value = parseData(text);
  const folder = dirname(email.entry);
  const file = resolve(folder, isFolderEmail(email) ? `${name}.json` : `${email.name}.${name}.json`);
  if (dirname(file) !== resolve(folder) || !inside(dir, file)) throw httpError(403, "refusing to write outside the email's folder");
  if (existsSync(file)) throw httpError(409, `${basename(file)} already exists`);
  writeFileSync(file, pretty(value), { flag: "wx" });
  return file;
};

export const relPath = (dir: string, file: string): string => relative(dir, file).split(sep).join("/");

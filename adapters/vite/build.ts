import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { CompileOptions, Diagnostic, DialectName } from "../../src/index.ts";
import type { EmailEntry } from "./types.ts";
import { verifyEmail } from "./equivalence.ts";
import { findEmails } from "./find.ts";
import { compileTemplate, type CompiledTemplate } from "./render.ts";
import { createEmailServer } from "./server.ts";

export type BuildOptions = {
  dir: string; // the emails folder
  root?: string; // the Vite root, default cwd (as for the dev server)
  out: string;
  baseUrl?: string | undefined; // where <out>/assets is uploaded
  fileName?: string | undefined; // pattern with [name] and [dialect], relative to out
  compile?: CompileOptions;
  verify?: boolean; // default true: compare each template with the HTML render (docs/templates.md#the-equivalence-check)
};

// one per written file, or per email that wasn't built
export type BuildResult = {
  email: string;
  entry?: string; // the email's own file
  dialect?: DialectName;
  file?: string;
  skipped?: string;
  error?: string; // rendering threw, or the template would lose a field; nothing was written for it
  assets?: string[]; // names written to <out>/assets
  diagnostics: Diagnostic[];
};

const FILE_NAME = "[name].[dialect].html";

const PLAIN = "not a template (no `export const template`); build writes ESP templates, plain emails aren't built yet";

// Where each template email goes, per dialect, all checked before anything is written.
const outFiles = (pattern: string, out: string, emails: EmailEntry[]): Map<string, string> => {
  const bad = [...pattern.matchAll(/\[([^\]]*)\]/g)].find(([, p]) => p !== "name" && p !== "dialect");
  if (bad) throw new Error(`file name "${pattern}": unknown ${bad[0]}; use [name] and [dialect]`);
  const files = new Map<string, string>();
  const owners = new Map<string, string>();
  for (const e of emails)
    for (const dialect of e.template) {
      const file = resolve(out, pattern.replaceAll("[name]", e.name).replaceAll("[dialect]", dialect));
      const rel = relative(out, file);
      if (rel === "" || rel.split(/[\\/]/)[0] === ".." || isAbsolute(rel)) throw new Error(`file name "${pattern}" writes outside the output folder`);
      const who = `${e.name} (${dialect})`;
      const other = owners.get(file);
      if (other) throw new Error(`file name "${pattern}" gives ${rel.replaceAll("\\", "/")} for both ${other} and ${who}; add [dialect] or [name]`);
      owners.set(file, who);
      files.set(`${e.name}\0${dialect}`, file);
    }
  return files;
};

// Every template email, once per dialect, named by `fileName` inside `out`. Files are written even
// with error diagnostics, like `tddr build in.html`, and the caller decides what an error means;
// except a template that would lose what a field fills in (E012, E013): the ESP would send it wrong.
const LOSES_FIELD = new Set(["E012", "E013"]);
export const buildEmails = async (o: BuildOptions): Promise<BuildResult[]> => {
  const emails = findEmails(o.dir);
  const out = resolve(o.out);
  const files = outFiles(o.fileName ?? FILE_NAME, out, emails);
  const vite = await createEmailServer({ root: resolve(o.root ?? process.cwd()), locate: true });
  const results: BuildResult[] = [];
  try {
    for (const email of emails) {
      if (email.template.length === 0) {
        results.push({ email: email.name, entry: email.entry, skipped: PLAIN, diagnostics: [] });
        continue;
      }
      let checked: Diagnostic[] = [];
      let templates = new Map<DialectName, CompiledTemplate>();
      if (o.verify !== false) {
        try {
          ({ diagnostics: checked, templates } = await verifyEmail(vite, email, o));
        } catch (err) {
          results.push({ email: email.name, entry: email.entry, error: (err as Error).message, diagnostics: [] });
          continue;
        }
        if (checked.some((d) => d.code === "E016")) {
          results.push({ email: email.name, entry: email.entry, error: "its templates don't match the HTML render; nothing written", diagnostics: checked });
          continue;
        }
      }
      for (const dialect of email.template) {
        try {
          const t = templates.get(dialect) ?? (await compileTemplate(vite, email, dialect, o));
          const lost = [...new Set(t.diagnostics.filter((d) => d.severity === "error" && LOSES_FIELD.has(d.code)).map((d) => d.code))];
          if (lost.length) {
            const error = `its ${dialect} template would lose what a field fills in (${lost.join(", ")}); nothing written`;
            results.push({ email: email.name, entry: email.entry, dialect, error, diagnostics: [...checked.splice(0), ...t.diagnostics] });
            continue;
          }
          const file = files.get(`${email.name}\0${dialect}`)!;
          mkdirSync(dirname(file), { recursive: true });
          writeFileSync(file, t.template);
          if (t.assets.length) mkdirSync(join(out, "assets"), { recursive: true });
          for (const a of t.assets) copyFileSync(a.from, join(out, "assets", a.name));
          results.push({ email: email.name, entry: email.entry, dialect, file, assets: t.assets.map((a) => a.name), diagnostics: [...checked.splice(0), ...t.diagnostics] });
        } catch (err) {
          results.push({ email: email.name, entry: email.entry, dialect, error: (err as Error).message, diagnostics: [] });
          break; // the other dialects render the same component
        }
      }
    }
  } finally {
    await vite.close();
  }
  return results;
};

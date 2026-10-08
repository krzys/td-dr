import { readFileSync } from "node:fs";
import type { ViteDevServer } from "vite";
import { codes } from "../../src/diagnostics/codes.ts";
import { preview, type Diagnostic, type DialectName } from "../../src/index.ts";
import { engine } from "./engines.ts";
import { parseDataText } from "./find.ts";
import { firstDifference, normalize } from "./normalize/index.ts";
import { compileTemplate, fillTemplate, loadEmail, props, renderReference, type CompiledTemplate } from "./render.ts";
import type { EmailEntry, RenderOptions } from "./types.ts";

const diag = (code: "I005" | "E016", message: string): Diagnostic => ({ code, severity: codes[code].severity, message, hint: codes[code].hint });

// undefined: the two sides agree
export const mismatch = (email: string, what: string, dialect: DialectName, html: string, filled: string): Diagnostic | undefined => {
  const where = firstDifference(normalize(html), normalize(filled));
  return where ? diag("E016", `${email}: the ${dialect} template filled with ${what} differs from the HTML render at ${where}`) : undefined;
};

type Side = { diagnostics: Diagnostic[] };

const errorsOf = (ds: Diagnostic[]): Diagnostic[] =>
  // E015 is the build's own business (images need --base-url) and is on both sides
  ds.filter((d) => d.severity === "error" && d.code !== "E015");

// A template with errors is reported where it is compiled, so it isn't compared. Errors only the
// HTML render has are the finding then, once for the data set.
export const checkFilled = (email: string, what: string, reference: Side & { html: string }, sides: Array<{ dialect: DialectName; diagnostics: Diagnostic[]; html: string }>): Diagnostic[] => {
  const theirs = new Set(sides.flatMap((s) => errorsOf(s.diagnostics).map((d) => d.code)));
  const own = errorsOf(reference.diagnostics).filter((d) => !theirs.has(d.code));
  if (own.length) return own.map((d) => ({ ...d, message: `${email}: the HTML render for ${what}: ${d.message}` }));
  return sides.flatMap((s) => {
    if (errorsOf(s.diagnostics).length) return [];
    const found = mismatch(email, what, s.dialect, reference.html, s.html);
    return found ? [found] : [];
  });
};

type Options = Pick<RenderOptions, "baseUrl" | "compile">;

// The dev server's version for the view on screen: one dialect, the data being shown.
export const checkView = async (
  vite: ViteDevServer,
  email: EmailEntry,
  dialect: DialectName,
  data: unknown,
  o: Options,
  view: { html: string; diagnostics: Diagnostic[]; filled?: "engine" | "preview" },
): Promise<Diagnostic[]> => {
  // preview() stands in for a missing engine, which would only compare the page with itself
  if (view.filled !== "engine") return [];
  try {
    const reference = await renderReference(vite, email, props(email, data), o);
    // the template's own diagnostics are in the view already
    return checkFilled(email.name, "this data", reference, [{ dialect, ...view }]);
  } catch (err) {
    const message = `${email.name}: not checked against the HTML render, which failed: ${(err as Error).message.split("\n")[0]}`;
    return [diag("I005", message)];
  }
};

// what a data set lacks for the dialect's conditions to mean what they mean in JS, if anything
const dataNeeds = (input: string, data: unknown, dialect: DialectName): { message: string; hint: string } | undefined => {
  try {
    preview(input, data as Record<string, unknown>, { dialects: [dialect] });
    return undefined;
  } catch (err) {
    // anything else fails the fill the same way, where it is reported
    if ((err as Error).name !== "TemplateDataError") return undefined;
    const [message = "", hint = ""] = (err as Error).message.replace(/^template data: /, "").split("\nHint: ");
    return { message, hint };
  }
};

export type Verified = { diagnostics: Diagnostic[]; templates: Map<DialectName, CompiledTemplate> };

// Every data set of a template email, in html mode and through each dialect's real engine.
// A dialect without its engine installed, or an email without data, is skipped with an info.
// The templates compiled for the check are returned so a build writes exactly those.
export const verifyEmail = async (vite: ViteDevServer, email: EmailEntry, o: Options = {}): Promise<Verified> => {
  const templates = new Map<DialectName, CompiledTemplate>();
  if (email.data.length === 0)
    return { diagnostics: [diag("I005", `${email.name}: not checked against its templates, it has no data sets (<name>.json beside the email)`)], templates };
  const data = email.data.map((set) => {
    try {
      return { set, value: parseDataText(readFileSync(set.file, "utf8")) };
    } catch (err) {
      throw new Error(`${email.name}: data set "${set.name}": ${(err as Error).message}`);
    }
  });
  const out: Diagnostic[] = [];
  for (const dialect of email.template) {
    if (await engine(vite.config.root, dialect)) templates.set(dialect, await compileTemplate(vite, email, dialect, o));
    else out.push(diag("I005", `${email.name}: ${dialect} not checked, the ${dialect === "liquid" ? "liquidjs" : dialect} package isn't installed`));
  }
  if (templates.size === 0) return { diagnostics: out, templates };
  const loaded = await loadEmail(vite, email);
  for (const { set, value } of data) {
    const reference = await renderReference(vite, email, value, o, loaded);
    const sides = [];
    for (const [dialect, t] of templates) {
      // a data set the dialect's conditions can't read as JS would differ by construction, maybe unseen
      const unmet = dataNeeds(t.input, value, dialect);
      if (unmet) {
        out.push({ ...diag("E016", `${email.name}: data set "${set.name}" doesn't suit the ${dialect} template: ${unmet.message}`), hint: unmet.hint });
        continue;
      }
      const { html } = await fillTemplate(vite, email, dialect, t, value, o);
      sides.push({ dialect, diagnostics: t.diagnostics, html });
    }
    out.push(...checkFilled(email.name, `data set "${set.name}"`, reference, sides));
  }
  return { diagnostics: out, templates };
};

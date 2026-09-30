import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type Intent = {
  status?: string;
  feature?: string;
  expect?: "compile" | "diagnostic";
  codes?: string[];
  viewports?: number[];
  maxDiffRatio?: number; // maxDiffRatio<width> (e.g. maxDiffRatio375) overrides one viewport
  allowSvg?: boolean; // compile with the allowSvg option
  lang?: string; // default en, so I009 shows only where a fixture asks with `lang: none`
  description: string;
  [key: string]: unknown;
};

export type Fixture = { feature: string; name: string; dir: string; input: string; intent: Intent; props?: Record<string, unknown>; variants?: Record<string, Record<string, unknown>> };

const scalar = (raw: string): unknown => {
  const v = raw.trim();
  if (v === "true") return true;
  if (v === "false") return false;
  if (v !== "" && !Number.isNaN(Number(v))) return Number(v);
  const quoted = /^(["'])(.*)\1$/.exec(v);
  return quoted ? quoted[2] : v;
};

// Drops a trailing "# comment", but not a # inside quotes.
const stripComment = (line: string): string => {
  let quote = "";
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "#" && (i === 0 || /\s/.test(line[i - 1]!))) return line.slice(0, i);
  }
  return line;
};

const value = (raw: string): unknown => {
  const v = raw.trim();
  if (v.startsWith("[") && v.endsWith("]")) {
    const inner = v.slice(1, -1).trim();
    return inner === "" ? [] : inner.split(",").map(scalar);
  }
  return scalar(v);
};

export const parseIntent = (text: string): Intent => {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const data: Record<string, unknown> = {};
  let body = lines;
  if (lines[0]?.trim() === "---") {
    const rel = lines.slice(1).findIndex((l) => l.trim() === "---");
    const end = rel === -1 ? -1 : rel + 1;
    if (end === -1) throw new Error("intent.md: frontmatter is never closed");
    for (const line of lines.slice(1, end)) {
      const l = stripComment(line);
      if (l.trim() === "") continue;
      const colon = l.indexOf(":");
      if (colon === -1) throw new Error(`intent.md: can't read line "${line}"`);
      data[l.slice(0, colon).trim()] = value(l.slice(colon + 1));
    }
    body = lines.slice(end + 1);
  }
  return { ...data, description: body.join("\n").trim() };
};

const dirs = (p: string): string[] =>
  readdirSync(p)
    .filter((n) => statSync(join(p, n)).isDirectory())
    .sort();

const defaultRoot = fileURLToPath(new URL("../fixtures", import.meta.url));

export const loadFixtures = (root = defaultRoot): Fixture[] => {
  const base = resolve(root); // vitest resolves snapshot paths from the test file, so dirs must be absolute
  const out: Fixture[] = [];
  for (const feature of dirs(base)) {
    for (const name of dirs(join(base, feature))) {
      const dir = join(base, feature, name);
      const inputPath = join(dir, "input.html");
      const intentPath = join(dir, "intent.md");
      if (!existsSync(inputPath) || !existsSync(intentPath)) {
        throw new Error(`${dir}: needs both input.html and intent.md`);
      }
      const intent = parseIntent(readFileSync(intentPath, "utf8"));
      const exp = intent.expect as unknown;
      if (exp !== undefined && exp !== "compile" && exp !== "diagnostic") {
        throw new Error(`${intentPath}: expect must be "compile" or "diagnostic", got ${JSON.stringify(exp)}`);
      }
      if (intent.status === "active" && exp === undefined) {
        throw new Error(`${intentPath}: active fixtures need an expect`);
      }
      // props.json is the sample data; props.<name>.json are further data sets for the same template
      const propsPath = join(dir, "props.json");
      const props = existsSync(propsPath) ? (JSON.parse(readFileSync(propsPath, "utf8")) as Record<string, unknown>) : undefined;
      if (intent.template !== undefined && exp === "compile" && !props) throw new Error(`${dir}: a template fixture needs props.json`);
      const variants = Object.fromEntries(
        readdirSync(dir)
          .map((n) => /^props\.(.+)\.json$/.exec(n))
          .filter((m): m is RegExpExecArray => m !== null)
          .map((m) => [m[1]!, JSON.parse(readFileSync(join(dir, m[0]), "utf8")) as Record<string, unknown>]),
      );
      out.push({ feature, name, dir, input: readFileSync(inputPath, "utf8"), intent, ...(props ? { props } : {}), ...(Object.keys(variants).length ? { variants } : {}) });
    }
  }
  return out;
};

export const isActive = (f: Fixture): boolean => f.intent.status === "active";

// strict stays on for every fixture; allowSvg and lang are the per-fixture options
export const fixtureOptions = (f: Fixture): { strict: true; allowSvg: boolean; lang?: string } => ({
  strict: true,
  allowSvg: f.intent.allowSvg === true,
  ...(f.intent.lang !== "none" && { lang: f.intent.lang ?? "en" }),
});

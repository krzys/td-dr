#!/usr/bin/env node
import { readFileSync, realpathSync, statSync, watch, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { loadConfig } from "./config-file.ts";
import type { TddrConfig } from "./config.ts";
import { LANG_TAG } from "./ctx.ts";
import { compile, toText, type Diagnostic, type DialectName } from "./index.ts";
import { codes } from "./diagnostics/codes.ts";
import { jsonReport, sarifReport, type Reported } from "./diagnostics/report.ts";
import { decodeCss, decodeHtml } from "./parse/decode.ts";
import { UnknownTargetError } from "./targets/capabilities.ts";

export type CliIO = {
  stdout(s: string): void;
  stderr(s: string): void;
  // bytes are decoded as a browser would (BOM, then <meta charset> or @charset, else UTF-8)
  readFile(path: string): Promise<Uint8Array | string> | Uint8Array | string;
  writeFile(path: string, s: string): Promise<void> | void;
  isDir?(path: string): boolean;
  // calls onChange whenever one of the files may have changed
  watch?(files: string[], onChange: () => void): void;
};

const HELP = `Usage: tddr build <input.html> [options]
       tddr build <emails dir> [options]
       tddr check <input.html | emails dir> [options]
       tddr dev [dir] [options]

Build options:
  -o, --out <path>        HTML file (default stdout); for a folder, the output
                          folder (default dist/emails)
  --targets <a,b>         comma-separated email client targets
  --width <px>            design width (default: the email's root container, else 600)
  --css <file>            extra stylesheet, repeatable (single file only)
  --allow-unsupported     turn errors into warnings
  --allow-svg             keep inline <svg> with a warning (Gmail and Outlook drop it)
  --lang <tag>            the email's language (default: <html lang>, or a component's
                          export const lang, else en)
  --format <f>            diagnostics as text (default, on stderr), json or sarif
                          (on stdout, so a file build needs -o)
  --text                  also write the plain-text part, <name>.txt next to each
                          HTML file (a file build needs -o)
  --watch                 build one file again whenever it or a --css file changes
                          (a file build needs -o); also for check

Folder build:
  --file-name <pattern>   output file per email and dialect, inside --out, from
                          [name] and [dialect] (default [name].[dialect].html)
  --no-verify             skip comparing each template, filled with the email's
                          data sets, against the HTML render

Check (the build options bar -o, --text and --file-name; writes nothing):
  --max-warnings <n>      exit 1 on more than n warnings too, not only on an error

Dev server (dir defaults to ./emails):
  --port <n>              port to listen on (default 3100)
  --host <host>           host to bind (default localhost)

Folder build and dev server:
  --base-url <url>        where images are hosted; a folder build copies them
                          to <out>/assets for you to upload there

tddr.config.ts (.mts, .js, .mjs) in the current directory sets targets, width and
baseUrl for every build; a flag wins over it.

  -h, --help              show this help
  -v, --version           show version
`;

// adapters/dev's startDevServer, as far as the CLI uses it (a test holds the two together)
export type StartDevServer = (o: { dir: string; port?: number; host?: string; baseUrl?: string }) => Promise<{ url: string }>;

const BUILD_FLAGS = ["out", "targets", "width", "css", "allow-unsupported", "allow-svg", "lang", "file-name", "no-verify", "format", "text"] as const;
const DEV_FLAGS = ["port", "host"] as const;
// check builds without writing
const WRITE_FLAGS = ["out", "text", "file-name"] as const;
const FOREIGN = {
  build: [...DEV_FLAGS, "max-warnings"],
  check: [...DEV_FLAGS, ...WRITE_FLAGS],
  dev: [...BUILD_FLAGS, "max-warnings", "watch"],
} as const;

// Adapters load lazily so `tddr build in.html` never imports Vite, an optional peer; tsup emits them
// next to this file. A missing peer is named instead of surfacing as a module-resolution stack.
const adapter = async <T,>(source: string, built: string): Promise<T> => {
  try {
    return (await import(new URL(import.meta.url.endsWith(".ts") ? source : built, import.meta.url).href)) as T;
  } catch (e) {
    const missing = (e as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND" && /Cannot find package '([^']+)'/.exec((e as Error).message)?.[1];
    if (!missing) throw e;
    throw new Error(`folder builds and the dev server need ${missing} in your project: pnpm add -D ${missing}`);
  }
};

type BuildEmails = (o: {
  dir: string;
  out: string;
  baseUrl?: string;
  fileName?: string;
  verify?: boolean;
  compile: { strict: boolean; allowSvg?: boolean; targets?: string[]; width?: number; lang?: string };
}) => Promise<
  Array<{ email: string; entry?: string; dialect?: DialectName; file?: string; skipped?: string; error?: string; assets?: string[]; diagnostics: Diagnostic[] }>
>;

// "file:line:col: severity code: message", then the other places of one said for several, then the hint;
// a folder build's dialect follows the place
const formatDiagnostic = (d: Diagnostic, file: string, dialect?: string): string => {
  const where = `${d.loc ? `${d.loc.file ?? file}:${d.loc.line}:${d.loc.col}` : file}${dialect ? ` (${dialect})` : ""}`;
  const others = (d.locs ?? []).slice(1).map((l) => `${l.file && l.file !== d.loc?.file ? `${l.file}:` : ""}${l.line}:${l.col}`);
  return `${where}: ${d.severity} ${d.code}: ${d.message}\n${others.length > 0 ? `  also at: ${others.join(", ")}\n` : ""}${d.hint ? `  hint: ${d.hint}\n` : ""}`;
};

const FORMATS = ["text", "json", "sarif"] as const;
type Format = (typeof FORMATS)[number];

// Text says each diagnostic on stderr as it comes. JSON and SARIF are one document on stdout, said at
// the end, so what else a build says ("wrote …") goes to stderr instead.
type Reporter = { progress(s: string): void; add(d: Diagnostic, file: string, dialect?: string): void; failed(message: string, file: string, dialect?: string): void; end(): void };
const reporter = (format: Format, io: CliIO): Reporter => {
  const items: Reported[] = [];
  return {
    progress: (s) => (format === "text" ? io.stdout(s) : io.stderr(s)),
    add(diagnostic, file, dialect) {
      if (format === "text") io.stderr(formatDiagnostic(diagnostic, file, dialect));
      else items.push({ diagnostic, file, ...(dialect !== undefined && { dialect }) });
    },
    // an email the folder build wrote nothing for: said on stderr, and an E019 in a report
    failed(message, file, dialect) {
      io.stderr(`${dialect ? `${file} (${dialect})` : file}: ${message}\n`);
      if (format !== "text") items.push({ diagnostic: { code: "E019", severity: "error", message, hint: codes.E019.hint }, file, ...(dialect !== undefined && { dialect }) });
    },
    end() {
      if (format === "json") io.stdout(jsonReport(items));
      if (format === "sarif") io.stdout(sarifReport(items, version()));
    },
  };
};

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

// 1 on an error and, for check --max-warnings, on more warnings than that
const verdict = (errors: boolean, warnings: number, maxWarnings: number | undefined, io: CliIO): number => {
  const over = maxWarnings !== undefined && warnings > maxWarnings;
  if (over) io.stderr(`tddr: ${plural(warnings, "warning")}, more than --max-warnings ${maxWarnings}\n`);
  return errors || over ? 1 : 0;
};

// out.html -> out.txt
const textFile = (html: string): string => `${html.replace(/\.html?$/i, "")}.txt`;

// the plain-text part beside an HTML file the build wrote
const writeText = async (file: string, io: CliIO, report: Reporter, template?: DialectName): Promise<void> => {
  const txt = textFile(file);
  await io.writeFile(txt, toText(text(await io.readFile(file), decodeHtml), template ? { template } : {}));
  report.progress(`wrote ${txt}\n`);
};

const rel = (file: string): string => relative(process.cwd(), file).replaceAll("\\", "/");

const buildDir = async (
  dir: string,
  values: { out?: string; "base-url"?: string; "file-name"?: string; "allow-unsupported"?: boolean; "allow-svg"?: boolean; "no-verify"?: boolean; text?: boolean },
  compile: { targets?: string[]; width?: number; lang?: string },
  io: CliIO,
  report: Reporter,
  check?: { maxWarnings: number | undefined },
): Promise<number> => {
  const out = values.out ?? "dist/emails";
  let results;
  try {
    const { buildEmails } = await adapter<{ buildEmails: BuildEmails }>("../adapters/vite/index.ts", "./vite.js");
    results = await buildEmails({
      dir,
      out,
      ...(values["base-url"] !== undefined && { baseUrl: values["base-url"] }),
      ...(values["file-name"] !== undefined && { fileName: values["file-name"] }),
      ...(values["no-verify"] && { verify: false }),
      ...(check && { write: false }),
      compile: { strict: !values["allow-unsupported"], ...(values["allow-svg"] && { allowSvg: true }), ...compile },
    });
  } catch (e) {
    // a missing peer, a bad --file-name or emails folder; nothing was written
    io.stderr(`tddr: ${(e as Error).message}\n`);
    return 2;
  }
  let failed = false;
  let warnings = 0;
  for (const r of results) {
    const where = r.entry ? rel(r.entry) : r.email;
    if (r.skipped) report.progress(`skipped ${r.email}: ${r.skipped}\n`);
    if (r.error) {
      // a render failure starts with the email's name already
      report.failed(r.error.startsWith(`${r.email}: `) ? r.error.slice(r.email.length + 2) : r.error, where, r.dialect);
      failed = true;
    }
    if (r.file) report.progress(`wrote ${r.file}\n`);
    if (r.file && values.text) {
      try {
        await writeText(r.file, io, report, r.dialect);
      } catch (e) {
        io.stderr(`tddr: ${(e as Error).message}\n`);
        return 2;
      }
    }
    for (const d of r.diagnostics) {
      // a line in the rendered page is in no file anyone wrote, so that place is said as the email's
      // file; one a Vue component marked, in the component (docs/templates.md#native-component-code)
      const { loc, locs, ...rest } = d;
      const inFiles = locs?.filter((l) => l.file).map((l) => ({ ...l, file: rel(l.file!) }));
      const said: Diagnostic = loc?.file ? { ...rest, loc: { ...loc, file: rel(loc.file) }, ...(inFiles && { locs: inFiles }) } : rest;
      report.add(said, where, r.dialect);
      failed ||= d.severity === "error";
      if (d.severity === "warning") warnings++;
    }
  }
  report.end();
  if (values["base-url"] && results.some((r) => r.assets?.length)) report.progress(`images in ${out}/assets go to ${values["base-url"]}\n`);
  return verdict(failed, warnings, check?.maxWarnings, io);
};

const dev = async (args: string[], values: { port?: string; host?: string; "base-url"?: string }, io: CliIO): Promise<number> => {
  const [dir = "emails", ...extra] = args;
  if (extra.length > 0) {
    io.stderr(`tddr: expected "dev [dir]"\n\n${HELP}`);
    return 2;
  }
  let port = 3100;
  if (values.port !== undefined) {
    if (!/^\d+$/.test(values.port) || Number(values.port) > 65535) {
      io.stderr(`tddr: --port must be 0-65535, got "${values.port}"\n`);
      return 2;
    }
    port = Number(values.port);
  }
  if (values.host === "") {
    io.stderr("tddr: --host needs a value\n");
    return 2;
  }
  try {
    const { startDevServer } = await adapter<{ startDevServer: StartDevServer }>("../adapters/dev/index.ts", "./dev.js");
    const server = await startDevServer({
      dir,
      port,
      ...(values.host !== undefined && { host: values.host }),
      ...(values["base-url"] !== undefined && { baseUrl: values["base-url"] }),
    });
    io.stdout(`td;dr dev server: ${server.url}\n`);
    return 0;
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    const msg = err.code === "EADDRINUSE" ? `port ${port} is in use, pick another with --port` : err.message;
    io.stderr(`tddr: ${msg}\n`);
    return 1;
  }
};

const text = (file: Uint8Array | string, decode: (b: Uint8Array) => string): string => (typeof file === "string" ? file : decode(file));

// tddr.config.ts in the directory tddr runs in, or {} without one; undefined when it is wrong
const projectConfig = async (io: CliIO): Promise<TddrConfig | undefined> => {
  try {
    return (await loadConfig(process.cwd()))?.config ?? {};
  } catch (e) {
    io.stderr(`tddr: ${(e as Error).message}\n`);
    return undefined;
  }
};

// the config's base URL, unless --base-url says one; it is for a folder build or dev, one file has none
const withBaseUrl = (values: { "base-url"?: string }, config: TddrConfig): { "base-url"?: string } => {
  const url = values["base-url"] ?? config.baseUrl;
  return url === undefined ? {} : { "base-url": url };
};

const version = (): string => {
  const url = new URL("../package.json", import.meta.url);
  return (JSON.parse(readFileSync(url, "utf8")) as { version: string }).version;
};

export const run = async (argv: string[], io: CliIO): Promise<number> => {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        out: { type: "string", short: "o" },
        targets: { type: "string" },
        width: { type: "string" },
        css: { type: "string", multiple: true },
        "allow-unsupported": { type: "boolean" },
        "allow-svg": { type: "boolean" },
        lang: { type: "string" },
        port: { type: "string" },
        host: { type: "string" },
        "base-url": { type: "string" },
        "file-name": { type: "string" },
        "no-verify": { type: "boolean" },
        format: { type: "string" },
        text: { type: "boolean" },
        "max-warnings": { type: "string" },
        watch: { type: "boolean" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
    });
  } catch (e) {
    io.stderr(`tddr: ${(e as Error).message}\n`);
    return 2;
  }
  const { values, positionals } = parsed;

  if (values.help) {
    io.stdout(HELP);
    return 0;
  }
  if (values.version) {
    io.stdout(`${version()}\n`);
    return 0;
  }

  const [command, ...rest] = positionals;
  // a flag for another command is a typo, not something to ignore
  const foreign = command === "dev" || command === "build" || command === "check" ? FOREIGN[command].find((f) => values[f] !== undefined) : undefined;
  if (foreign) {
    io.stderr(`tddr: --${foreign} doesn't apply to "${command}"\n`);
    return 2;
  }
  if (command === "dev") {
    const config = await projectConfig(io);
    return config ? dev(rest, { ...values, ...withBaseUrl(values, config) }, io) : 2;
  }

  const [input, ...extra] = rest;
  if ((command !== "build" && command !== "check") || !input || extra.length > 0) {
    io.stderr(`tddr: expected "build <input.html>", "check <input.html>" or "dev [dir]"\n\n${HELP}`);
    return 2;
  }
  const checking = command === "check";
  const config = await projectConfig(io);
  if (!config) return 2;

  let width = config.width;
  if (values.width !== undefined) {
    if (!/^\d+$/.test(values.width) || Number(values.width) < 1) {
      io.stderr(`tddr: --width must be a positive integer, got "${values.width}"\n`);
      return 2;
    }
    width = Number(values.width);
  }
  if (values.lang !== undefined && !LANG_TAG.test(values.lang)) {
    io.stderr(`tddr: --lang must be a language tag like de or pt-BR, got "${values.lang}"\n`);
    return 2;
  }
  let maxWarnings: number | undefined;
  if (values["max-warnings"] !== undefined) {
    if (!/^\d+$/.test(values["max-warnings"])) {
      io.stderr(`tddr: --max-warnings must be a whole number, got "${values["max-warnings"]}"\n`);
      return 2;
    }
    maxWarnings = Number(values["max-warnings"]);
  }
  const format = values.format ?? "text";
  if (!(FORMATS as readonly string[]).includes(format)) {
    io.stderr(`tddr: --format must be text, json or sarif, got "${format}"\n`);
    return 2;
  }
  const flagTargets = values.targets
    ?.split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const targets = flagTargets?.length ? flagTargets : config.targets;

  const compileFlags = { ...(targets?.length && { targets }), ...(width !== undefined && { width }), ...(values.lang !== undefined && { lang: values.lang }) };

  if (io.isDir?.(input)) {
    if (values.watch) {
      io.stderr("tddr: --watch takes one file, not a folder; tddr dev rebuilds a folder's emails on save\n");
      return 2;
    }
    if (values.css) {
      io.stderr("tddr: --css doesn't apply to a folder build; import the stylesheet in the email\n");
      return 2;
    }
    const report = reporter(format as Format, io);
    return buildDir(input, { ...values, ...withBaseUrl(values, config) }, compileFlags, io, report, checking ? { maxWarnings } : undefined);
  }
  if (values["base-url"] !== undefined) {
    io.stderr("tddr: --base-url applies to a folder build or dev\n");
    return 2;
  }
  if (values["file-name"] !== undefined) {
    io.stderr("tddr: --file-name applies to a folder build; use -o for one file\n");
    return 2;
  }
  if (values["no-verify"]) {
    io.stderr("tddr: --no-verify applies to a folder build\n");
    return 2;
  }
  if (values.text && !values.out) {
    io.stderr("tddr: --text writes <name>.txt next to the HTML; give -o for it\n");
    return 2;
  }
  if (format !== "text" && !values.out && !checking) {
    io.stderr(`tddr: --format ${format} writes the report to stdout; give -o for the HTML\n`);
    return 2;
  }
  if (values.watch && !values.out && !checking) {
    io.stderr("tddr: --watch writes the HTML on every change; give -o for it\n");
    return 2;
  }

  const once = (): Promise<FileBuild> =>
    buildFile(input, values, compileFlags, checking ? { maxWarnings } : undefined, reporter(format as Format, io), io);
  if (!values.watch) return (await once()).code;

  // the status line after each build; a build that couldn't read its input said why already
  const files = [input, ...(values.css ?? [])];
  return watchFiles(
    files,
    async () => {
      const { diagnostics } = await once();
      if (!diagnostics) return;
      const n = (severity: "error" | "warning"): string => plural(diagnostics.filter((d) => d.severity === severity).length, severity);
      io.stderr(`${checking ? `checked ${input}` : `built ${values.out}`}: ${n("error")}, ${n("warning")}\n`);
    },
    io,
  );
};

// what one file's build said: its exit code, and its diagnostics when it got as far as compiling
type FileBuild = { code: number; diagnostics?: Diagnostic[] };

// One file: compile it with its --css, say the diagnostics, then write -o (or stdout); check writes nothing.
const buildFile = async (
  input: string,
  values: { out?: string; css?: string[]; text?: boolean; "allow-unsupported"?: boolean; "allow-svg"?: boolean },
  options: { targets?: string[]; width?: number; lang?: string },
  check: { maxWarnings: number | undefined } | undefined,
  report: Reporter,
  io: CliIO,
): Promise<FileBuild> => {
  let html: string;
  const css: string[] = [];
  try {
    html = text(await io.readFile(input), decodeHtml);
    for (const f of values.css ?? []) css.push(text(await io.readFile(f), decodeCss));
  } catch (e) {
    io.stderr(`tddr: ${(e as Error).message}\n`);
    return { code: 2 };
  }

  let result;
  try {
    result = compile(html, {
      css,
      strict: !values["allow-unsupported"],
      ...(values["allow-svg"] && { allowSvg: true }),
      ...options,
    });
  } catch (e) {
    if (!(e instanceof UnknownTargetError)) throw e;
    io.stderr(`tddr: ${e.message}\n`);
    return { code: 2 };
  }

  const { diagnostics } = result;
  for (const d of diagnostics) report.add(d, input);
  report.end();
  const errors = diagnostics.some((d) => d.severity === "error");
  if (check) return { code: verdict(errors, diagnostics.filter((d) => d.severity === "warning").length, check.maxWarnings, io), diagnostics };

  if (values.out) {
    try {
      await io.writeFile(values.out, result.html);
      if (values.text) {
        await io.writeFile(textFile(values.out), toText(result.html));
      }
    } catch (e) {
      io.stderr(`tddr: ${(e as Error).message}\n`);
      return { code: 2, diagnostics };
    }
  } else {
    io.stdout(result.html);
  }

  return { code: errors ? 1 : 0, diagnostics };
};

// --watch: build once, then again whenever one of the files changes, until the process is stopped. A
// change while a build runs is built after it; a build that fails or throws is said and waited out.
const watchFiles = async (files: string[], build: () => Promise<void>, io: CliIO): Promise<number> => {
  let running = false;
  let again = false;
  const go = async (): Promise<void> => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    do {
      again = false;
      try {
        await build();
      } catch (e) {
        io.stderr(`tddr: ${(e as Error).message}\n`);
      }
    } while (again);
    running = false;
  };
  // an editor's save is often several events; they settle into one build
  let timer: ReturnType<typeof setTimeout> | undefined;
  io.watch?.(files, () => {
    clearTimeout(timer);
    timer = setTimeout(() => void go(), WATCH_SETTLE_MS);
  });
  io.stderr(`watching ${files.join(", ")}\n`);
  await go();
  return 0;
};

const WATCH_SETTLE_MS = 50;

// Each file's folder is watched rather than the file, so a save that replaces the file (write to a
// temporary, then rename) is still seen.
const watchPaths = (files: string[], onChange: () => void): void => {
  const names = new Map<string, Set<string>>();
  for (const f of files) {
    const dir = dirname(resolve(f));
    names.set(dir, (names.get(dir) ?? new Set()).add(basename(f)));
  }
  for (const [dir, watched] of names) watch(dir, (_, name) => (name === null || watched.has(name) ? onChange() : undefined));
};

// argv[1] can be a symlink (npm/pnpm bins), import.meta.url is already resolved
const isMain = (): boolean => {
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1]!)).href;
  } catch {
    return false;
  }
};
if (isMain()) {
  process.exitCode = await run(process.argv.slice(2), {
    stdout: (s) => void process.stdout.write(s),
    stderr: (s) => void process.stderr.write(s),
    readFile: (p) => readFileSync(p),
    writeFile: (p, s) => writeFileSync(p, s),
    isDir: (p) => statSync(p, { throwIfNoEntry: false })?.isDirectory() ?? false,
    watch: watchPaths,
  });
}

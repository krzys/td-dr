#!/usr/bin/env node
import { readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { LANG_TAG } from "./ctx.ts";
import { compile, type Diagnostic } from "./index.ts";
import { decodeCss, decodeHtml } from "./parse/decode.ts";
import { UnknownTargetError } from "./targets/capabilities.ts";

export type CliIO = {
  stdout(s: string): void;
  stderr(s: string): void;
  // bytes are decoded as a browser would (BOM, then <meta charset> or @charset, else UTF-8)
  readFile(path: string): Promise<Uint8Array | string> | Uint8Array | string;
  writeFile(path: string, s: string): Promise<void> | void;
  isDir?(path: string): boolean;
};

const HELP = `Usage: tddr build <input.html> [options]
       tddr build <emails dir> [options]
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

Folder build:
  --file-name <pattern>   output file per email and dialect, inside --out, from
                          [name] and [dialect] (default [name].[dialect].html)
  --no-verify             skip comparing each template, filled with the email's
                          data sets, against the HTML render

Dev server (dir defaults to ./emails):
  --port <n>              port to listen on (default 3100)
  --host <host>           host to bind (default localhost)

Folder build and dev server:
  --base-url <url>        where images are hosted; a folder build copies them
                          to <out>/assets for you to upload there

  -h, --help              show this help
  -v, --version           show version
`;

// adapters/dev's startDevServer, as far as the CLI uses it (a test holds the two together)
export type StartDevServer = (o: { dir: string; port?: number; host?: string; baseUrl?: string }) => Promise<{ url: string }>;

const BUILD_FLAGS = ["out", "targets", "width", "css", "allow-unsupported", "allow-svg", "lang", "file-name", "no-verify"] as const;
const DEV_FLAGS = ["port", "host"] as const;

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
  Array<{ email: string; entry?: string; dialect?: string; file?: string; skipped?: string; error?: string; assets?: string[]; diagnostics: Diagnostic[] }>
>;

// "file:line:col: severity code: message", then the other places of one said for several, then the hint;
// a folder build's dialect follows the place
const formatDiagnostic = (d: Diagnostic, file: string, dialect?: string): string => {
  const where = `${d.loc ? `${d.loc.file ?? file}:${d.loc.line}:${d.loc.col}` : file}${dialect ? ` (${dialect})` : ""}`;
  const others = (d.locs ?? []).slice(1).map((l) => `${l.file && l.file !== d.loc?.file ? `${l.file}:` : ""}${l.line}:${l.col}`);
  return `${where}: ${d.severity} ${d.code}: ${d.message}\n${others.length > 0 ? `  also at: ${others.join(", ")}\n` : ""}${d.hint ? `  hint: ${d.hint}\n` : ""}`;
};

const rel = (file: string): string => relative(process.cwd(), file).replaceAll("\\", "/");

const buildDir = async (
  dir: string,
  values: { out?: string; "base-url"?: string; "file-name"?: string; "allow-unsupported"?: boolean; "allow-svg"?: boolean; "no-verify"?: boolean },
  compile: { targets?: string[]; width?: number; lang?: string },
  io: CliIO,
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
      compile: { strict: !values["allow-unsupported"], ...(values["allow-svg"] && { allowSvg: true }), ...compile },
    });
  } catch (e) {
    // a missing peer, a bad --file-name or emails folder; nothing was written
    io.stderr(`tddr: ${(e as Error).message}\n`);
    return 2;
  }
  let failed = false;
  for (const r of results) {
    const where = r.entry ? rel(r.entry) : r.email;
    const what = r.dialect ? `${where} (${r.dialect})` : where;
    if (r.skipped) io.stdout(`skipped ${r.email}: ${r.skipped}\n`);
    if (r.error) {
      // a render failure starts with the email's name already
      io.stderr(`${what}: ${r.error.startsWith(`${r.email}: `) ? r.error.slice(r.email.length + 2) : r.error}\n`);
      failed = true;
    }
    if (r.file) io.stdout(`wrote ${r.file}\n`);
    for (const d of r.diagnostics) {
      // a line in the rendered page is in no file anyone wrote, so that place is said as the email's
      // file; one a Vue component marked, in the component (docs/templates.md#native-component-code)
      const { loc, locs, ...rest } = d;
      const inFiles = locs?.filter((l) => l.file).map((l) => ({ ...l, file: rel(l.file!) }));
      const said: Diagnostic = loc?.file ? { ...rest, loc: { ...loc, file: rel(loc.file) }, ...(inFiles && { locs: inFiles }) } : rest;
      io.stderr(formatDiagnostic(said, where, r.dialect));
      failed ||= d.severity === "error";
    }
  }
  if (values["base-url"] && results.some((r) => r.assets?.length)) io.stdout(`images in ${out}/assets go to ${values["base-url"]}\n`);
  return failed ? 1 : 0;
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
  // a flag for the other command is a typo, not something to ignore
  const foreign = (command === "dev" ? BUILD_FLAGS : DEV_FLAGS).find((f) => values[f] !== undefined);
  if ((command === "dev" || command === "build") && foreign) {
    io.stderr(`tddr: --${foreign} doesn't apply to "${command}"\n`);
    return 2;
  }
  if (command === "dev") return dev(rest, values, io);

  const [input, ...extra] = rest;
  if (command !== "build" || !input || extra.length > 0) {
    io.stderr(`tddr: expected "build <input.html>" or "dev [dir]"\n\n${HELP}`);
    return 2;
  }

  let width: number | undefined;
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
  const targets = values.targets
    ?.split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const compileFlags = { ...(targets?.length && { targets }), ...(width !== undefined && { width }), ...(values.lang !== undefined && { lang: values.lang }) };

  if (io.isDir?.(input)) {
    if (values.css) {
      io.stderr("tddr: --css doesn't apply to a folder build; import the stylesheet in the email\n");
      return 2;
    }
    return buildDir(input, values, compileFlags, io);
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

  let html: string;
  const css: string[] = [];
  try {
    html = text(await io.readFile(input), decodeHtml);
    for (const f of values.css ?? []) css.push(text(await io.readFile(f), decodeCss));
  } catch (e) {
    io.stderr(`tddr: ${(e as Error).message}\n`);
    return 2;
  }

  let result;
  try {
    result = compile(html, {
      css,
      strict: !values["allow-unsupported"],
      ...(values["allow-svg"] && { allowSvg: true }),
      ...(width !== undefined && { width }),
      ...(targets?.length && { targets }),
      ...(values.lang !== undefined && { lang: values.lang }),
    });
  } catch (e) {
    if (!(e instanceof UnknownTargetError)) throw e;
    io.stderr(`tddr: ${e.message}\n`);
    return 2;
  }

  for (const d of result.diagnostics) io.stderr(formatDiagnostic(d, input));

  if (values.out) {
    try {
      await io.writeFile(values.out, result.html);
    } catch (e) {
      io.stderr(`tddr: ${(e as Error).message}\n`);
      return 2;
    }
  } else {
    io.stdout(result.html);
  }

  return result.diagnostics.some((d) => d.severity === "error") ? 1 : 0;
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
  });
}

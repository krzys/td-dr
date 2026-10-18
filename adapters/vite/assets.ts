import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, isAbsolute, join, parse, relative } from "node:path";
import { createSink } from "../../src/diagnostics/diagnostic.ts";
import type { Diagnostic } from "../../src/index.ts";
import { DEFAULT_TARGETS, loadCapabilities } from "../../src/targets/capabilities.ts";
import { FIELD_CLOSE, FIELD_OPEN } from "../../src/template/tokens.ts";
import { formatBytes, formatKB } from "../../src/limits.ts";

// docs/support.md#hosted-and-embedded-images: inline an image only where every target shows data: images,
// else it needs a hosted URL. A relative URL is a project file (what Vite gives an imported asset
// or a public file) or, with a base URL, a path hosted under it; an email can't load it as is.

export type AssetOptions = {
  root: string;
  publicDir: string | false;
  baseUrl?: string | undefined; // where the build's assets folder is uploaded
  targets?: readonly string[] | undefined;
  strict?: boolean | undefined;
};
export type AssetFile = { from: string; name: string };
export type Placed = { page: string; diagnostics: Diagnostic[]; files: AssetFile[] };

const INLINE_WARN = 8 * 1024;
const INLINE_MAX = 32 * 1024;
const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif" };

// an <img src> or a CSS url(); group 2 is the URL either way
const URLS = /(<img\b[^>]*?\ssrc=(["']))([^"']*)\2|(url\(\s*(["']?))([^"')]*)\5\s*\)/gi;

// a scheme (https:, data:, cid:), //host, an anchor, or a field the ESP fills with a whole URL
const ABSOLUTE = new RegExp(`^(?:[a-z][a-z0-9+.-]*:|//|#|${FIELD_OPEN})`, "i");
const isRelative = (url: string): boolean => url.trim() !== "" && !ABSOLUTE.test(url.trim());

const FIELD = `${FIELD_OPEN}([^${FIELD_CLOSE}]*)${FIELD_CLOSE}`;
const hasField = (url: string): boolean => new RegExp(FIELD).test(url);
const shown = (url: string): string => url.replace(new RegExp(FIELD, "g"), "{{$1}}");

const within = (dir: string, f: string): boolean => {
  const rel = relative(dir, f);
  return rel.split(/[\\/]/)[0] !== ".." && !isAbsolute(rel);
};

const isFile = (f: string): boolean => existsSync(f) && statSync(f).isFile();

const locAt = (s: string, i: number) => {
  const before = s.slice(0, i);
  const line = before.split("\n").length;
  return { line, col: i - before.lastIndexOf("\n") };
};

export const placeAssets = (page: string, o: AssetOptions): Placed => {
  const sink = createSink(o.strict ?? true);
  const base64 = loadCapabilities(o.targets ?? DEFAULT_TARGETS).check("image-base64");
  const files: AssetFile[] = [];

  const file = (url: string): string | undefined => {
    if (hasField(url)) return undefined;
    const path = decodeURI(url.replace(/[?#].*$/, ""));
    // Vite writes a Windows file outside the root as /@fs/C:/...
    if (path.startsWith("/@fs/")) return [path.slice(4).replace(/^\/(?=[A-Za-z]:)/, "")].find(isFile);
    const dirs = [o.root, ...(o.publicDir ? [o.publicDir] : [])];
    return dirs.map((d) => join(d, path)).find((f, i) => within(dirs[i]!, f) && isFile(f));
  };

  const base = (): string => o.baseUrl!.replace(/\/+$/, "");

  const hosted = (from: string, bytes: Buffer): string => {
    let asset = files.find((f) => f.from === from);
    if (!asset) {
      const { name, ext } = parse(from);
      asset = { from, name: `${name}-${createHash("sha256").update(bytes).digest("hex").slice(0, 8)}${ext}` };
      files.push(asset);
    }
    return `${base()}/${asset.name}`;
  };

  // the URL to write, reporting why when it can't be the right one
  const place = (url: string, img: boolean, at: number): string => {
    const loc = locAt(page, at);
    const from = file(url);
    if (!from) {
      const fs = url.startsWith("/@fs/");
      if (o.baseUrl && !fs) return `${base()}/${url.replace(/^\.?\//, "")}`;
      const message = fs
        ? `${url} isn't a file`
        : hasField(url)
          ? `${shown(url)} is relative, and an email can't load a relative URL`
          : `${url} isn't a file in ${o.root} or its public folder, and an email can't load a relative URL`;
      sink.report("E015", { message, loc });
      return url;
    }
    const bytes = readFileSync(from);
    const mime = MIME[extname(from).toLowerCase()];
    const why = !img
      ? "background images must be hosted (Outlook's VML and most clients fetch them)"
      : base64.status !== "y"
        ? `${(base64.clients.length ? base64.clients : ["some targets"]).join(", ")} don't reliably show data: images`
        : !mime
          ? "only PNG, JPEG and GIF are inlined"
          : bytes.length > INLINE_MAX
            ? `${formatKB(bytes.length)} is too big to inline (over ${formatBytes(INLINE_MAX)})`
            : undefined;
    if (!why) {
      if (bytes.length > INLINE_WARN)
        sink.report("W008", { message: `${url} is inlined as ${formatKB(bytes.length)} (base64 adds a third)`, loc });
      return `data:${mime};base64,${bytes.toString("base64")}`;
    }
    if (o.baseUrl) return hosted(from, bytes);
    sink.report("E015", { message: `${url} needs a hosted URL: ${why}`, loc });
    return url;
  };

  // replacements only change URLs, never line breaks, so locations found in `page` hold in the result
  const out = page.replace(URLS, (m, imgHead: string | undefined, _q, imgUrl: string, cssHead: string | undefined, _q2, cssUrl: string, at: number) => {
    const head = imgHead ?? cssHead!;
    const url = imgHead !== undefined ? imgUrl : cssUrl;
    if (!isRelative(url)) return m;
    return head + place(url, imgHead !== undefined, at + head.length) + m.slice(head.length + url.length);
  });
  return { page: out, diagnostics: sink.list(), files };
};

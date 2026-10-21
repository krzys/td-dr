import { readFile } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inside } from "./data.ts";

// next to this file in the repo, and next to the bundled chunk in dist/
export const UI_DIR = fileURLToPath(new URL("./ui/", import.meta.url));

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

// false when `pathname` isn't one of the page's own files
export const serveUi = async (pathname: string, res: ServerResponse): Promise<boolean> => {
  const rel = pathname === "/" ? "index.html" : pathname.startsWith("/__tddr/ui/") ? pathname.slice("/__tddr/ui/".length) : null;
  if (rel === null) return false;
  const file = resolve(UI_DIR, decodeURIComponent(rel));
  const type = TYPES[extname(file)];
  if (!type || !inside(UI_DIR, file)) return false;
  let body: Buffer;
  try {
    body = await readFile(file);
  } catch {
    return false;
  }
  res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
  return true;
};

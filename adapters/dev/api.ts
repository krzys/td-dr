import type { IncomingMessage, ServerResponse } from "node:http";
import { byteLength, GMAIL_CLIP_BYTES } from "../../src/limits.ts";
import { dialects, type DialectName } from "../../src/template/dialects.ts";
import type { EmailEntry, RenderMode, RenderOptions, Rendered } from "../vite/types.ts";
import { createData, httpError, parseData, readData, writeData } from "./data.ts";
import type { ApiError, ErrorBody, NewData, PageCompileOptions, RenderRequest, RenderResponse, RouteKey, Routes } from "./protocol.ts";

export type ApiDeps = {
  findEmails(dir: string): EmailEntry[];
  renderEmail(email: EmailEntry, o: RenderOptions): Promise<Rendered>;
};

type Ctx = { dir: string; deps: ApiDeps };
type Handler<K extends RouteKey> = (ctx: Ctx, q: URLSearchParams, body: () => Promise<string>) => Promise<Routes[K]["response"]>;

const MAX_BODY = 5 * 1024 * 1024;

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((done, fail) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        fail(httpError(413, "request body too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => done(Buffer.concat(chunks).toString("utf8")));
    req.on("error", fail);
  });

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

const jsonBody = async (body: () => Promise<string>): Promise<Record<string, unknown>> => {
  try {
    const v: unknown = JSON.parse(await body());
    if (isObject(v)) return v;
  } catch {
    // falls through to the same 400
  }
  throw httpError(400, "expected a JSON object body");
};

const email = (ctx: Ctx, name: string): EmailEntry => {
  const e = ctx.deps.findEmails(ctx.dir).find((x) => x.name === name);
  if (!e) throw httpError(404, `no email named "${name}"`);
  return e;
};

const param = (q: URLSearchParams, k: string): string => {
  const v = q.get(k);
  if (!v) throw httpError(400, `missing ?${k}=`);
  return v;
};

// only what the page can set; anything else in the body is ignored
const compileOptions = (v: unknown): PageCompileOptions => {
  if (v === undefined) return {};
  if (!v || typeof v !== "object") throw httpError(400, "compile must be an object");
  const { width, targets, strict, allowSvg } = v as Record<string, unknown>;
  const o: PageCompileOptions = {};
  if (width !== undefined) {
    if (!Number.isInteger(width) || (width as number) < 1) throw httpError(400, "compile.width must be a positive integer");
    o.width = width as number;
  }
  if (targets !== undefined) {
    if (!Array.isArray(targets) || !targets.every((t) => typeof t === "string")) throw httpError(400, "compile.targets must be strings");
    o.targets = targets;
  }
  if (strict !== undefined) {
    if (typeof strict !== "boolean") throw httpError(400, "compile.strict must be a boolean");
    o.strict = strict;
  }
  if (allowSvg !== undefined) {
    if (typeof allowSvg !== "boolean") throw httpError(400, "compile.allowSvg must be a boolean");
    o.allowSvg = allowSvg;
  }
  return o;
};

const isMode = (v: unknown): v is RenderMode => v === "html" || (typeof v === "string" && Object.hasOwn(dialects, v));

// The page's render request, checked field by field: the body is whatever was POSTed.
export const parseRenderRequest = (b: Record<string, unknown>): RenderRequest => {
  if (typeof b.email !== "string") throw httpError(400, "email must be a string");
  const r: RenderRequest = { email: b.email };
  if (b.mode !== undefined) {
    if (!isMode(b.mode)) throw httpError(400, `mode must be "html" or one of ${Object.keys(dialects).join(", ")}`);
    r.mode = b.mode;
  }
  // anything but a set name means no set was chosen, as it always has (callers send `data: {}`)
  if (typeof b.data === "string") r.data = b.data;
  if (b.json !== undefined) r.json = parseData(JSON.stringify(b.json));
  if (b.compile !== undefined) r.compile = compileOptions(b.compile);
  return r;
};

const parseNewData = (b: Record<string, unknown>): NewData => {
  if (typeof b.name !== "string" || typeof b.text !== "string") throw httpError(400, "expected { name, text }");
  return { name: b.name, text: b.text };
};

// Vite and Rollup errors carry the file, position and a code frame
const renderError = (e: unknown): ApiError => {
  const err = (e instanceof Error ? e : new Error(String(e))) as Error & {
    frame?: string;
    id?: string;
    loc?: { file?: string; line?: number; column?: number };
  };
  return {
    message: err.message,
    ...(err.stack && { stack: err.stack }),
    ...(err.frame && { frame: err.frame }),
    ...((err.loc?.file ?? err.id) && { file: err.loc?.file ?? err.id }),
    ...(err.loc?.line !== undefined && { line: err.loc.line, col: err.loc.column ?? 0 }),
  };
};

const list: Handler<"GET /__tddr/api/emails"> = async (ctx) => ({
  dir: ctx.dir,
  emails: ctx.deps.findEmails(ctx.dir).map((e) => ({
    name: e.name,
    framework: e.framework,
    data: e.data.map((d) => d.name),
    template: e.template,
  })),
});

const render: Handler<"POST /__tddr/api/render"> = async (ctx, _q, body) => {
  const req = parseRenderRequest(await jsonBody(body));
  const e = email(ctx, req.email);
  const mode = req.mode ?? "html";
  if (mode !== "html" && !e.template.includes(mode as DialectName)) throw httpError(400, `${e.name} has no "${mode}" template`);
  // no data set chosen: undefined
  const data = req.json ?? (req.data !== undefined ? parseData(readData(e, req.data)) : undefined);
  let r: Rendered;
  try {
    r = await ctx.deps.renderEmail(e, { data, mode, compile: req.compile ?? {} });
  } catch (err) {
    // the component's own bug: report it, keep serving
    throw Object.assign(httpError(500, "render failed"), { detail: renderError(err) });
  }
  // measured here so the page shows the compiler's own numbers (src/limits.ts)
  return { ...r, size: { bytes: byteLength(r.html), limit: GMAIL_CLIP_BYTES } } satisfies RenderResponse;
};

const getData: Handler<"GET /__tddr/api/data"> = async (ctx, q) => {
  const e = email(ctx, param(q, "email"));
  const set = param(q, "set");
  return { name: set, text: readData(e, set) };
};

const putData: Handler<"PUT /__tddr/api/data"> = async (ctx, q, body) => {
  const e = email(ctx, param(q, "email"));
  const set = param(q, "set");
  writeData(ctx.dir, e, set, await body());
  return { name: set };
};

// "save as": a new file next to the email, named from what the user typed
const newData: Handler<"POST /__tddr/api/data"> = async (ctx, q, body) => {
  const e = email(ctx, param(q, "email"));
  const b = parseNewData(await jsonBody(body));
  const file = createData(ctx.dir, e, b.name, b.text);
  // the set name is whatever findEmails calls the new file
  const set = ctx.deps.findEmails(ctx.dir).find((x) => x.name === e.name)?.data.find((d) => d.file === file);
  return { name: set?.name ?? b.name };
};

const ROUTES: { [K in RouteKey]: Handler<K> } = {
  "GET /__tddr/api/emails": list,
  "POST /__tddr/api/render": render,
  "GET /__tddr/api/data": getData,
  "PUT /__tddr/api/data": putData,
  "POST /__tddr/api/data": newData,
};

const send = (res: ServerResponse, status: number, body: Routes[RouteKey]["response"] | ErrorBody): void => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
};

// "null" (a sandboxed frame) or garbage counts as foreign
const sameHost = (origin: string, host: string | undefined): boolean => {
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
};

// false when the path isn't an API route
export const handleApi = async (ctx: Ctx, req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> => {
  if (!url.pathname.startsWith("/__tddr/api/")) return false;
  const key = `${req.method} ${url.pathname}`;
  const route = Object.hasOwn(ROUTES, key) ? (ROUTES[key as RouteKey] as Handler<RouteKey>) : undefined;
  if (!route) {
    send(res, 404, { error: { message: `no route ${req.method} ${url.pathname}` } });
    return true;
  }
  // another site's page can POST here without a preflight; it must not get to write files
  const origin = req.headers.origin;
  if (req.method !== "GET" && origin !== undefined && !sameHost(origin, req.headers.host)) {
    send(res, 403, { error: { message: "cross-origin writes are refused" } });
    return true;
  }
  try {
    send(res, 200, await route(ctx, url.searchParams, () => readBody(req)));
  } catch (e) {
    const err = e as { status?: number; message?: string; detail?: ApiError };
    if (err.status) send(res, err.status, { error: err.detail ?? { message: err.message ?? "" } });
    else send(res, 500, { error: renderError(e) });
  }
  return true;
};

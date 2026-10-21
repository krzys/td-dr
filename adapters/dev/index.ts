import { statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { handleApi, type ApiDeps } from "./api.ts";
import { relPath } from "./data.ts";
import { createHub, EVENTS_PATH, watchDir, type Watcher } from "./events.ts";
import { serveUi } from "./static.ts";

type Middleware = (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => void;

export type DevDeps = ApiDeps & {
  watcher?: Watcher; // without one, fs.watch on `dir`
  imports?(file: string): boolean; // an email has loaded this file, so editing it changes the email
  middlewares?: Middleware; // Vite's, for anything the page doesn't serve (assets the emails import)
  close?(): Promise<void>;
};

export type DevServerOptions = {
  dir: string; // the emails folder
  root?: string; // the Vite root, default cwd
  port?: number; // default 3100, 0 picks a free one
  host?: string; // default localhost
  baseUrl?: string; // where images will be hosted, as for `tddr build`
  deps?: DevDeps;
};

export type DevServer = { url: string; port: number; close(): Promise<void> };

const viteDeps = async (root: string, baseUrl: string | undefined): Promise<DevDeps> => {
  // Vite only loads here, so `tddr build` never pulls it in
  const { createEmailServer, emailImports, findEmails, renderEmail } = await import("../vite/index.ts");
  const { checkView } = await import("../vite/equivalence.ts");
  const vite = await createEmailServer({ root });
  return {
    findEmails,
    renderEmail: async (e, o) => {
      const opts = { ...o, ...(baseUrl !== undefined && { baseUrl }) };
      const r = await renderEmail(vite, e, opts);
      // the build's equivalence check (docs/templates.md#the-equivalence-check), once a data set or editor JSON is chosen
      if (o.mode !== "html" && o.data !== undefined) r.diagnostics.push(...(await checkView(vite, e, o.mode, o.data, opts, r)));
      return r;
    },
    watcher: vite.watcher,
    imports: (file) => emailImports(vite, file),
    middlewares: vite.middlewares,
    close: () => vite.close(),
  };
};

// the email and data set a changed file belongs to, so the page knows what to reload
const owner = (dir: string, deps: ApiDeps, file: string): { email?: string; data?: string } => {
  try {
    for (const e of deps.findEmails(dir)) {
      const d = e.data.find((x) => x.file === file);
      if (d) return { email: e.name, data: d.name };
      if (e.entry === file) return { email: e.name };
    }
  } catch {
    // a half-written folder can make the scan throw; the page still reloads
  }
  return {};
};

export const startDevServer = async (o: DevServerOptions): Promise<DevServer> => {
  const dir = resolve(o.dir);
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`no emails folder at ${dir}`);
  const deps = o.deps ?? (await viteDeps(resolve(o.root ?? process.cwd()), o.baseUrl));
  const hub = createHub();
  const unwatch = watchDir(dir, deps.watcher, (kind, file) =>
    hub.send("change", { kind, file: relPath(dir, file), ...owner(dir, deps, file) }),
    deps.imports,
  );

  const notFound = (res: ServerResponse): void => {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found");
  };

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === EVENTS_PATH) return hub.attach(res);
    if (await handleApi({ dir, deps }, req, res, url)) return;
    if (req.method === "GET" && (await serveUi(url.pathname, res))) return;
    if (deps.middlewares) return deps.middlewares(req, res, () => notFound(res));
    notFound(res);
  };

  const server = createServer((req, res) => {
    handle(req, res).catch((e: unknown) => {
      if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end(String((e as Error)?.message ?? e));
    });
  });

  const host = o.host ?? "localhost";
  try {
    await new Promise<void>((done, fail) => {
      server.once("error", fail);
      server.listen(o.port ?? 3100, host, () => {
        server.off("error", fail);
        done();
      });
    });
  } catch (e) {
    unwatch();
    hub.close();
    await deps.close?.();
    throw e;
  }
  const { port } = server.address() as AddressInfo;
  const shown = host.includes(":") ? `[${host}]` : host;

  return {
    url: `http://${shown}:${port}/`,
    port,
    async close() {
      unwatch();
      hub.close();
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
      await deps.close?.();
    },
  };
};

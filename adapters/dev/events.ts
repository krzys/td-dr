import { existsSync, watch } from "node:fs";
import type { ServerResponse } from "node:http";
import { join, resolve } from "node:path";
import { inside } from "./data.ts";
import type { ChangeKind, EventsPath, ServerEvents } from "./protocol.ts";

export type { ChangeKind } from "./protocol.ts";
export const EVENTS_PATH: EventsPath = "/__tddr/events";
type Listener = (kind: string, file: string) => void;

// the part of chokidar (Vite's watcher) we use
export type Watcher = {
  on(event: "all", cb: Listener): unknown;
  off?(event: "all", cb: Listener): unknown;
  add?(paths: string): unknown;
};

const KINDS = new Set<string>(["add", "change", "unlink", "addDir", "unlinkDir"] satisfies ChangeKind[]);
const IGNORED = /(^|[\\/])(node_modules|\.git)([\\/]|$)/;

// Calls `onChange` for every file event under `dir`, and for files elsewhere that `also` wants (what
// the emails import from outside it). Without a watcher (no Vite) falls back to fs.watch on `dir`.
export const watchDir = (
  dir: string,
  watcher: Watcher | undefined,
  onChange: (kind: ChangeKind, file: string) => void,
  also: (file: string) => boolean = () => false,
): (() => void) => {
  const root = resolve(dir);
  const emit = (kind: string, file: string): void => {
    const abs = resolve(root, file);
    if (!KINDS.has(kind) || IGNORED.test(abs) || !(inside(root, abs) || also(abs))) return;
    onChange(kind as ChangeKind, abs);
  };
  if (watcher) {
    const cb: Listener = (kind, file) => emit(kind, file);
    watcher.add?.(root);
    watcher.on("all", cb);
    return () => void watcher.off?.("all", cb);
  }
  const w = watch(root, { recursive: true }, (type, name) => {
    if (!name) return;
    const abs = join(root, name);
    emit(type === "change" ? "change" : existsSync(abs) ? "add" : "unlink", abs);
  });
  w.on("error", () => {}); // a vanished folder shouldn't take the server down
  return () => w.close();
};

export type Hub = {
  attach(res: ServerResponse): void;
  send<E extends keyof ServerEvents>(event: E, data: ServerEvents[E]): void;
  close(): void;
};

export const createHub = (): Hub => {
  const clients = new Set<ServerResponse>();
  // proxies drop idle streams
  const ping = setInterval(() => clients.forEach((c) => c.write(": ping\n\n")), 25_000);
  ping.unref();
  return {
    attach(res) {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
      res.write("retry: 1000\n\n");
      clients.add(res);
      res.on("close", () => clients.delete(res));
    },
    send(event, data) {
      const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      clients.forEach((c) => c.write(msg));
    },
    close() {
      clearInterval(ping);
      clients.forEach((c) => c.end());
      clients.clear();
    },
  };
};

// The dev page's state, as plain modules: no browser needed.
import { afterEach, describe, expect, test, vi } from "vitest";
import { createDataset, dataSource, parseData, saveAsName } from "../../adapters/dev/ui/dataset.js";
import { chipsFor, countBySeverity, sourceCol } from "../../adapters/dev/ui/diagnostics.js";
import { formatHash, parseHash } from "../../adapters/dev/ui/hash.js";
import {
  clampDock,
  createPrefs,
  dockShown,
  dockSizeAt,
  dockStep,
  dragWidth,
  initialLayout,
  keyWidth,
  resolveView,
  typedWidth,
} from "../../adapters/dev/ui/layout.js";
import { createGate, createLatest } from "../../adapters/dev/ui/requests.js";
import { formatBytes as uiBytes, formatKB as uiKB, sizeView } from "../../adapters/dev/ui/size.js";
import { formatBytes, formatKB, GMAIL_CLIP_BYTES } from "../../src/limits.ts";

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

describe("requests: the newest answer wins", () => {
  afterEach(() => void vi.useRealTimers());

  test("a ticket goes stale once a newer one is taken", () => {
    const gate = createGate();
    const a = gate.begin();
    expect(a.current).toBe(true);
    const b = gate.begin();
    expect([a.current, b.current]).toEqual([false, true]);
  });

  test("an answer that arrives after a newer request's is dropped", async () => {
    const answers = new Map([["a", deferred<string>()], ["b", deferred<string>()]]);
    const done = vi.fn();
    const r = createLatest({ send: (k: string) => answers.get(k)!.promise, done });
    const a = r.run("a");
    const b = r.run("b");
    answers.get("b")!.resolve("B");
    await b;
    answers.get("a")!.resolve("A");
    await a;
    expect(done.mock.calls.map((c) => c[0])).toEqual(["B"]);
  });

  test("in order, each answer is delivered with how long it took", async () => {
    let t = 0;
    const done = vi.fn();
    const r = createLatest({ send: async (k: string) => ((t += 40), k), done, now: () => t });
    await r.run("a");
    await r.run("b");
    expect(done.mock.calls).toEqual([["a", 40], ["b", 40]]);
  });

  test("cancel drops the answer in flight", async () => {
    const d = deferred<string>();
    const done = vi.fn();
    const r = createLatest({ send: () => d.promise, done });
    const run = r.run(undefined);
    r.cancel();
    d.resolve("late");
    await run;
    expect(done).not.toHaveBeenCalled();
  });

  test("busy shows only once a request is slow, and clears when the newest lands", async () => {
    vi.useFakeTimers();
    const busy = vi.fn();
    const quick = deferred<string>();
    const slow = deferred<string>();
    const sends = [quick, slow];
    const r = createLatest({ send: () => sends.shift()!.promise, done: () => {}, busy, slowMs: 300 });
    const a = r.run(undefined);
    vi.advanceTimersByTime(100);
    quick.resolve("x");
    await a;
    vi.advanceTimersByTime(1000);
    expect(busy.mock.calls).toEqual([[false]]);

    const b = r.run(undefined);
    vi.advanceTimersByTime(300);
    expect(busy.mock.calls.at(-1)).toEqual([true]);
    slow.resolve("y");
    await b;
    expect(busy.mock.calls.at(-1)).toEqual([false]);
  });
});

describe("dataset: the editor's state", () => {
  test("a loaded set is saved until edited, and Revert brings the file's text back", () => {
    const ds = createDataset();
    ds.load('{"name":"Ada"}', true);
    expect(ds.view()).toMatchObject({ dirty: false, status: "Saved", pill: "Saved", pillTone: "ok", canSave: false, canRevert: false });
    expect(ds.edit('{"name":"Grace"}')).toBe(true);
    expect(ds.view()).toMatchObject({ dirty: true, status: "Edited — not saved", pill: "Unsaved changes", pillTone: "accent", canSave: true, canRevert: true });
    expect(ds.json).toEqual({ name: "Grace" });
    expect(ds.revert()).toBe('{"name":"Ada"}');
    expect([ds.dirty, ds.json]).toEqual([false, { name: "Ada" }]);
  });

  test("invalid JSON keeps the last valid data for the render, and can't be saved", () => {
    const ds = createDataset();
    ds.load('{"a":1}', true);
    expect(ds.edit('{"a":')).toBe(false);
    expect(ds.json).toEqual({ a: 1 });
    const v = ds.view();
    expect(v).toMatchObject({ invalid: true, statusTone: "bad", pill: "Invalid JSON", pillTone: "warn", canSave: false, canSaveAs: false });
    expect(v.status).toMatch(/JSON/);
    expect(ds.edit("[1]")).toBe(false);
    expect(ds.view().status).toBe("Data must be a JSON object.");
  });

  test("without a set, edits apply live and only Save as is offered", () => {
    const ds = createDataset();
    ds.load("{}\n", false);
    expect(ds.view()).toMatchObject({ status: "No data set — edits apply live", pill: "Not saved to a file", pillTone: "", canSave: false, canSaveAs: true });
    ds.edit('{"x":1}');
    expect(ds.view().canSave).toBe(false);
  });

  test("a notice shows until the next edit; a failure reads as bad", () => {
    const ds = createDataset();
    ds.load("{}", true);
    ds.notice("Saved");
    expect(ds.view()).toMatchObject({ status: "Saved", statusTone: "warn" });
    ds.notice("Save failed: disk full", true);
    expect(ds.view()).toMatchObject({ status: "Save failed: disk full", statusTone: "bad" });
    ds.edit("{ }");
    expect(ds.view().statusTone).toBe("");
  });

  test("a saved, untouched set renders from disk; anything typed goes inline", () => {
    const ds = createDataset();
    ds.load('{"a":1}', true);
    expect(dataSource("promo", ds)).toEqual({ data: "promo" });
    ds.edit('{"a":2}');
    expect(dataSource("promo", ds)).toEqual({ json: { a: 2 } });
    expect(dataSource("", createDataset())).toEqual({ json: {} });
    expect([saveAsName("promo"), saveAsName("")]).toEqual(["promo-copy", "default"]);
    expect(parseData("null")).toEqual({ error: "Data must be a JSON object." });
  });
});

describe("layout: views, widths and the docked panel", () => {
  test("a fresh page follows its hash; a phone starts narrow and compares by overlay", () => {
    expect(initialLayout({}, false)).toEqual({ view: "compiled", cmp: "side", width: 600 });
    expect(initialLayout({ view: "overlay", width: "480" }, false)).toEqual({ view: "overlay", cmp: "overlay", width: 480 });
    expect(initialLayout({ view: "nope", width: "-3" }, true)).toEqual({ view: "compiled", cmp: "overlay", width: 375 });
  });

  test("Compare opens the last compare mode; a phone can't go side by side", () => {
    expect(resolveView("compare", { narrow: false, cmp: "overlay" })).toEqual({ view: "overlay", cmp: "overlay", comparing: true });
    expect(resolveView("side", { narrow: false, cmp: "overlay" })).toEqual({ view: "side", cmp: "side", comparing: true });
    expect(resolveView("side", { narrow: true, cmp: "side" })).toEqual({ view: "overlay", cmp: "overlay", comparing: true });
    expect(resolveView("source", { narrow: false, cmp: "side" })).toEqual({ view: "source", cmp: "side", comparing: false });
  });

  test("on a phone the bottom tabs pick the panel's tab", () => {
    expect(dockShown("data", "preview", false)).toBe("data");
    expect(dockShown("data", "code", true)).toBe("code");
    expect(dockShown("code", "data", true)).toBe("data");
  });

  test("the email width: dragged at twice the move in frame pixels, snapped and kept in range", () => {
    expect(dragWidth(600, 30, 1, 1)).toBe(660);
    expect(dragWidth(600, 30, -1, 1)).toBe(540);
    expect(dragWidth(600, 30, 1, 0.5)).toBe(720);
    expect(dragWidth(600, 3, 1, 1)).toBe(600);
    expect(dragWidth(380, 0, 1, 1)).toBe(375);
    expect(dragWidth(600, -1000, 1, 1)).toBe(200);
    expect([keyWidth(600, "ArrowRight"), keyWidth(600, "ArrowLeft"), keyWidth(2390, "ArrowRight"), keyWidth(600, "Enter")]).toEqual([620, 580, 2400, null]);
    expect([typedWidth(480), typedWidth(199), typedWidth(480.5), typedWidth(2401)]).toEqual([true, false, false, false]);
  });

  test("the panel's size follows the pointer within what leaves room for the email", () => {
    const vp = { width: 1400, height: 900 };
    expect(clampDock(dockSizeAt(false, 1000, 0, vp), false, vp)).toBe(400);
    expect(clampDock(100, false, vp)).toBe(320);
    expect(clampDock(5000, false, vp)).toBe(840);
    expect(clampDock(dockSizeAt(true, 0, 500, vp), true, vp)).toBe(372);
    expect(clampDock(10, true, vp)).toBe(180);
    expect([dockStep("ArrowLeft"), dockStep("ArrowUp"), dockStep("ArrowDown"), dockStep("x")]).toEqual([24, 24, -24, 0]);
  });

  test("preferences round-trip, and a storage that throws reads as defaults", () => {
    const m = new Map<string, string>();
    const prefs = createPrefs(() => ({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) }));
    expect([prefs.format(), prefs.dockPos(), prefs.codeOpen(), prefs.dockSize(false)]).toEqual([true, "right", true, 0]);
    prefs.setFormat(false);
    prefs.setDockPos("bottom");
    prefs.setCodeOpen(false);
    prefs.setDockSize(true, 260);
    expect([prefs.format(), prefs.dockPos(), prefs.codeOpen(), prefs.dockSize(true), prefs.dockSize(false)]).toEqual([false, "bottom", false, 260, 0]);
    expect(Object.fromEntries(m)).toEqual({ "tddr.format": "0", "tddr.dockPos": "bottom", "tddr.codeCollapsed": "1", "tddr.dockH": "260" });

    const broken = createPrefs(() => {
      throw new Error("SecurityError");
    });
    broken.setFormat(false);
    expect([broken.format(), broken.dockPos(), broken.codeOpen()]).toEqual([true, "right", true]);
  });

  test("the hash keeps only what is set, in a fixed order", () => {
    expect(formatHash({ view: "side", email: "a b", data: "", width: 600, mode: undefined })).toBe("#email=a+b&view=side&width=600");
    expect(parseHash("#email=a+b&view=side&junk=1")).toEqual({ email: "a b", view: "side" });
    expect(parseHash("")).toEqual({});
  });
});

describe("size: the compiler's byte policy", () => {
  test("kilobytes are decimal, and read the same as the compiler's messages", () => {
    for (const n of [0, 999, 1000, 1024, 13_508, 101_999, 102_000, 102_401, 2_000_000]) {
      expect(uiKB(n)).toBe(formatKB(n));
      expect(uiBytes(n)).toBe(formatBytes(n));
    }
    expect(uiKB(13_508)).toBe("13.5 KB");
  });

  test("past the limit is clipped, from 88% of it is near; the limit sits at 85% of the meter", () => {
    const at = (bytes: number) => sizeView({ bytes, limit: GMAIL_CLIP_BYTES }, false);
    expect(at(102_001)).toMatchObject({ level: "bad", note: "Clipped by Gmail", title: "Gmail clips messages over 102,000 bytes; this one is 102,001 bytes" });
    expect(at(102_000)).toMatchObject({ level: "warn", note: "Near Gmail limit" });
    expect(at(89_760).level).toBe("warn");
    expect(at(89_759)).toMatchObject({ level: "", note: "", title: "89,759 bytes compiled (Gmail clips messages over 102,000 bytes)" });
    expect(at(102_000).meter).toBeCloseTo(85, 5);
    expect(at(500_000).meter).toBe(100);
    expect(at(51_000)).toMatchObject({ text: "51.0 KB", max: "of 102.0 KB", label: "51.0 KB of the 102.0 KB Gmail clipping limit" });
    expect(sizeView({ bytes: 200_000, limit: 102_000 }, true)).toMatchObject({ level: "", note: "Last good build" });
  });
});

describe("problems: counts and filters", () => {
  const d = (severity: "error" | "warning" | "info") => ({ code: "X", severity, message: "" });

  test("chips only for severities that are there", () => {
    const ds = [d("warning"), d("warning"), d("info")];
    expect(chipsFor(countBySeverity(ds), ds.length)).toEqual([
      { id: "all", text: "All 3", sev: null },
      { id: "warning", text: "2", sev: "warning" },
      { id: "info", text: "1", sev: "info" },
    ]);
    expect(chipsFor(countBySeverity([]), 0)).toEqual([]);
  });

  test("a location's column in Source counts each field marker twice", () => {
    expect(sourceCol("<p>\uE000name\uE001 x</p>", { line: 1, col: 11 })).toBe(12);
    expect(sourceCol("a\n<b>", { line: 2, col: 2 })).toBe(1);
  });
});

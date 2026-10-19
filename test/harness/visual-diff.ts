import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit, type Browser } from "playwright";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { ENGINE, type Engine } from "./engines.ts";

export type DiffOptions = {
  input: string;
  output: string;
  viewport: number;
  maxDiffRatio: number;
  outDir: string;
  browser?: Browser; // pass one in to reuse it across many diffs
};

export type DiffResult = {
  ratio: number;
  pass: boolean;
  paths: { input: string; output: string; diff: string };
};

const HEIGHT = 800;
const RESET = "<style>body{margin:0}</style>";

const FONTS_CONF = fileURLToPath(new URL("fonts.conf", import.meta.url));

// Diff images, one folder per engine (a CI job uploads its own).
export const VISUAL = join(fileURLToPath(new URL("../.visual", import.meta.url)), ENGINE);

const LAUNCHERS = { chromium, firefox, webkit };

// Text is most of what differs between machines, so the browser gets the harness's font setup
// (fonts.conf) and, in Chromium, grayscale text, and refuses to run without Inter rather than fail
// on metrics. A diff always compares one engine with itself.
export const launchBrowser = async (engine: Engine = ENGINE): Promise<Browser> => {
  const browser = await LAUNCHERS[engine].launch({
    env: { ...process.env, FONTCONFIG_FILE: FONTS_CONF },
    ...(engine === "chromium" && { args: ["--disable-lcd-text"] }),
  });
  try {
    await requireInter(browser);
  } catch (e) {
    await browser.close();
    throw e;
  }
  return browser;
};

// "Inter, serif" measures as plain serif only where Inter is missing. An unknown family alone
// won't do: WebKit falls back to the system sans, which fonts.conf points at Inter.
const requireInter = async (browser: Browser): Promise<void> => {
  const page = await browser.newPage();
  try {
    const [inter, fallback] = await page.evaluate(() =>
      ["Inter, serif", "serif"].map((family) => {
        const span = document.createElement("span");
        span.style.cssText = `position:absolute;white-space:nowrap;font:16px ${family}`;
        span.textContent = "The quick brown fox jumps over the lazy dog";
        document.body.append(span);
        return span.getBoundingClientRect().width;
      }),
    );
    if (inter === fallback) {
      throw new Error("the visual tests need the Inter font installed (fonts-inter on Debian and Ubuntu)");
    }
  } finally {
    await page.close();
  }
};

// Anything without an <html> tag is treated as a body fragment.
const wrap = (html: string): string =>
  /<html[\s>]/i.test(html)
    ? html
    : `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`;

const withReset = (html: string): string => {
  const w = wrap(html);
  if (/<head(\s[^>]*)?>/i.test(w)) return w.replace(/<head(\s[^>]*)?>/i, (m) => m + RESET);
  return w.replace(/<html[^>]*>/i, (m) => `${m}<head>${RESET}</head>`);
};

const pngCache = new Map<string, Buffer>();
const solidPng = (w: number, h: number): Buffer => {
  const key = `${w}x${h}`;
  const hit = pngCache.get(key);
  if (hit) return hit;
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) png.data.writeUInt32BE(0x8899aaff, i * 4);
  const buf = PNG.sync.write(png);
  pngCache.set(key, buf);
  return buf;
};

const sizeFromUrl = (url: string): [number, number] => {
  const m = /(\d+)x(\d+)/.exec(url);
  const clamp = (n: number) => Math.min(Math.max(n, 1), 4000);
  return m ? [clamp(Number(m[1])), clamp(Number(m[2]))] : [100, 100];
};

const shoot = async (browser: Browser, html: string, width: number): Promise<PNG> => {
  const ctx = await browser.newContext({ viewport: { width, height: HEIGHT } });
  try {
    const page = await ctx.newPage();
    // No network: images get a placeholder, everything else is dropped.
    await page.route("**/*", (route) => {
      const req = route.request();
      if (req.resourceType() === "image") {
        const [w, h] = sizeFromUrl(req.url());
        return route.fulfill({ status: 200, contentType: "image/png", body: solidPng(w, h) });
      }
      return route.abort();
    });
    await page.setContent(withReset(html), { waitUntil: "load" });
    // WebKit can fire load before the placeholders are decoded, and the shot then has holes
    await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode().catch(() => {}))));
    return PNG.sync.read(await page.screenshot({ fullPage: true }));
  } finally {
    await ctx.close();
  }
};

const pad = (src: PNG, w: number, h: number): PNG => {
  if (src.width === w && src.height === h) return src;
  const out = new PNG({ width: w, height: h });
  out.data.fill(255);
  PNG.bitblt(src, out, 0, 0, src.width, src.height, 0, 0);
  return out;
};

export const renderAndDiff = async (o: DiffOptions): Promise<DiffResult> => {
  const own = !o.browser;
  const browser = o.browser ?? (await launchBrowser());
  try {
    const a = await shoot(browser, o.input, o.viewport);
    const b = await shoot(browser, o.output, o.viewport);
    const w = Math.max(a.width, b.width);
    const h = Math.max(a.height, b.height);
    const pa = pad(a, w, h);
    const pb = pad(b, w, h);
    const diff = new PNG({ width: w, height: h });
    const mismatched = pixelmatch(pa.data, pb.data, diff.data, w, h, { threshold: 0.02, includeAA: false });
    const ratio = mismatched / (w * h);

    mkdirSync(o.outDir, { recursive: true });
    const paths = {
      input: join(o.outDir, "input.png"),
      output: join(o.outDir, "output.png"),
      diff: join(o.outDir, "diff.png"),
    };
    writeFileSync(paths.input, PNG.sync.write(pa));
    writeFileSync(paths.output, PNG.sync.write(pb));
    writeFileSync(paths.diff, PNG.sync.write(diff));
    return { ratio, pass: ratio <= o.maxDiffRatio, paths };
  } finally {
    if (own) await browser.close();
  }
};

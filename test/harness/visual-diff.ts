import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

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

export const launchBrowser = (): Promise<Browser> => chromium.launch();

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

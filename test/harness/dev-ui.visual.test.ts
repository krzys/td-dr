import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { startDevServer, type DevServer } from "../../adapters/dev/index.ts";
import { formatBytes, formatKB, GMAIL_CLIP_BYTES } from "../../src/limits.ts";
import { startTags } from "../../src/template/tags.ts";
import { launchBrowser } from "./visual-diff.ts";

const EXAMPLES = fileURLToPath(new URL("../../examples", import.meta.url));

let browser: Browser;
let server: DevServer;
beforeAll(async () => {
  [browser, server] = await Promise.all([launchBrowser(), startDevServer({ dir: EXAMPLES, port: 0, host: "127.0.0.1" })]);
});
afterAll(async () => {
  await Promise.all([browser?.close(), server?.close()]);
});

const visible = (p: Page) =>
  p.evaluate(() =>
    [".sidebar", ".toolbar", ".stage", ".dock"].filter((s) => {
      const el = document.querySelector(s);
      return el && el.getBoundingClientRect().height > 0;
    }),
  );

// ---- marks and boxes, read from the page
const boxesOf = (p: Page) =>
  p.evaluate(() => Object.fromEntries([...document.querySelectorAll(".hl")].map((o) => [o.parentElement!.id, [Math.round(parseFloat((o as HTMLElement).style.top)), o.textContent]])));
const markOf = (p: Page) =>
  p.evaluate(() => {
    const m = document.querySelector<HTMLElement>(".link-mark.pin");
    const pre = document.getElementById("code-text")!;
    const css = getComputedStyle(pre);
    if (!m) return null;
    const line = Math.round((m.offsetTop - pre.offsetTop - parseFloat(css.paddingTop)) / parseFloat(css.lineHeight)) + 1;
    return { line, text: pre.textContent!.split("\n")[line - 1]!.trim() };
  });
// click the code just inside the `nth` (0-based) occurrence of `needle` in the shown tab
const clickCode = async (p: Page, needle: string, nth = 0) => {
  await p.waitForTimeout(700);
  const xy = await p.evaluate(
    ([n, k]) => {
      const pre = document.getElementById("code-text")!;
      const text = pre.textContent!;
      let at = -1;
      for (let i = 0; i <= (k as number); i++) at = text.indexOf(n as string, at + 1);
      const before = text.slice(0, at).split("\n");
      const idx = before.length - 1;
      const col = before[idx]!.length + 2;
      const css = getComputedStyle(pre);
      const box = pre.parentElement!;
      const lh = parseFloat(css.lineHeight);
      const ctx = document.createElement("canvas").getContext("2d")!;
      ctx.font = css.font;
      const cw = ctx.measureText("0").width;
      box.style.scrollBehavior = "auto";
      box.scrollTop = Math.max(0, idx * lh - 200);
      box.scrollLeft = Math.max(0, col * cw - 150);
      const r = pre.getBoundingClientRect();
      return { x: r.left + parseFloat(css.paddingLeft) + (col + 0.5) * cw, y: r.top + parseFloat(css.paddingTop) + (idx + 0.5) * lh };
    },
    [needle, nth] as const,
  );
  await p.mouse.click(xy.x, xy.y);
  await p.waitForTimeout(300);
};
const openEmail = async (p: Page, hash: string) => {
  await p.goto(`${server.url}#${hash}`);
  await p.waitForSelector(".email.active");
  await p.waitForFunction(() => document.getElementById("size")?.hidden === false);
  await p.waitForTimeout(1200);
};
const tab = (p: Page) => p.evaluate(() => document.querySelector("#code-tabs [aria-selected=true]")?.getAttribute("data-tab"));

describe("dev page marks the exact tag", () => {
  test("html mode: an img or a p in the compiled frame marks that tag in the Compiled tab, not its cell", async () => {
    const p = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await openEmail(p, "email=react-itinerary&view=compare&mode=html");
    const cmp = p.frameLocator("#pane-compiled iframe");
    await cmp.locator("img").first().dispatchEvent("click");
    await p.waitForSelector(".link-mark.pin");
    expect(await tab(p)).toBe("compiled");
    expect((await markOf(p))!.text).toMatch(/^<img/);
    await cmp.locator("p").first().dispatchEvent("click");
    await p.waitForTimeout(300);
    expect((await markOf(p))!.text).toMatch(/^<p[ >]/);
    await p.close();
  });

  test("html mode: the second cell of an element marks and boxes that cell, not the first", async () => {
    // the first card: a painted cell, its table, then a second cell around the content (the 4th and 7th td of the page)
    const res = await fetch(`${server.url}__tddr/api/render`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "react-itinerary", json: JSON.parse(readFileSync(`${EXAMPLES}/react-itinerary/props.json`, "utf8")), mode: "html" }),
    });
    const r = (await res.json()) as { html: string; input: string; trace: ({ line: number; col: number } | undefined)[] };
    const tags = startTags(r.html);
    const key = (i: number) => JSON.stringify(r.trace[i]);
    const cells = tags.flatMap((t, i) => (t.tag === "td" ? [i] : []));
    const lineStarts = r.input.split("\n").reduce<number[]>((a, l) => [...a, a[a.length - 1]! + l.length + 1], [0]);
    const srcTag = (i: number) => {
      const e = r.trace[i];
      return e && startTags(r.input).find((t) => t.start === lineStarts[e.line - 1]! + e.col - 1)?.tag;
    };
    // an element of the page, not the shell around it
    const twin = cells.findIndex((i, k) => srcTag(i) === "div" && cells.slice(0, k).some((j) => key(j) === key(i)));
    expect(twin).toBeGreaterThan(0);

    const p = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await openEmail(p, "email=react-itinerary&view=compare&mode=html");
    const first = cells.findIndex((i) => key(i) === key(cells[twin]!));
    const cmp = p.frameLocator("#pane-compiled iframe");
    await cmp.locator("td").nth(first).dispatchEvent("click");
    await p.waitForSelector(".link-mark.pin");
    const a = (await markOf(p))!;
    await cmp.locator("td").nth(twin).dispatchEvent("click");
    await p.waitForTimeout(300);
    const b = (await markOf(p))!;
    expect(b.text).toMatch(/^<td/);
    expect(b.line).toBeGreaterThan(a.line);

    // and from the code: clicking that td's tag boxes that td
    await clickCode(p, "<td", twin);
    const pane = (await (await p.$("#pane-compiled"))!.boundingBox())!;
    const td = (await cmp.locator("td").nth(twin).boundingBox())!;
    const box = (await boxesOf(p))["pane-compiled"]!;
    expect(Math.abs((box[0] as number) - (td.y - pane.y))).toBeLessThan(3);
    await p.close();
  });

  test("fields mode, Template tab: an image in the compiled frame marks the img, not its cell", async () => {
    const p = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await openEmail(p, "email=react-order-template&view=compare&mode=handlebars&fields=1");
    await p.click('#code-tabs button[data-tab="template"]');
    await p.frameLocator("#pane-compiled iframe").locator("img").first().dispatchEvent("click");
    await p.waitForSelector(".link-mark.pin");
    expect(await tab(p)).toBe("template");
    expect((await markOf(p))!.text).toMatch(/^<img/);
    await p.close();
  });

  test("filled by the engine, Template tab: an image or a p marks its own template tag", async () => {
    const p = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await openEmail(p, "email=react-order-template&view=compare&mode=handlebars&data=standard");
    await p.click('#code-tabs button[data-tab="template"]');
    const cmp = p.frameLocator("#pane-compiled iframe");
    await cmp.locator("img").first().dispatchEvent("click");
    await p.waitForSelector(".link-mark.pin");
    expect((await markOf(p))!.text).toMatch(/^<img/);
    await cmp.locator("p").first().dispatchEvent("click");
    await p.waitForTimeout(300);
    expect((await markOf(p))!.text).toMatch(/^<p[ >]/);
    await p.close();
  });

  test("a folded wrapper clicked in Source boxes the element of its nearest ancestor in the compiled frame", async () => {
    const p = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await openEmail(p, "email=react-itinerary&view=compare&mode=html");
    await p.click('#code-tabs button[data-tab="source"]');
    // the call-to-action div is folded away; its parent is the .wrap div
    await clickCode(p, 'class="cta"');
    const folded = (await boxesOf(p))["pane-compiled"];
    expect(folded).toBeDefined();
    await clickCode(p, 'class="wrap"');
    expect((await boxesOf(p))["pane-compiled"]).toEqual(folded);
    await p.close();
  });
});

describe("dev page on a phone", () => {
  test("shows one panel at a time, picked from the tab bar, without sideways scroll", async () => {
    const p = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await p.goto(server.url);
    await p.waitForFunction(() => document.getElementById("size")?.hidden === false);
    expect(await p.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    expect(new URL(p.url()).hash).toContain("view=compiled");
    expect(new URL(p.url()).hash).toContain("width=375");
    expect(await visible(p)).toEqual([".toolbar", ".stage"]);

    await p.tap('button[data-panel="emails"]');
    expect(await visible(p)).toEqual([".sidebar"]);
    // picking an email takes you to its preview
    await p.tap(".email >> nth=1");
    expect(await visible(p)).toEqual([".toolbar", ".stage"]);

    await p.tap('button[data-panel="code"]');
    expect(await visible(p)).toEqual([".dock"]);
    await p.tap('button[data-panel="data"]');
    expect(await visible(p)).toEqual([".dock"]);
    expect(await p.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await p.close();
  });

  test("sizes a preview that re-rendered while its panel was hidden", async () => {
    const p = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await p.goto(server.url);
    await p.waitForFunction(() => document.getElementById("size")?.hidden === false);
    const height = () => p.$eval("#pane-compiled iframe", (f) => f.getBoundingClientRect().height);
    const full = await height();
    expect(full).toBeGreaterThan(800);
    await p.tap('button[data-panel="data"]');
    await p.fill("#data-text", (await p.inputValue("#data-text")).replace("Maya Okafor", "Maya O."));
    await p.waitForFunction(() => document.querySelector<HTMLIFrameElement>("#pane-compiled iframe")?.srcdoc.includes("Maya O."));
    await p.waitForTimeout(400);
    await p.tap('button[data-panel="preview"]');
    await p.waitForTimeout(100);
    expect(Math.abs((await height()) - full)).toBeLessThan(40);
    await p.close();
  });

  test("shows a render error that has no code frame or stack", async () => {
    const p = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await p.route("**/__tddr/api/render", (r) => r.fulfill({ status: 400, json: { error: { message: "data must be a JSON object" } } }));
    await p.goto(server.url);
    await p.waitForSelector("#render-error:not([hidden])");
    expect(await p.textContent("#render-error")).toBe("Render failedRecovers on the next savedata must be a JSON object");
    await p.close();
  });

  test("doesn't count CRLF data files (git on Windows) as edited", async () => {
    const p = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await p.route("**/__tddr/api/data?*", async (r) => {
      const res = await r.fetch();
      const body = (await res.json()) as { name: string; text: string };
      await r.fulfill({ response: res, json: { ...body, text: body.text.replace(/\n/g, "\r\n") } });
    });
    const dialogs: string[] = [];
    p.on("dialog", (d) => {
      dialogs.push(d.message());
      void d.dismiss();
    });
    await p.goto(server.url);
    await p.waitForSelector(".email.active");
    await p.waitForFunction(() => document.getElementById("data-status")?.textContent === "Saved");
    await p.click(".email >> nth=1");
    await p.waitForFunction(() => document.querySelector(".email.active") === document.querySelectorAll(".email")[1]);
    expect(dialogs).toEqual([]);
    await p.close();
  });

  test("keeps the three-column layout on a desktop", async () => {
    const p = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await p.goto(server.url);
    await p.waitForSelector(".email.active");
    expect(await visible(p)).toEqual([".sidebar", ".toolbar", ".stage", ".dock"]);
    expect(await p.isVisible(".mobile-tabs")).toBe(false);
    await p.close();
  });
  test("shows template fields as chips, docks the panel below, resizes by drag and opens the switcher", async () => {
    const p = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await p.goto(`${server.url}#email=react-order-template`);
    await p.waitForSelector(".email.active");
    await p.waitForFunction(() => document.getElementById("size")?.hidden === false);

    await p.click('#fields button[data-fields="1"]');
    expect(new URL(p.url()).hash).toContain("fields=1");
    await p.waitForFunction(() => document.querySelector<HTMLIFrameElement>("#pane-compiled iframe")?.srcdoc.includes("tddr-chip"));
    await p.waitForFunction(() => /#each order\.items/.test(document.querySelector<HTMLIFrameElement>("#pane-source iframe")?.srcdoc ?? ""));
    expect(await p.$eval("#pane-source iframe", (f) => (f as HTMLIFrameElement).srcdoc)).toContain("{{/each}}");
    await p.click('#fields button[data-fields="0"]');
    await p.waitForFunction(() => !document.querySelector<HTMLIFrameElement>("#pane-compiled iframe")?.srcdoc.includes("tddr-chip"));

    const right = await p.$eval(".dock", (e) => e.getBoundingClientRect().x);
    await p.click('#dockpos button[data-pos="bottom"]');
    const bottom = await p.$eval(".dock", (e) => e.getBoundingClientRect());
    expect(right).toBeGreaterThan(900);
    expect(bottom.width).toBeGreaterThan(1000);
    expect(await p.$eval(".problems", (e) => e.getBoundingClientRect().width)).toBeGreaterThan(300);

    const box = (await (await p.$("#pane-compiled .handle.r"))!.boundingBox())!;
    await p.mouse.move(box.x + 3, box.y + 20);
    await p.mouse.down();
    await p.mouse.move(box.x + 60, box.y + 20, { steps: 5 });
    await p.mouse.up();
    expect(Number(await p.inputValue("#width-custom"))).toBeGreaterThan(640);

    await p.keyboard.press("Control+k");
    await p.waitForSelector("#palette[open]");
    await p.keyboard.type("tailwind");
    await p.keyboard.press("Enter");
    await p.waitForFunction(() => location.hash.includes("react-tailwind-receipt"));
    await p.close();
  });
  test("links elements in the email to their tags in the code, both ways", async () => {
    const p = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await p.goto(`${server.url}#email=react-itinerary&view=compiled`);
    await p.waitForSelector(".email.active");
    await p.waitForFunction(() => document.getElementById("size")?.hidden === false);
    await p.waitForTimeout(600);

    // hovering does nothing; only a click marks anything
    await p.frameLocator("#pane-compiled iframe").locator("td", { hasText: "OUTBOUND" }).last().hover();
    await p.waitForTimeout(300);
    expect(await p.locator(".hl, .link-mark").count()).toBe(0);

    // email -> code: click a heading, the compiled tab marks its start tag
    const frame = p.frameLocator("#pane-compiled iframe");
    await frame.locator("td", { hasText: "OUTBOUND" }).last().click();
    await p.waitForSelector(".link-mark.pin");
    expect(await p.isVisible("#pane-compiled .hl")).toBe(true);

    // code -> email: click on a line, an element in the frame is boxed
    await p.evaluate(() => document.querySelector("#pane-compiled .hl")?.remove());
    const line = (await p.$("#code-text"))!;
    const box = (await line.boundingBox())!;
    await p.mouse.click(box.x + 120, box.y + 6 + 18 * 20 + 9);
    await p.waitForSelector("#pane-compiled .hl");
    await p.close();
  });
  test("links any view to any other: frames, fields and every code tab", async () => {
    const p = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await p.goto(server.url);
    await p.waitForFunction(() => document.getElementById("size")?.hidden === false);
    await p.click('.email:has-text("react-order-template")');
    await p.waitForTimeout(800);
    await p.selectOption("#data-set", "standard");
    await p.click('#views button[data-view="compare"]');
    await p.waitForFunction(() => document.querySelector<HTMLIFrameElement>("#pane-source iframe")?.srcdoc.includes("data-tddr-s"));
    await p.waitForTimeout(1500);
    const src = p.frameLocator("#pane-source iframe");
    const cmp = p.frameLocator("#pane-compiled iframe");
    const boxes = () =>
      p.evaluate(() => Object.fromEntries([...document.querySelectorAll(".hl")].map((o) => [o.parentElement!.id, [Math.round(parseFloat((o as HTMLElement).style.top)), o.textContent]])));
    const tab = () => p.evaluate(() => document.querySelector("#code-tabs [aria-selected=true]")?.getAttribute("data-tab"));
    // the pinned mark: where it is in the text, and how wide
    const mark = () =>
      p.evaluate(() => {
        const m = document.querySelector<HTMLElement>(".link-mark.pin");
        const pre = document.getElementById("code-text")!;
        const css = getComputedStyle(pre);
        const ctx = document.createElement("canvas").getContext("2d")!;
        ctx.font = css.font;
        if (!m) return null;
        const line = Math.round((m.offsetTop - pre.offsetTop - parseFloat(css.paddingTop)) / parseFloat(css.lineHeight)) + 1;
        return { text: pre.textContent!.split("\n")[line - 1]!.trim(), chars: Math.round(m.offsetWidth / ctx.measureText("0").width) };
      });

    // an element of the second repeat in the email: the second repeat in the other email, and its tag in the shown tab
    expect(await src.locator(".item-name").count()).toBe(2);
    await src.locator(".item-name").last().dispatchEvent("click");
    const second = await boxes();
    expect(second["pane-source"]![1]).toBe("p");
    expect(second["pane-compiled"]![1]).toBe("p");
    expect(second["pane-compiled"]![0]).toBe(second["pane-source"]![0]);
    expect(await tab()).toBe("compiled");
    expect((await mark())!.text).toMatch(/^<p /);

    // a filled field in the compiled email: boxed in both, and in the Template tab it is the placeholder itself
    await p.click('#code-tabs button[data-tab="template"]');
    await cmp.locator(".item-name tddr-f, p:has(tddr-f) > tddr-f").first().dispatchEvent("click");
    const field = await boxes();
    expect(field["pane-source"]![1]).toBe("tddr-f");
    expect(field["pane-compiled"]![1]).toBe("tddr-f");
    expect(await tab()).toBe("template");
    const placeholder = await mark();
    expect(placeholder!.chars).toBeLessThan(25);
    expect(placeholder!.text).toContain("{{");

    // a position in the Source tab: its element in both emails, nothing switched
    await p.click('#code-tabs button[data-tab="source"]');
    const at = async (needle: string) => {
      await p.waitForTimeout(700);
      const xy = await p.evaluate((n) => {
        const pre = document.getElementById("code-text")!;
        const lines = pre.textContent!.split("\n");
        const idx = lines.findIndex((l) => l.includes(n));
        const css = getComputedStyle(pre);
        const box = pre.parentElement!;
        const lh = parseFloat(css.lineHeight);
        const ctx = document.createElement("canvas").getContext("2d")!;
        ctx.font = css.font;
        const cw = ctx.measureText("0").width;
        const col = lines[idx]!.indexOf(n) + 2;
        box.style.scrollBehavior = "auto";
        box.scrollTop = Math.max(0, idx * lh - 200);
        box.scrollLeft = Math.max(0, col * cw - 150);
        const r = pre.getBoundingClientRect();
        return { x: r.left + parseFloat(css.paddingLeft) + (col + 0.5) * cw, y: r.top + parseFloat(css.paddingTop) + (idx + 0.5) * lh };
      }, needle);
      await p.mouse.click(xy.x, xy.y);
      await p.waitForTimeout(300);
    };
    await at('class="item-name"');
    const fromCode = await boxes();
    expect(fromCode["pane-source"]![1]).toMatch(/^p/);
    expect(fromCode["pane-compiled"]![1]).toMatch(/^p/);
    // from the code there is no telling which repeat: the first, and how many
    expect(fromCode["pane-compiled"]![1]).toBe("p ×2");
    expect(await tab()).toBe("source");

    // in the Template tab a position inside a placeholder is the field
    await p.click('#code-tabs button[data-tab="template"]');
    await at(">{{item.name}}</p>");
    expect((await boxes())["pane-source"]![1]).toBe("tddr-f");
    await p.close();
  });
  test("a picked problem marks its own line in Source, edge to edge", async () => {
    const p = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    for (const mode of ["html", "handlebars"]) {
      await openEmail(p, `email=react-order-template&mode=${mode}`);
      await p.locator("button.diag-row", { hasText: "border-radius" }).first().click();
      await p.waitForSelector(".line-mark");
      const r = await p.evaluate(() => {
        const m = document.querySelector<HTMLElement>(".line-mark")!;
        const pre = document.getElementById("code-text")!;
        const css = getComputedStyle(pre);
        const line = Number(document.querySelector(".diag.selected .loc")!.textContent!.split(":")[0]);
        return { at: (m.offsetTop - pre.offsetTop - parseFloat(css.paddingTop)) / parseFloat(css.lineHeight) + 1, line, text: pre.textContent!.split("\n")[line - 1]!.trim() };
      });
      expect(r.at, mode).toBe(r.line);
      expect(r.text, mode).toMatch(/^<div class="card"/);
    }
    await p.close();
  });
  test("formats the code panel for reading, and Copy and Download still give the real output", async () => {
    const p = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await p.goto(`${server.url}#email=react-order-template&mode=handlebars`);
    await p.waitForSelector(".email.active");
    await p.waitForFunction(() => document.getElementById("size")?.hidden === false);
    await p.click('#code-tabs button[data-tab="template"]');
    expect(await p.textContent("#code-meta")).toContain("formatted");
    const formatted = await p.textContent("#code-text");
    const lines = (await p.textContent("#code-gutter"))!.split("\n").length;
    await p.click("#code-format");
    const raw = await p.textContent("#code-text");
    expect((await p.textContent("#code-gutter"))!.split("\n").length).toBeLessThan(lines);
    // only whitespace differs between the two views
    expect(formatted!.replace(/\s+/g, "")).toBe(raw!.replace(/\s+/g, ""));
    // the real output is what the download holds, whichever view is on
    await p.click("#code-format");
    const [download] = await Promise.all([p.waitForEvent("download"), p.click("#code-download")]);
    const { readFileSync } = await import("node:fs");
    expect(readFileSync((await download.path())!, "utf8")).toBe(raw);
    await p.close();
  });
});

describe("dev page size readout", () => {
  test("shows the server's byte count and limit in the compiler's decimal kilobytes", async () => {
    const res = await fetch(`${server.url}__tddr/api/render`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "react-itinerary", data: "props", mode: "html" }),
    });
    const { size } = (await res.json()) as { size: { bytes: number; limit: number } };
    expect(size.limit).toBe(GMAIL_CLIP_BYTES);
    const p = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await openEmail(p, "email=react-itinerary&mode=html&data=props");
    expect(await p.textContent("#size-text")).toBe(formatKB(size.bytes));
    expect(await p.textContent("#size-max")).toBe(`of ${formatKB(GMAIL_CLIP_BYTES)}`);
    expect(await p.getAttribute("#size", "title")).toBe(`${formatBytes(size.bytes)} compiled (Gmail clips messages over ${formatBytes(GMAIL_CLIP_BYTES)})`);
    await p.close();
  });
});

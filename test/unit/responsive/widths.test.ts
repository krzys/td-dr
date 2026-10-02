import { describe, expect, it } from "vitest";
import { compile } from "../../../src/index.ts";
import { parseStyle, tokenize } from "../../../src/responsive/diff.ts";

// What a browser that applies the head styles shows at one viewport width, read off the output:
// the inline style of an element, overlaid by the !important class rules whose @media matches.
// The media evaluator is this file's own, so it checks the preludes the compiler writes.

type Block = { prelude: string | undefined; rules: Array<{ cls: string; decls: Array<readonly [string, string]> }> };

const headRules = (html: string): string => /<style>\n((?:@media|\.t-|:root)[\s\S]*?)\n<\/style>/.exec(html)?.[1] ?? "";
const RULE = /^\s*\.(t-[0-9a-z]+) \{ ([^}]*) \}$/;

const blocks = (html: string): Block[] => {
  const out: Block[] = [];
  let open: Block | undefined;
  for (const line of headRules(html).split("\n")) {
    const media = /^@media (.+) \{$/.exec(line);
    if (media) out.push((open = { prelude: media[1]!, rules: [] }));
    else if (line === "}") open = undefined;
    else {
      const r = RULE.exec(line);
      if (!r) continue; // hover, mirrors, :root
      const block = open ?? (out.push({ prelude: undefined, rules: [] }), out[out.length - 1]!);
      block.rules.push({ cls: r[1]!, decls: parseStyle(r[2]!) });
    }
  }
  return out;
};

// screen and (min-width:Apx) and (max-width:Bpx), or (prefers-color-scheme: dark); no hover
const matches = (prelude: string | undefined, width: number, dark: boolean): boolean => {
  if (prelude === undefined) return false;
  if (prelude === "(prefers-color-scheme: dark)") return dark;
  const [type, ...features] = prelude.split(" and ");
  if (type !== "screen") return false;
  return features.every((f) => {
    const m = /^\((min|max)-width:(\d+)px\)$/.exec(f);
    if (!m) return false;
    return m[1] === "min" ? width >= Number(m[2]) : width <= Number(m[2]);
  });
};

// `prop` on the innermost element around `text` that sets it, at `width`, light or dark
const at = (html: string, width: number, text: string, prop: string, dark = false): string | undefined => {
  const body = html.slice(html.indexOf("<body"));
  const pos = body.indexOf(text);
  if (pos < 0) throw new Error(`no "${text}" in the output`);
  const open: string[] = [];
  for (const t of tokenize(body)) {
    if (t.start > pos) break;
    if (t.closing) open.splice(open.findLastIndex((o) => o.startsWith(`<${t.name}`)), 1);
    else if (!/^<(img|br|hr|meta|source|col|wbr)\b/.test(t.text)) open.push(t.text);
  }
  const active = blocks(html).filter((b) => matches(b.prelude, width, dark));
  for (const tag of open.reverse()) {
    const classes = /\sclass="([^"]*)"/.exec(tag)?.[1]?.split(/\s+/) ?? [];
    let value = parseStyle(/\sstyle="([^"]*)"/.exec(tag)?.[1] ?? "").findLast(([p]) => p === prop)?.[1];
    for (const b of active) for (const r of b.rules) if (classes.includes(r.cls)) value = r.decls.findLast(([p]) => p === prop)?.[1] ?? value;
    if (value !== undefined) return value;
  }
  return undefined;
};

const preludes = (html: string): string[] => blocks(html).flatMap((b) => (b.prelude ? [b.prelude] : []));
const page = (css: string, body = '<div class="x">Weekend sale</div>'): string =>
  `<style>.wrap{max-width:600px;margin:0 auto} .x{padding:40px;font-size:30px}${css}</style><div class="wrap">${body}</div>`;

describe("two desktop-first breakpoints (600px, 480px)", () => {
  const out = compile(page("@media (max-width:600px){.x{padding:24px;font-size:26px}} @media (max-width:480px){.x{padding:12px;font-size:20px}}"));

  it("writes one range per answer, widest first, edges exact", () => {
    expect(preludes(out.html)).toEqual(["screen and (min-width:481px) and (max-width:600px)", "screen and (max-width:480px)"]);
  });

  it.each([
    [1024, "40px", "30px"],
    [768, "40px", "30px"],
    [601, "40px", "30px"],
    [600, "24px", "26px"],
    [481, "24px", "26px"],
    [480, "12px", "20px"],
    [414, "12px", "20px"],
    [375, "12px", "20px"],
    [320, "12px", "20px"],
  ])("at %ipx: padding %s, font-size %s", (width, padding, size) => {
    expect(at(out.html, width, "Weekend sale", "padding")).toBe(padding);
    expect(at(out.html, width, "Weekend sale", "font-size")).toBe(size);
  });
});

describe("query forms and their edges", () => {
  it.each([
    ["(max-width:480px)", "screen and (max-width:480px)", 480, 481],
    ["(max-width:30em)", "screen and (max-width:480px)", 480, 481],
    ["(width <= 480px)", "screen and (max-width:480px)", 480, 481],
    ["(width < 480px)", "screen and (max-width:479px)", 479, 480],
    ["(max-width:480.5px)", "screen and (max-width:480px)", 480, 481],
  ])("%s becomes %s: on at %i, off at %i", (query, prelude, on, off) => {
    const out = compile(page(`@media ${query}{.x{padding:12px}}`));
    expect(preludes(out.html)).toEqual([prelude]);
    expect(at(out.html, on, "Weekend sale", "padding")).toBe("12px");
    expect(at(out.html, off, "Weekend sale", "padding")).toBe("40px");
  });

  it("a min-width and max-width range is one rule with both edges", () => {
    const out = compile(page("@media (min-width:600px) and (max-width:900px){.x{padding:20px}}"));
    expect(preludes(out.html)).toEqual(["screen and (min-width:600px) and (max-width:900px)"]);
    expect([599, 600, 768, 900, 901].map((w) => at(out.html, w, "Weekend sale", "padding"))).toEqual(["40px", "20px", "20px", "20px", "40px"]);
  });

  it("mobile-first: the desktop value is inline and the narrow one is a max-width rule", () => {
    const out = compile(page(".x{padding:8px} @media (min-width:481px){.x{padding:24px}}"));
    expect(out.html).toMatch(/style="padding:24px/);
    expect(preludes(out.html)).toEqual(["screen and (max-width:480px)"]);
    expect([320, 414, 480, 481, 768, 1024].map((w) => at(out.html, w, "Weekend sale", "padding"))).toEqual(["8px", "8px", "8px", "24px", "24px", "24px"]);
  });

  it("mobile-first with two steps: both edges of the middle range", () => {
    const out = compile(page(".x{padding:8px} @media (min-width:481px){.x{padding:16px}} @media (min-width:769px){.x{padding:32px}}"));
    expect(preludes(out.html)).toEqual(["screen and (min-width:481px) and (max-width:768px)", "screen and (max-width:480px)"]);
    expect([320, 480, 481, 768, 769, 1024].map((w) => at(out.html, w, "Weekend sale", "padding"))).toEqual(["8px", "8px", "16px", "16px", "32px", "32px"]);
  });

  it("a query below the design width that changes nothing writes no rule", () => {
    const out = compile(page("@media (max-width:480px){.x{padding:40px}}"));
    expect(preludes(out.html)).toEqual([]);
  });
});

describe("width, dark and hover in one email", () => {
  const css = "@media (max-width:480px){.x{padding:12px}} @media (prefers-color-scheme:dark){.x{color:#eeeeee;background-color:#111111}} .x:hover{color:#ff0000}";
  const out = compile(page(css), { lang: "en" });
  const head = headRules(out.html);

  it("each condition gets its own rules, in order: widths, dark and its mirrors, hover", () => {
    expect(out.diagnostics).toEqual([]);
    const order = [
      ":root { color-scheme: light dark; supported-color-schemes: light dark; }",
      "@media screen and (max-width:480px) {",
      "@media (prefers-color-scheme: dark) {",
      "[data-ogsc] .t-",
      "[data-ogsb] .t-",
      ":hover { color:#ff0000 !important; }",
    ].map((s) => head.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("all three classes sit on the cell next to the light, desktop inline values", () => {
    expect(out.html).toMatch(/<td class="t-0 t-1 t-2" style="padding:40px;[^"]*"/);
    expect(head).toContain("padding:12px !important;");
    expect(head).toMatch(/\.t-1 \{ background-color:#111111 !important; color:#eeeeee !important; \}/);
    expect(head).toContain(".t-2:hover { color:#ff0000 !important; }");
  });

  it("the width rule applies at its widths only, in light and dark", () => {
    for (const dark of [false, true]) {
      expect(at(out.html, 480, "Weekend sale", "padding", dark)).toBe("12px");
      expect(at(out.html, 481, "Weekend sale", "padding", dark)).toBe("40px");
    }
  });

  it("the dark rule applies at every width in dark mode only", () => {
    for (const width of [320, 480, 481, 1024]) {
      expect(at(out.html, width, "Weekend sale", "color", true)).toBe("#eeeeee");
      expect(at(out.html, width, "Weekend sale", "background-color", true)).toBe("#111111");
      expect(at(out.html, width, "Weekend sale", "color")).not.toBe("#eeeeee");
      expect(at(out.html, width, "Weekend sale", "background-color")).not.toBe("#111111");
    }
  });

  it("a width query nested in prefers-color-scheme (or the other way) is W001 and adds no rule", () => {
    for (const nested of ["@media (prefers-color-scheme:dark){@media (max-width:480px){.x{color:#eeeeee}}}", "@media (max-width:480px){@media (prefers-color-scheme:dark){.x{color:#eeeeee}}}"]) {
      const o = compile(page(nested), { lang: "en" });
      expect(o.diagnostics.map((d) => [d.code, d.message])).toEqual([["W001", expect.stringContaining("(prefers-color-scheme) with a width query, nested, is not applied")]]);
      expect(o.html).not.toContain("#eeeeee");
    }
  });

  it("a width and a scheme in one query is W001 too", () => {
    const o = compile(page("@media (max-width:480px) and (prefers-color-scheme:dark){.x{color:#eeeeee}}"), { lang: "en" });
    expect(o.diagnostics.map((d) => d.code)).toEqual(["W001"]);
    expect(o.html).not.toContain("#eeeeee");
  });

  it("hover inside a width query is W001", () => {
    const o = compile(page("@media (max-width:480px){.x:hover{color:#eeeeee}}"), { lang: "en" });
    expect(o.diagnostics.map((d) => d.code)).toContain("W001");
    expect(o.html).not.toContain("#eeeeee");
  });
});

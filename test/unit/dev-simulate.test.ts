// Client simulation in the dev page's Compiled frame: string rewrites of the compiled email.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { chipify } from "../../adapters/dev/ui/fields.js";
import { formatHash, parseHash } from "../../adapters/dev/ui/hash.js";
import { scanTags } from "../../adapters/dev/ui/link.js";
import {
  BLOCKED,
  darkBackground,
  darkText,
  forcedDark,
  luminance,
  noImages,
  noMedia,
  noStyle,
  parseColor,
  parseSims,
  SIMS,
  simulate,
  type Sim,
} from "../../adapters/dev/ui/simulate.js";
import caniemail from "../../src/targets/data/caniemail.json" with { type: "json" };

const tags = (html: string) => scanTags(html).tags.map((t) => t.tag);

describe("simulate: no <style>", () => {
  test("every <style> is emptied, not removed; inline styles and comments stay", () => {
    const html =
      '<html><head><style>p{color:red}</style><!--[if mso]><style>td{x:y}</style><![endif]--></head><body><style>a{b:c}</style><p style="color:blue">x</p></body></html>';
    expect(noStyle(html)).toBe(
      '<html><head><style></style><!--[if mso]><style>td{x:y}</style><![endif]--></head><body><style></style><p style="color:blue">x</p></body></html>',
    );
  });

  test("the Fields view's chip style is the preview's own", () => {
    const html = chipify("<html><head><style>p{}</style></head><body>{{ name }}</body></html>");
    expect(noStyle(html)).toContain(".tddr-chip{");
    expect(noStyle(html)).toContain("<style></style>");
  });

  test("markup inside <title> or <script> isn't taken for tags", () => {
    expect(noStyle("<title><style>t</style></title><style>s</style>")).toBe("<title><style>t</style></title><style></style>");
  });
});

describe("simulate: no @media", () => {
  test("drops @media blocks, nested braces and all, and keeps the rest", () => {
    const css = "a{b:c}@media (max-width:600px){.x{d:e}.y{f:g}}h1{i:j}@MEDIA screen{k{l:m}}";
    expect(noMedia(`<style>${css}</style>`)).toBe("<style>a{b:c}h1{i:j}</style>");
  });

  test("braces and @media in strings and comments don't count", () => {
    const css = '/* @media x { */ a{content:"}"}@media y{b{content:"{"}}c{d:e}';
    expect(noMedia(`<style>${css}</style>`)).toBe('<style>/* @media x { */ a{content:"}"}c{d:e}</style>');
  });

  test("inline styles are untouched", () => {
    const html = '<p style="color:red">@media</p>';
    expect(noMedia(html)).toBe(html);
  });
});

describe("simulate: images off", () => {
  test("an <img> keeps its alt and size but loses its source, drawn as a dashed box", () => {
    expect(noImages('<img src="a.png" srcset="a2.png 2x" alt="Logo" width="120" style="display:block">')).toBe(
      `<img alt="Logo" width="120" style="display:block;${BLOCKED}">`,
    );
    expect(noImages("<img src=a.png />")).toBe(`<img style="${BLOCKED}" />`);
    expect(noImages("<picture><source srcset='b.webp'><img src='b.png' alt=''></picture>")).toBe(
      `<picture><source><img alt='' style="${BLOCKED}"></picture>`,
    );
  });

  test("background images go, attribute and CSS; colours stay", () => {
    expect(noImages('<td background="bg.jpg" bgcolor="#fff" style="background:#fff url(bg.jpg) no-repeat;color:red">')).toBe(
      '<td bgcolor="#fff" style="background:#fff none no-repeat;color:red">',
    );
    expect(noImages('<style>.h{background-image:url("data:image/png;base64,AA==");color:red}</style>')).toBe(
      "<style>.h{background-image:none;color:red}</style>",
    );
    expect(noImages("<style>@font-face{src:url(f.woff2)}</style>")).toBe("<style>@font-face{src:url(f.woff2)}</style>");
  });

  test("an image inside a comment (an Outlook conditional) is left for the comment", () => {
    const html = '<!--[if mso]><v:image src="a.png"/><img src="a.png"><![endif]-->';
    expect(noImages(html)).toBe(html);
  });
});

describe("simulate: forced dark", () => {
  test("reads hex, rgb() and the two names", () => {
    expect(parseColor("#fff")).toEqual([255, 255, 255, 1]);
    expect(parseColor("#11223380")).toEqual([17, 34, 51, 128 / 255]);
    expect(parseColor("rgba(255, 255, 255, 0.25)")).toEqual([255, 255, 255, 0.25]);
    expect(parseColor("rgb(0 0 0 / 50%)")).toEqual([0, 0, 0, 0.5]);
    expect(parseColor("Black")).toEqual([0, 0, 0, 1]);
    expect([parseColor("#12345"), parseColor("var(--x)"), parseColor("red")]).toEqual([null, null, null]);
  });

  test("light backgrounds go dark and dark text goes light, keeping hue and alpha", () => {
    expect(darkBackground("#ffffff")).toBe("#141414");
    expect(darkBackground("rgba(255,255,255,.5)")).toBe("rgba(20,20,20,0.5)");
    expect(darkText("#000")).toBe("#ebebeb");
    expect(darkText("#333333")).toBe("#d6d6d6");
    // already dark backgrounds and already light text stay as they are
    expect(darkBackground("#1a1a2e")).toBe("#1a1a2e");
    expect(darkText("#f0f0f0")).toBe("#f0f0f0");
    expect(darkBackground("transparent")).toBe("transparent");
    // a pale blue stays blue: darker, and with more blue than red
    const bg = parseColor(darkBackground("#e8f0fe"))!;
    expect(luminance(bg)).toBeLessThan(0.05);
    expect(bg[2]).toBeGreaterThan(bg[0]);
    // a dark link colour turned light reads on the dark page (WCAG AA, 4.5:1)
    const contrast = (a: string, b: string) => {
      const [x, y] = [a, b].map((c) => luminance(parseColor(c)!) + 0.05).sort((p, q) => q - p);
      return x! / y!;
    };
    expect(contrast(darkText("#3454d1"), darkBackground("#ffffff"))).toBeGreaterThan(4.5);
  });

  test("rewrites the colour attributes and declarations, not images or borders", () => {
    const html =
      '<html><head><style>.a{background-color:#f4f4f4;color:#222!important;border:1px solid #ddd}</style></head>' +
      '<body bgcolor="#ffffff" text="#000000"><table style="background:#fff url(x.png?c=#fff);color:#111">' +
      '<td><font color="black">x</font><img src="a.png"></td></table></body></html>';
    expect(forcedDark(html)).toBe(
      '<html><head><style>.a{background-color:#1a1a1a;color:#dddddd!important;border:1px solid #ddd}</style>' +
        "<style>:where(html){background:#141414;color:#ebebeb}</style></head>" +
        '<body bgcolor="#141414" text="#ebebeb"><table style="background:#141414 url(x.png?c=#fff);color:#e4e4e4">' +
        '<td><font color="#ebebeb">x</font><img src="a.png"></td></table></body></html>',
    );
  });

  test("a class or id named like a property isn't a declaration", () => {
    expect(forcedDark("<style>.color:hover{color:#000}#background{x:y}</style>")).toBe(
      "<style>:where(html){background:#141414;color:#ebebeb}</style><style>.color:hover{color:#ebebeb}#background{x:y}</style>",
    );
  });
});

describe("simulate: modes together", () => {
  test("composes in a fixed order; no @media is moot once <style> is gone", () => {
    const html = "<head><style>@media x{a{b:c}}p{color:#000}</style></head><img src=a>";
    expect(simulate(html, [])).toBe(html);
    expect(simulate(html, ["nomedia", "nostyle"])).toBe(noStyle(html));
    expect(simulate(html, ["dark", "noimages", "nomedia"])).toBe(forcedDark(noImages(noMedia(html))));
  });

  test("the hash keeps the modes as one list, known ids only, in order", () => {
    expect(parseSims("dark,nostyle,junk,dark")).toEqual(["nostyle", "dark"]);
    expect(parseSims(undefined)).toEqual([]);
    expect(formatHash({ email: "a", sim: "noimages,dark" })).toBe("#email=a&sim=noimages%2Cdark");
    expect(parseHash("#email=a&sim=noimages%2Cdark")).toEqual({ email: "a", sim: "noimages,dark" });
  });
});

// every element is still there in the same order, so the frame lines up with the code by start tag
describe("simulate: the compiled goldens keep their elements", () => {
  const ROOT = "test/fixtures";
  const goldens = ["real-world", "frameworks", "complex"].flatMap((g) =>
    readdirSync(join(ROOT, g), { withFileTypes: true }).flatMap((d) => {
      try {
        return [[`${g}/${d.name}`, readFileSync(join(ROOT, g, d.name, "expected.html"), "utf8")] as const];
      } catch {
        return [];
      }
    }),
  );

  test("there are goldens with head styles and images to try", () => {
    expect(goldens.length).toBeGreaterThan(10);
    expect(goldens.some(([, html]) => /@media/.test(html) && /<img/.test(html))).toBe(true);
  });

  test.each(goldens)("%s", (_name, html) => {
    const before = tags(html);
    for (const sims of [["nostyle"], ["nomedia"], ["noimages"]] as Sim[][]) expect(tags(simulate(html, sims))).toEqual(before);
    const dark = tags(simulate(html, ["dark"]));
    const extra = dark.findIndex((t, i) => t !== before[i]);
    expect(dark.length).toBe(before.length + 1);
    expect(dark[extra]).toBe("style");
    expect([...dark.slice(0, extra), ...dark.slice(extra + 1)]).toEqual(before);
  });
});

// the clients named next to a mode are ones caniemail tests as not supporting what it takes away
describe("simulate: named clients", () => {
  type Feature = { slug: string; stats: Record<string, Record<string, Record<string, string>>> };
  const features = caniemail.data as unknown as Feature[];
  const families = caniemail.nicenames.family as Record<string, string>;

  test.each(SIMS.filter((s) => s.like))("$label", (s) => {
    const feature = features.find((f) => f.slug === s.feature);
    expect(feature, s.feature).toBeDefined();
    expect(s.seen?.length).toBeGreaterThan(0);
    for (const [family, platform] of s.seen ?? []) {
      const tests = Object.values(feature?.stats[family]?.[platform] ?? {});
      expect(tests.at(-1), `${family} ${platform}`).toMatch(/^n\b/);
      expect(s.like).toContain(families[family]);
    }
  });

  test("Outlook on Windows is named for the versions that drop @media", () => {
    const media = features.find((f) => f.slug === "css-at-media")!;
    const windows = media.stats["outlook"]!["windows"]!;
    for (const v of ["2007", "2010", "2013", "2016", "2019"]) expect(windows[v]).toMatch(/^n\b/);
    expect(SIMS.find((s) => s.id === "nomedia")?.like).toContain("Outlook 2007–2019");
  });

  test("modes with nothing in caniemail to check name no clients", () => {
    for (const s of SIMS.filter((x) => !x.feature)) expect(s.like).toBeUndefined();
  });
});

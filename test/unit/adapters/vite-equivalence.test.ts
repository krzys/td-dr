import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startDevServer } from "../../../adapters/dev/index.ts";
import { run, type CliIO } from "../../../src/cli.ts";
import { buildEmails, createEmailServer, findEmails } from "../../../adapters/vite/index.ts";
import { checkFilled, mismatch, verifyEmail as verified } from "../../../adapters/vite/equivalence.ts";
import { firstDifference, normalize } from "../../../adapters/vite/normalize/index.ts";

// engines are optional dependencies; a test can hide one
const hidden = vi.hoisted(() => new Set<string>());
vi.mock("../../../adapters/vite/engines.ts", async (original) => {
  const real = await original<typeof import("../../../adapters/vite/engines.ts")>();
  return { ...real, engine: (root: string, d: "handlebars" | "liquid") => (hidden.has(d) ? Promise.resolve(undefined) : real.engine(root, d)) };
});

const repo = resolve(import.meta.dirname, "../../..");
const root = resolve(import.meta.dirname, "../../vite-equivalence");
const email = (name: string) => findEmails(root).find((e) => e.name === name)!;

const verifyEmail = async (...a: Parameters<typeof verified>) => (await verified(...a)).diagnostics;

const folder = (files: Record<string, string>): string => {
  const dir = mkdtempSync(join(tmpdir(), "tddr-equiv-tmp-"));
  for (const [f, text] of Object.entries(files)) {
    mkdirSync(join(dir, f, ".."), { recursive: true });
    writeFileSync(join(dir, f), text);
  }
  return dir;
};

// strict mode refuses position: absolute, in the template and in the HTML render alike
const ABSOLUTE = 'export const lang = "en";\nexport const template = ["handlebars", "liquid"];\nexport default function Abs({ n }) {\n  return <div style={{ position: "absolute" }}>Hi {n}</div>;\n}\n';

const cell = (td: string) => `<table><tr>${td}</tr></table>`;

describe("normalize", () => {
  it("ignores whitespace between tags and inside text", () => {
    expect(normalize("<p>a   b\n c</p>")).toBe(normalize("<p> a b c </p>"));
    expect(normalize("<div>\n  <p>a</p>\n</div>")).toBe(normalize("<div><p>a</p></div>"));
  });

  it("keeps a non-breaking space and real text changes", () => {
    expect(normalize("<p>a&nbsp;b</p>")).not.toBe(normalize("<p>a b</p>"));
    expect(normalize("<p>a</p>")).not.toBe(normalize("<p>b</p>"));
  });

  it("ignores attribute order and spacing, not values", () => {
    expect(normalize(cell('<td width="1" class="a  b">x</td>'))).toBe(normalize(cell('<td class="a b" width="1">x</td>')));
    expect(normalize(cell('<td width="1">x</td>'))).not.toBe(normalize(cell('<td width="2">x</td>')));
  });

  it("reads the escapes Handlebars and Liquid write as the characters", () => {
    expect(normalize("<p>a &#x3D; &#x60;b&#x60; &#x27;c&#x27; &amp; &quot;d&quot;</p>")).toBe(normalize("<p>a = `b` 'c' & \"d\"</p>"));
    expect(normalize('<a title="&#x3D; &#39;x&#39;">x</a>')).toBe(normalize("<a title=\"= 'x'\">x</a>"));
    expect(normalize("<!--[if mso]>a &#x3D; b<![endif]-->")).toBe(normalize("<!--[if mso]>a = b<![endif]-->"));
  });

  it("keeps the space next to an inline element, drops it at a block's edge", () => {
    expect(normalize("<p>Hello <b>A</b></p>")).not.toBe(normalize("<p>Hello<b>A</b></p>"));
    expect(normalize("<p><b>A</b> <i>B</i></p>")).not.toBe(normalize("<p><b>A</b><i>B</i></p>"));
    expect(normalize("<div>\n  Hello <b>A</b>\n</div>")).toBe(normalize("<div>Hello <b>A</b></div>"));
  });

  it("tells a text '<' from a tag", () => {
    expect(normalize("<p>1 &lt; 2</p>")).not.toBe(normalize("<p>1 <b>2</b></p>"));
  });
});

describe("normalize: where the spacing sits", () => {
  const rows = (...tds: string[]) => `<table cellpadding="0" cellspacing="0"><tbody>${tds.map((t) => `<tr>${t}</tr>`).join("")}</tbody></table>`;
  const same = (a: string, b: string) => expect(normalize(a)).toBe(normalize(b));
  const differ = (a: string, b: string) => expect(normalize(a)).not.toBe(normalize(b));

  it("folds the gap between stacked unpainted cells to the upper one", () => {
    same(rows('<td style="padding:0 0 4px 0">a</td>', "<td>b</td>"), rows("<td>a</td>", '<td style="padding:4px 0 0 0">b</td>'));
    same(
      rows('<td style="padding:0 0 12px 0">a</td>', '<td style="padding:0 0 24px 0">b</td>', "<td>c</td>"),
      rows("<td>a</td>", '<td style="padding:12px 0 24px 0">b</td>', "<td>c</td>"),
    );
    same(rows('<td style="padding-bottom:4px">a</td>', "<td>b</td>"), rows("<td>a</td>", '<td style="padding-top:4px">b</td>'));
    same(rows('<td style="color:red;padding:0 0 4px">a</td>', "<td>b</td>"), rows('<td style="color:red">a</td>', '<td style="padding:4px 0 0 0">b</td>'));
  });

  it("folds through nested single-cell tables", () => {
    const wrap = (td: string) => `<table width="100%" cellpadding="0" cellspacing="0"><tbody><tr>${td}</tr></tbody></table>`;
    same(
      rows(`<td style="padding:0 0 8px 0">${wrap("<td>a</td>")}</td>`, "<td>b</td>"),
      rows(`<td>${wrap('<td style="padding:0 0 8px 0">a</td>')}</td>`, "<td>b</td>"),
    );
  });

  it("doesn't fold across a hidden cell or a table that draws or pads its cells", () => {
    differ(rows('<td style="display:none">a</td>', '<td style="padding:4px 0 0 0">b</td>'), rows('<td style="display:none;padding:0 0 4px 0">a</td>', "<td>b</td>"));
    differ(rows('<td style="visibility:hidden">a</td>', '<td style="padding:4px 0 0 0">b</td>'), rows('<td style="visibility:hidden;padding:0 0 4px 0">a</td>', "<td>b</td>"));
    const framed = (attrs: string, ...tds: string[]) => `<table ${attrs} cellpadding="0" cellspacing="0"><tbody>${tds.map((t) => `<tr>${t}</tr>`).join("")}</tbody></table>`;
    differ(framed('border="1"', '<td style="padding:0 0 4px 0">a</td>', "<td>b</td>"), framed('border="1"', "<td>a</td>", '<td style="padding:4px 0 0 0">b</td>'));
    // cellpadding fills the sides padding-bottom leaves out; the shorthand doesn't
    differ(framed('cellpadding="2"', '<td style="padding-bottom:4px">a</td>', "<td>b</td>"), framed('cellpadding="2"', '<td style="padding:0 0 4px 0">a</td>', "<td>b</td>"));
  });

  it("still sees a gap that is not the same size", () => {
    differ(rows('<td style="padding:0 0 4px 0">a</td>', "<td>b</td>"), rows('<td style="padding:0 0 8px 0">a</td>', "<td>b</td>"));
    differ(rows('<td style="padding:0 0 4px 0">a</td>', "<td>b</td>"), rows("<td>a</td>", '<td style="padding:8px 0 0 0">b</td>'));
  });

  it("still sees a gap on the other side of a cell", () => {
    differ(
      rows('<td style="padding:0 0 4px 0">a</td>', "<td>b</td>", "<td>c</td>"),
      rows("<td>a</td>", "<td>b</td>", '<td style="padding:4px 0 0 0">c</td>'),
    );
  });

  it("leaves the edges of the stack alone", () => {
    differ(rows('<td style="padding:4px 0 0 0">a</td>', "<td>b</td>"), rows("<td>a</td>", "<td>b</td>"));
    differ(rows("<td>a</td>", '<td style="padding:0 0 4px 0">b</td>'), rows("<td>a</td>", "<td>b</td>"));
  });

  it("does not move padding into or out of a painted cell", () => {
    const bg = ' style="background-color:#eee;padding:0"';
    differ(rows('<td style="padding:0 0 4px 0">a</td>', `<td${bg}>b</td>`), rows("<td>a</td>", `<td style="background-color:#eee;padding:4px 0 0 0">b</td>`));
    differ(rows(`<td${bg}>a</td>`, '<td style="padding:4px 0 0 0">b</td>'), rows(`<td style="background-color:#eee;padding:0 0 4px 0">a</td>`, "<td>b</td>"));
    differ(rows('<td style="padding:0 0 4px 0">a</td>', '<td bgcolor="#eee">b</td>'), rows("<td>a</td>", '<td bgcolor="#eee" style="padding:4px 0 0 0">b</td>'));
    differ(rows('<td style="padding:0 0 4px 0;border-bottom:1px solid #000">a</td>', "<td>b</td>"), rows('<td style="border-bottom:1px solid #000">a</td>', '<td style="padding:4px 0 0 0">b</td>'));
    differ(rows('<td style="background-image:url(x.png);padding:0 0 4px 0">a</td>', "<td>b</td>"), rows('<td style="background-image:url(x.png)">a</td>', '<td style="padding:4px 0 0 0">b</td>'));
  });

  it("does not move padding into or out of a spacer", () => {
    const spacer = (pad: string) => `<td height="10" style="line-height:10px;${pad}">&nbsp;</td>`;
    differ(rows("<td>a</td>", spacer("padding:0 0 4px 0")), rows("<td>a</td>", spacer("padding:4px 0 0 0")));
    differ(rows('<td style="padding:0 0 4px 0">a</td>', spacer("")), rows("<td>a</td>", spacer("padding:4px 0 0 0")));
    differ(rows('<td style="padding:0 0 4px 0">a</td>', '<td style="height:10px">b</td>'), rows("<td>a</td>", '<td style="height:10px;padding:4px 0 0 0">b</td>'));
    differ(rows('<td style="padding:0 0 4px 0">a</td>', '<td style="line-height:10px">b</td>'), rows("<td>a</td>", '<td style="line-height:10px;padding:4px 0 0 0">b</td>'));
  });

  it("never folds across the columns of one row", () => {
    differ(
      '<table cellpadding="0" cellspacing="0"><tbody><tr><td style="padding:0 0 4px 0">a</td><td>b</td></tr></tbody></table>',
      '<table cellpadding="0" cellspacing="0"><tbody><tr><td>a</td><td style="padding:4px 0 0 0">b</td></tr></tbody></table>',
    );
    differ(rows('<td style="padding:0 0 4px 0">a</td><td>x</td>', "<td>b</td>"), rows("<td>a</td><td>x</td>", '<td style="padding:4px 0 0 0">b</td>'));
  });

  it("does not fold across MSO ghost markup or through other padding units", () => {
    const ghost = "<!--[if mso]></td></tr><tr><td><![endif]-->";
    differ(
      `<table cellpadding="0" cellspacing="0"><tbody><tr><td style="padding:0 0 4px 0">a</td></tr>${ghost}<tr><td>b</td></tr></tbody></table>`,
      `<table cellpadding="0" cellspacing="0"><tbody><tr><td>a</td></tr>${ghost}<tr><td style="padding:4px 0 0 0">b</td></tr></tbody></table>`,
    );
    differ(rows('<td style="padding:0 0 1em 0">a</td>', "<td>b</td>"), rows("<td>a</td>", '<td style="padding:1em 0 0 0">b</td>'));
    differ(rows('<td style="mso-padding-alt:0 0 4px 0;padding:0 0 4px 0">a</td>', "<td>b</td>"), rows('<td style="mso-padding-alt:0 0 4px 0">a</td>', '<td style="padding:4px 0 0 0">b</td>'));
  });

  it("keeps the sides, so a horizontal difference is still one", () => {
    differ(rows('<td style="padding:0 8px 4px 0">a</td>', "<td>b</td>"), rows('<td style="padding:0 0 4px 8px">a</td>', "<td>b</td>"));
  });
});

describe("normalize: plain wrappers", () => {
  const rows = (...tds: string[]) => `<table cellpadding="0" cellspacing="0"><tbody>${tds.map((t) => `<tr>${t}</tr>`).join("")}</tbody></table>`;
  const wrap = (cell: string, attrs = 'width="100%" style="width:100%;"') =>
    `<table ${attrs} role="presentation" cellpadding="0" cellspacing="0"><tbody><tr>${cell}</tr></tbody></table>`;
  const same = (a: string, b: string) => expect(normalize(a)).toBe(normalize(b));
  const differ = (a: string, b: string) => expect(normalize(a)).not.toBe(normalize(b));
  const box = '<td style="background-color:#eee;padding:8px">Total</td>';
  const framed = (pad: string) => `<td style="background-color:#eee;padding:${pad}">Total</td>`;

  it("sees through a wrapper that carries the gap below, and one that doesn't", () => {
    same(rows(`<td style="padding:0 0 16px 0">${wrap("<td>a</td>")}</td>`, "<td>b</td>"), rows("<td>a</td>", '<td style="padding:16px 0 0 0">b</td>'));
    same(rows("<td>a</td>", `<td style="padding:16px 0 0 0">${wrap("<td>b</td>")}</td>`), rows('<td style="padding:0 0 16px 0">a</td>', "<td>b</td>"));
  });

  it("sees through wrappers nested two deep, and adds their gaps", () => {
    const deep = wrap(`<td style="padding:0 0 4px 0">${wrap("<td>a</td>")}</td>`);
    same(rows(`<td style="padding:0 0 12px 0">${deep}</td>`, "<td>b</td>"), rows("<td>a</td>", '<td style="padding:16px 0 0 0">b</td>'));
  });

  it("sees through the wrapper of an arm that is there or not", () => {
    // the arm shown: wrapped in one render, flat in the other
    same(
      rows("<td>a</td>", `<td style="padding:0 0 16px 0">${wrap("<td>arm</td>")}</td>`, "<td>c</td>"),
      rows("<td>a</td>", '<td style="padding:0 0 16px 0">arm</td>', "<td>c</td>"),
    );
    // the arm absent: the gap is whoever is left
    same(rows("<td>a</td>", `<td style="padding:0 0 16px 0">${wrap("<td>c</td>")}</td>`), rows("<td>a</td>", '<td style="padding:0 0 16px 0">c</td>'));
  });

  it("puts a wrapper's horizontal padding on its content", () => {
    same(`<table cellpadding="0" cellspacing="0"><tr><td style="padding:0 8px">${wrap("<td>a</td>")}</td></tr></table>`, '<table cellpadding="0" cellspacing="0"><tr><td style="padding:0 8px">a</td></tr></table>');
    same(`<table cellpadding="0" cellspacing="0"><tr><td style="padding:0 8px">${wrap('<td style="padding:0 4px">a</td>')}</td></tr></table>`, '<table cellpadding="0" cellspacing="0"><tr><td style="padding:0 12px">a</td></tr></table>');
  });

  it("sees through a wrapper around a painted box, whose gap stays outside it", () => {
    const wrapped = rows(`<td style="padding:0 0 8px 0">${wrap(box)}</td>`, "<td>b</td>");
    same(wrapped, rows(box, '<td style="padding:8px 0 0 0">b</td>'));
    same(rows("<td>a</td>", `<td style="padding:8px 0 0 0">${wrap(box)}</td>`), rows('<td style="padding:0 0 8px 0">a</td>', box));
  });

  it("flags a different text", () => {
    differ(rows(`<td style="padding:0 0 16px 0">${wrap("<td>a</td>")}</td>`, "<td>b</td>"), rows("<td>x</td>", '<td style="padding:16px 0 0 0">b</td>'));
  });

  it("flags a different total gap", () => {
    differ(rows(`<td style="padding:0 0 16px 0">${wrap("<td>a</td>")}</td>`, "<td>b</td>"), rows("<td>a</td>", '<td style="padding:24px 0 0 0">b</td>'));
    differ(rows(`<td style="padding:0 0 16px 0">${wrap(box)}</td>`, "<td>b</td>"), rows(box, '<td style="padding:24px 0 0 0">b</td>'));
  });

  it("flags a gap moved from outside a painted box to inside it", () => {
    differ(rows(`<td style="padding:0 0 8px 0">${wrap(box)}</td>`, "<td>b</td>"), rows(framed("8px 8px 16px"), "<td>b</td>"));
    differ(rows("<td>a</td>", `<td style="padding:8px 0 0 0">${wrap(box)}</td>`), rows("<td>a</td>", framed("16px 8px 8px")));
    differ(rows(`<td style="padding:0 0 8px 0">${wrap(box)}</td>`, "<td>b</td>"), rows(box, "<td>b</td>"));
  });

  it("flags a painted box on one side only", () => {
    differ(rows(`<td style="padding:0 0 8px 0">${wrap("<td>Total</td>")}</td>`, "<td>b</td>"), rows(`<td style="padding:0 0 8px 0">${wrap(box)}</td>`, "<td>b</td>"));
    differ(rows(`<td style="padding:0 0 8px 0">${wrap("<td>Total</td>")}</td>`, "<td>b</td>"), rows(box, '<td style="padding:8px 0 0 0">b</td>'));
  });

  it("flags a different width or align on a wrapper that has them", () => {
    const at = (attrs: string) => rows(`<td style="padding:0 0 8px 0">${wrap("<td>a</td>", attrs)}</td>`, "<td>b</td>");
    differ(at('width="560" style="width:560px;"'), at('width="480" style="width:480px;"'));
    differ(at('width="560" align="center"'), at('width="560" align="left"'));
    differ(at('width="560" style="width:560px;"'), rows('<td style="padding:0 0 8px 0">a</td>', "<td>b</td>"));
    differ(rows(`<td>${wrap('<td align="center">a</td>')}</td>`), rows("<td>a</td>"));
  });

  it("flags a column added or removed", () => {
    differ(rows(`<td style="padding:0 0 8px 0">${wrap("<td>a</td>")}</td>`, "<td>b</td>"), rows(`<td style="padding:0 0 8px 0">${wrap("<td>a</td><td></td>")}</td>`, "<td>b</td>"));
    differ(rows(`<td>${wrap("<td>a</td><td>b</td>")}</td>`), rows(`<td>${wrap("<td>a</td>")}</td>`));
  });

  it("flags a hidden box on one side only", () => {
    const hidden = '<td style="display:none">a</td>';
    differ(rows(`<td style="padding:0 0 8px 0">${wrap(hidden)}</td>`, "<td>b</td>"), rows("<td>a</td>", '<td style="padding:8px 0 0 0">b</td>'));
    differ(rows(`<td style="padding:0 0 8px 0">${wrap('<td style="mso-hide:all">a</td>')}</td>`, "<td>b</td>"), rows("<td>a</td>", '<td style="padding:8px 0 0 0">b</td>'));
  });

  it("flags a wrapper without width, which shrinks, against flat content or a full one", () => {
    const shrunk = wrap("<td>a</td>", "");
    differ(`<table cellpadding="0" cellspacing="0"><tr><td style="text-align:center">${shrunk}</td></tr></table>`, '<table cellpadding="0" cellspacing="0"><tr><td style="text-align:center">a</td></tr></table>');
    differ(rows(`<td>${shrunk}</td>`), rows(`<td>${wrap("<td>a</td>")}</td>`));
  });

  it("flags a hidden cell by visibility inside a wrapper on one side only", () => {
    const h = '<td style="visibility:hidden">a</td>';
    differ(rows(`<td style="padding:0 0 8px 0">${wrap(h)}</td>`, "<td>b</td>"), rows("<td>a</td>", '<td style="padding:8px 0 0 0">b</td>'));
  });

  it("flags padding absorbed by a cell with mso-padding-alt", () => {
    differ(
      `<table cellpadding="0" cellspacing="0"><tr><td style="padding:8px;mso-padding-alt:8px">${wrap('<td style="padding:0 0 8px 0">a</td>')}</td></tr></table>`,
      '<table cellpadding="0" cellspacing="0"><tr><td style="padding:8px 8px 16px 8px;mso-padding-alt:8px">a</td></tr></table>',
    );
  });

  it("flags a painted cell with a width taken out of a wrapper in a two-column row", () => {
    const p = '<td width="100" style="background-color:#eee">a</td>';
    differ(rows(`<td>${wrap(p)}</td><td>b</td>`), rows(`${p}<td>b</td>`));
  });

  it("doesn't let outer align or dir move onto bare text", () => {
    for (const a of ['align="center"', 'dir="rtl"', 'class="x"'])
      differ(`<table cellpadding="0" cellspacing="0"><tr><td ${a}>${wrap("<td>a</td>")}</td></tr></table>`, `<table cellpadding="0" cellspacing="0"><tr><td ${a}>a</td></tr></table>`);
  });

  it("dissolves a fixed-layout or border-collapse wrapper like a plain one", () => {
    // a fixed-layout wrapper only inside a fixed-layout table, which holds wide content the same way
    const fixed = (...tds: string[]) => rows(...tds).replace("<table ", '<table width="100%" style="width:100%;table-layout:fixed;" ');
    for (const st of ["width:100%;table-layout:fixed;", "width:100%;border-collapse:separate;"])
      same(fixed(`<td style="padding:0 0 16px 0">${wrap("<td>a</td>", `width="100%" style="${st}"`)}</td>`, "<td>b</td>"), fixed("<td>a</td>", '<td style="padding:16px 0 0 0">b</td>'));
  });

  it("doesn't hoist a hidden outer cell's padding into a gap", () => {
    differ(rows(`<td style="display:none;padding:0 0 8px 0">${wrap(box)}</td>`, "<td>b</td>"), rows(box, '<td style="padding:8px 0 0 0">b</td>'));
  });

  it("doesn't let outer text styles move onto bare text", () => {
    differ(`<table cellpadding="0" cellspacing="0"><tr><td style="font-family:Georgia;color:#f00">${wrap("<td>a</td>")}</td></tr></table>`, '<table cellpadding="0" cellspacing="0"><tr><td style="font-family:Georgia;color:#f00">a</td></tr></table>');
  });

  it("sees a gap between painted boxes the same wherever the wrapper sits", () => {
    const lower = '<td style="background-color:#ddd">Lower</td>';
    same(rows(`<td style="padding:0 0 8px 0">${wrap(box)}</td>`, lower), rows(box, `<td style="padding:8px 0 0 0">${wrap(lower)}</td>`));
  });

  it("keeps a wrapper that is not plain, and MSO markup", () => {
    differ(rows(`<td style="padding:0 0 8px 0">${wrap("<td>a</td>", 'border="1" width="100%"')}</td>`, "<td>b</td>"), rows("<td>a</td>", '<td style="padding:8px 0 0 0">b</td>'));
    differ(rows(`<td style="padding:0 0 1em 0">${wrap("<td>a</td>")}</td>`, "<td>b</td>"), rows("<td>a</td>", '<td style="padding:1em 0 0 0">b</td>'));
    const ghost = "<!--[if mso]><table><tr><td><![endif]-->";
    differ(rows(`<td style="padding:0 0 8px 0">${wrap(`<td>${ghost}a</td>`)}</td>`, "<td>b</td>"), rows(`<td style="padding:0 0 8px 0">${ghost}a</td>`, "<td>b</td>"));
  });
});

describe("mismatch", () => {
  it("names the first differing line of each side", () => {
    const d = mismatch("note", 'data set "a"', "liquid", "<div><p>One</p><p>Two</p></div>", "<div><p>One</p><p>Too</p></div>");
    expect(d?.code).toBe("E016");
    expect(d?.severity).toBe("error");
    expect(d?.message).toContain('note: the liquid template filled with data set "a" differs from the HTML render at line');
    expect(d?.message).toContain("html:     Two");
    expect(d?.message).toContain("template: Too");
    expect(firstDifference("a", "a")).toBeUndefined();
  });

  it("reports a template that loses the space around a field", () => {
    expect(mismatch("n", "x", "liquid", "<p>Hello <b>Ada</b></p>", "<p>Hello<b>Ada</b></p>")?.code).toBe("E016");
  });

  it("is quiet for the same page written differently", () => {
    expect(mismatch("n", "x", "handlebars", '<p id="1" class="b">a &amp; b</p>', '<p class="b" id="1">a &#x26; b</p>')).toBeUndefined();
  });
});

describe("verifyEmail", () => {
  let vite: ViteDevServer;
  beforeAll(async () => {
    vite = await createEmailServer({ root: repo });
    // the first check loads the compiler and engines through vite, about 4s; pay it here, not in the first test
    await verified(vite, email("match"));
  });
  afterAll(() => vite.close());

  it("passes an email whose templates read like its HTML for every data set", async () => {
    expect(await verifyEmail(vite, email("match"))).toEqual([]);
  });

  it("passes hints (if, else, each) with a truthy and a falsy data set", async () => {
    expect(await verifyEmail(vite, email("hints"))).toEqual([]);
  });

  it("fails a component with a side effect the template can't follow, per dialect", async () => {
    const ds = await verifyEmail(vite, email("mismatch"));
    expect(ds.map((d) => d.code)).toEqual(["E016", "E016"]);
    expect(ds[0]!.message).toMatch(/^mismatch: the handlebars template filled with data set "default" differs from the HTML render at line \d+:/);
    expect(ds[0]!.message).toMatch(/html: +Visit number \d+\./);
    expect(ds[1]!.message).toContain("the liquid template");
  });

  it("catches a function called in an arm that changes something, which the rewrite can't see", async () => {
    const ds = await verifyEmail(vite, email("pure"));
    expect(ds.map((d) => d.code)).toEqual(["E016", "E016"]);
    expect(ds[0]!.message).toMatch(/^pure: the handlebars template filled with data set "default" differs from the HTML render at line \d+:/);
    expect(ds[0]!.message).toMatch(/html: +Due 1/);
    expect(ds[0]!.message).toMatch(/template: +Due 2/);
  });

  it("refuses to compare when a render has errors, and says what they are", async () => {
    const side = { html: "<p>a</p>", diagnostics: [{ code: "E014", severity: "error", message: "unevaluated", hint: "" }] as never };
    const ds = checkFilled("n", 'data set "a"', side, [
      { dialect: "liquid", diagnostics: [], html: "<p>b</p>" },
      { dialect: "handlebars", diagnostics: [], html: "<p>b</p>" },
    ]);
    expect(ds.map((d) => d.code)).toEqual(["E014"]);
    expect(ds[0]!.message).toContain("the HTML render");
  });

  it("leaves a template that has the errors itself to the compile that reports them", () => {
    const e = { code: "E002", severity: "error", message: "absolute", hint: "" } as never;
    const ds = checkFilled("n", "x", { html: "<p>a</p>", diagnostics: [e] }, [{ dialect: "liquid", diagnostics: [e], html: "<p>b</p>" }]);
    expect(ds).toEqual([]);
  });

  it("still reports a data error when no engine is installed", async () => {
    hidden.add("handlebars").add("liquid");
    try {
      const bad = findEmails(resolve(import.meta.dirname, "../../vite-equivalence-bad")).find((e) => e.name === "broken")!;
      await expect(verifyEmail(vite, bad)).rejects.toThrow(/^broken: data set "default": invalid JSON/);
    } finally {
      hidden.clear();
    }
  });

  it("skips an email without data sets, with an info", async () => {
    const ds = await verifyEmail(vite, email("bare"));
    expect(ds.map((d) => [d.code, d.severity])).toEqual([["I005", "info"]]);
    expect(ds[0]!.message).toContain("no data sets");
  });

  it("skips a dialect whose engine isn't installed, and checks the other", async () => {
    hidden.add("liquid");
    try {
      const ds = await verifyEmail(vite, email("match"));
      expect(ds.map((d) => d.code)).toEqual(["I005"]);
      expect(ds[0]!.message).toContain("liquid not checked");
      expect((await verifyEmail(vite, email("mismatch"))).map((d) => d.message.match(/the (\w+) template/)?.[1] ?? d.code)).toEqual(["I005", "handlebars"]);
    } finally {
      hidden.delete("liquid");
    }
  });
});

describe("buildEmails", () => {
  const out = () => mkdtempSync(join(tmpdir(), "tddr-equiv-"));

  it("writes the emails that match and fails the one that doesn't, writing nothing for it", async () => {
    const to = out();
    const results = await buildEmails({ dir: root, root: repo, out: to });
    expect(results.map((r) => [r.email, r.dialect, r.error !== undefined, r.diagnostics.map((d) => d.code)])).toEqual([
      // I015: none of these components writes a <title>
      ["bare", "handlebars", false, ["I005", "I015"]],
      ["hints", "handlebars", false, ["I015"]],
      ["hints", "liquid", false, ["I015"]],
      ["match", "handlebars", false, ["I015"]],
      ["match", "liquid", false, ["I015"]],
      ["mismatch", undefined, true, ["E016", "E016"]],
      ["pure", undefined, true, ["E016", "E016"]],
    ]);
    expect(readdirSync(to).sort()).toEqual(["bare.handlebars.html", "hints.handlebars.html", "hints.liquid.html", "match.handlebars.html", "match.liquid.html"]);
  });

  it("reports a data set that isn't a JSON object as that email's error, and writes nothing for it", async () => {
    const to = out();
    const bad = resolve(import.meta.dirname, "../../vite-equivalence-bad");
    const results = await buildEmails({ dir: bad, root: repo, out: to });
    expect(results.map((r) => [r.email, r.error ?? null])).toEqual([
      ["array", 'array: data set "default": data must be a JSON object, got [1,2]'],
      ["broken", expect.stringMatching(/^broken: data set "default": invalid JSON/)],
      ["fine", null],
    ]);
    expect(readdirSync(to)).toEqual(["fine.handlebars.html"]);
  });

  it.each([true, false])("writes nothing for a template that would lose a field, verify %s", async (verify) => {
    const tier = 'export const lang = "en";\nexport const template = ["handlebars"];\nexport default function Tier({ user }) {\n  return <><title>Tier</title><p className={user.tier}>Hi {user.name}</p></>;\n}\n';
    const dir = folder({ "tier/index.jsx": tier, "tier/default.json": '{ "user": { "tier": "gold", "name": "Ada" } }', "fine/index.jsx": tier.replace("className={user.tier}", ""), "fine/default.json": '{ "user": { "name": "Ada" } }' });
    const to = out();
    const results = await buildEmails({ dir, root: repo, out: to, verify });
    expect(results.map((r) => [r.email, r.dialect ?? null, r.error ?? null, r.diagnostics.map((d) => d.code)])).toEqual([
      ["fine", "handlebars", null, []],
      ["tier", "handlebars", "its handlebars template would lose what a field fills in (E013); nothing written", ["E013"]],
    ]);
    expect(results[1]!.diagnostics[0]!.message).toMatch(/^class="\{\{user\.tier\}\}" on <p> comes from a field/);
    expect(readdirSync(to)).toEqual(["fine.handlebars.html"]);
  });

  it("reports a strict compile error once per dialect, the same with verify on or off", async () => {
    const dir = folder({ "abs/index.jsx": ABSOLUTE, "abs/a.json": '{ "n": 1 }', "abs/b.json": '{ "n": 2 }' });
    const on = await buildEmails({ dir, root: repo, out: out() });
    const off = await buildEmails({ dir, root: repo, out: out(), verify: false });
    const shape = (rs: typeof on) => rs.map((r) => [r.dialect, r.error ?? null, r.diagnostics.map((d) => [d.code, d.message])]);
    expect(shape(on)).toEqual(shape(off));
    expect(on.map((r) => [r.dialect, r.diagnostics.map((d) => d.code)])).toEqual([["handlebars", ["E002", "I015"]], ["liquid", ["E002", "I015"]]]);
    expect(JSON.stringify(on)).not.toContain("HTML render");
    expect(on.every((r) => r.file && !r.error)).toBe(true);
  }, 30_000);

  it("writes the templates it verified, compiling each dialect once", async () => {
    const dir = folder({
      "state/index.jsx": 'globalThis.__tddrLoads = (globalThis.__tddrLoads ?? 0) + 1;\nexport const lang = "en";\nexport const template = ["handlebars", "liquid"];\nexport default function State({ n }) {\n  return <p>Hi {n}</p>;\n}\n',
      "state/default.json": '{ "n": 1 }',
    });
    (globalThis as { __tddrLoads?: number }).__tddrLoads = 0;
    const results = await buildEmails({ dir, root: repo, out: out() });
    expect(results.every((r) => r.file && !r.error)).toBe(true);
    // two templates and the HTML render; the write loop adds none
    expect((globalThis as { __tddrLoads?: number }).__tddrLoads).toBe(3);
  }, 30_000);

  it("builds the mismatching email with verify off", async () => {
    const to = out();
    const results = await buildEmails({ dir: root, root: repo, out: to, verify: false });
    expect(results.some((r) => r.error)).toBe(false);
    expect(readdirSync(to)).toContain("mismatch.liquid.html");
  });
});

describe("the dev server", () => {
  const post = async (url: string, body: unknown) =>
    (await (await fetch(`${url}__tddr/api/render`, { method: "POST", body: JSON.stringify(body) })).json()) as { diagnostics: Array<{ code: string; message: string }>; html: string };

  it("shows E016 in a dialect view of a mismatching email, and none for a matching one", async () => {
    const dev = await startDevServer({ dir: root, root: repo, port: 0, host: "127.0.0.1" });
    try {
      const bad = await post(dev.url, { email: "mismatch", mode: "liquid", data: "default" });
      expect(bad.diagnostics.map((d) => d.code)).toContain("E016");
      const good = await post(dev.url, { email: "hints", mode: "handlebars", data: "shown" });
      expect(good.diagnostics.filter((d) => d.code === "E016")).toEqual([]);
    } finally {
      await dev.close();
    }
  }, 30_000);

  it("doesn't check a template view when no data set is chosen", async () => {
    const dir = folder({ "bare/index.jsx": 'export const lang = "en";\nexport const template = ["handlebars"];\nexport default function Bare() {\n  return <p>Hello</p>;\n}\n' });
    const dev = await startDevServer({ dir, root: repo, port: 0, host: "127.0.0.1" });
    try {
      // no I005; the component writes no <title>
      const r = await post(dev.url, { email: "bare", mode: "handlebars", data: {} });
      expect(r.diagnostics.map((d) => d.code)).toEqual(["I015"]);
      const none = await post(dev.url, { email: "bare", mode: "handlebars" });
      expect(none.diagnostics.map((d) => d.code)).toEqual(["I015"]);
    } finally {
      await dev.close();
    }
  }, 30_000);

  it("shows a strict compile error once, not again as the HTML render's", async () => {
    const dir = folder({ "abs/index.jsx": ABSOLUTE, "abs/default.json": '{ "n": 1 }' });
    const dev = await startDevServer({ dir, root: repo, port: 0, host: "127.0.0.1" });
    try {
      const r = await post(dev.url, { email: "abs", mode: "liquid", data: "default" });
      expect(r.diagnostics.filter((d) => d.code === "E002")).toHaveLength(1);
      expect(JSON.stringify(r.diagnostics)).not.toContain("HTML render");
    } finally {
      await dev.close();
    }
  }, 30_000);

  it("keeps the template view when the HTML render throws, with an info", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tddr-equiv-dev-"));
    mkdirSync(join(dir, "boom"));
    writeFileSync(
      join(dir, "boom/index.jsx"),
      'export const lang = "en";\nexport const template = ["handlebars"];\nexport default function Boom() {\n  // the template render comes first and passes\n  globalThis.__tddrBoom = (globalThis.__tddrBoom ?? 0) + 1;\n  if (globalThis.__tddrBoom > 1) throw new Error("second render");\n  return <p>Hello</p>;\n}\n',
    );
    writeFileSync(join(dir, "boom/default.json"), '{ "user": { "name": "Ada" } }');
    const dev = await startDevServer({ dir, root: repo, port: 0, host: "127.0.0.1" });
    try {
      const r = await post(dev.url, { email: "boom", mode: "handlebars", data: "default" });
      expect(r.html).toContain("Hello");
      expect(r.diagnostics.map((d) => d.code)).toEqual(["I015", "I005"]);
      expect(r.diagnostics[1]!.message).toContain("which failed: boom: rendering with react failed: second render");
    } finally {
      await dev.close();
    }
  }, 30_000);
});

describe("tddr build <folder>", () => {
  it("exits 1 and prints the E016 message for a mismatching email, end to end", async () => {
    const to = mkdtempSync(join(tmpdir(), "tddr-equiv-cli-"));
    const err: string[] = [];
    const io: CliIO = { stdout: () => {}, stderr: (s) => void err.push(s), readFile: () => "", writeFile: () => {}, isDir: (p) => p === root };
    const cwd = process.cwd();
    process.chdir(repo);
    try {
      expect(await run(["build", root, "-o", to], io)).toBe(1);
    } finally {
      process.chdir(cwd);
    }
    expect(err.join("")).toContain("E016");
    expect(err.join("")).toContain("mismatch: the handlebars template filled with data set");
    expect(readdirSync(to)).not.toContain("mismatch.handlebars.html");
  }, 60_000);
});

describe("the repo's example template emails", () => {
  // No known E016s: the two renders of every example read the same. An entry added here is a regression.
  const KNOWN: string[] = [];

  it("differ from their HTML render only where they are known to", async () => {
    const examples = join(repo, "examples");
    const vite = await createEmailServer({ root: examples });
    try {
      const templates = findEmails(examples).filter((e) => e.template.length > 0);
      expect(templates.length).toBeGreaterThan(0);
      const found: string[] = [];
      for (const e of templates)
        for (const d of await verifyEmail(vite, e)) {
          expect(d.code, d.message).toBe("E016");
          const [, email, dialect, set] = /^(\S+): the (\w+) template filled with data set "([^"]+)"/.exec(d.message)!;
          found.push(`${email} ${dialect} ${set}`);
        }
      expect(found.sort()).toEqual(KNOWN.sort());
    } finally {
      await vite.close();
    }
  }, 60_000);
});

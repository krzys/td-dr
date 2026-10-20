import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { engine, type Fill } from "../../../adapters/vite/engines.ts";
import { mismatch } from "../../../adapters/vite/equivalence.ts";
import { firstDifference, normalize } from "../../../adapters/vite/normalize/index.ts";
import { compile, preview } from "../../../src/index.ts";

// Normalization must not erase a difference a reader can see, and must keep the two spellings of the
// same spacing equal (docs/templates.md#the-equivalence-check). Inputs are written the way the compiler writes tables.
const T = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';
// a column of blocks: single-cell rows in a plain full-width table
const stack = (...tds: string[]) => `<table ${T} width="100%" style="width:100%;table-layout:fixed;">${tds.map((t) => `<tr>${t}</tr>`).join("")}</table>`;
// a plain full-width wrapper around one cell; attrs first, so a test's own attribute wins over the defaults
const wrap = (td: string, attrs = 'width="100%" style="width:100%;table-layout:fixed;"') => `<table ${attrs} ${T}><tr>${td}</tr></table>`;
const pad = (padding: string, content: string, style = "") => `<td style="${style}padding:${padding};">${content}</td>`;
const BOX = '<td bgcolor="#eeeeee" style="padding:8px;background-color:#eee;">Total</td>';

const same = (html: string, filled: string) => {
  expect(normalize(html)).toBe(normalize(filled));
  expect(mismatch("e", "x", "liquid", html, filled)).toBeUndefined();
};

// E016, and the first differing line it names shows `at` on one side
const flags = (html: string, filled: string, at: string) => {
  expect(normalize(html)).not.toBe(normalize(filled));
  const d = mismatch("e", "x", "liquid", html, filled);
  expect(d?.code).toBe("E016");
  const [, a, b] = /\n {4}html: {5}(.*)\n {4}template: (.*)$/.exec(d!.message) ?? [];
  expect(`${a}\n${b}`).toContain(at);
};

// the plain wrapper reads like the flat content and the variant doesn't, so what the variant adds keeps it
const kept = (flat: string, plain: string, variant: string, at = "<table") => {
  same(flat, plain);
  flags(flat, variant, at);
};

describe("firstDifference", () => {
  it("names the first line where the normalized pages differ", () => {
    const [x, y] = [normalize("<div><p>One</p><p>Two</p></div>"), normalize("<div><p>One</p><p>Too</p></div>")];
    const line = x.split("\n").findIndex((l, i) => l !== y.split("\n")[i]) + 1;
    expect(firstDifference(x, y)).toContain(`line ${line}:`);
    expect(firstDifference(x, x + "\n<p>")).toContain("html:     (nothing)");
  });

  it("shows where two long lines differ, not only their common start", () => {
    const style = "color:#1f2937;font-family:Arial, Helvetica, sans-serif;font-size:15px;line-height:22px;mso-line-height-rule:exactly;";
    const d = firstDifference(normalize(stack(`<td style="${style}padding:0 0 16px 0;">a</td>`)), normalize(stack(`<td style="${style}padding:0 0 24px 0;">a</td>`)));
    expect(d).toContain("16px");
    expect(d).toContain("24px");
  });
});

describe("normalize keeps: paint and clipping", () => {
  // the reference shape: a painted box in a wrapper whose padding is the gap below it
  const boxed = (td: string, wrapper?: string) => stack(pad("0 0 8px 0", wrap(td, wrapper)), "<td>b</td>");

  it("a background on one side only", () => {
    flags(boxed('<td style="padding:8px;">Total</td>'), boxed(BOX), "bgcolor");
    flags(stack(pad("0 0 8px 0", "Total", "padding:8px;"), "<td>b</td>"), boxed(BOX), "bgcolor");
  });

  it("a different background colour or image", () => {
    flags(boxed(BOX), boxed(BOX.replace("#eee;", "#eef;")), "#eef");
    flags(boxed(BOX), boxed(BOX.replace("background-color:#eee;", "background-color:#eee;background-image:url(a.png);")), "background-image");
    flags(boxed(BOX), boxed(BOX.replace("<td ", '<td background="a.png" ')), "a.png");
  });

  it("a background image whose url holds a `;`", () => {
    const img = (url: string) => stack(`<td style="padding:8px;background-image:url(${url});height:40px">Total</td>`);
    flags(img("data:image/png;base64,AAAA"), img("data:image/png;base64,BBBB"), "BBBB");
    flags(img("'https://x.test/a.png;v=1'"), img("'https://x.test/a.png;v=2'"), "v=2");
    flags(stack('<td style="font-family:\'a;b\';padding:0 0 8px 0">a</td>'), stack('<td style="font-family:\'a;c\';padding:0 0 8px 0">a</td>'), "a;c");
    // the padding after it is still read, and the rest of the style is written back whole
    same(stack('<td style="background-image:url(data:x;base64,AA);padding-bottom:8px">a</td>'), stack('<td style="background-image:url(data:x;base64,AA);padding:0 0 8px 0">a</td>'));
    flags(stack('<td style="background-image:url(data:x;base64,AA);padding-bottom:8px">a</td>'), stack('<td style="background-image:url(data:x;base64,AB);padding:0 0 8px 0">a</td>'), "AB");
  });

  it("a border or rounded corners", () => {
    flags(boxed('<td style="padding:8px;">Total</td>'), boxed('<td style="padding:8px;border:1px solid #000;">Total</td>'), "border");
    flags(boxed(BOX), boxed(BOX.replace("background-color:#eee;", "background-color:#eee;border-radius:8px;")), "border-radius");
    flags(boxed(BOX), boxed(BOX.replace("background-color:#eee;", "background-color:#eee;box-shadow:0 1px 2px #000;")), "box-shadow");
  });

  const flat = stack(pad("0 0 8px 0", "a"));
  const plain = stack(pad("0 0 8px 0", wrap("<td>a</td>")));

  it("an overflow clip on a wrapper that would otherwise dissolve", () => {
    kept(flat, plain, stack(pad("0 0 8px 0", wrap('<td style="overflow:hidden;">a</td>'))));
    kept(flat, plain, stack(pad("0 0 8px 0", wrap("<td>a</td>", 'width="100%" style="width:100%;overflow:hidden;"'))), "overflow");
  });

  it("anything on the wrapper's section", () => {
    const section = (attrs: string) => stack(pad("0 0 8px 0", `<table width="100%" style="width:100%;" ${T}><tbody${attrs}><tr><td>a</td></tr></tbody></table>`), "<td>b</td>");
    const flat = stack(pad("0 0 8px 0", "a"), "<td>b</td>");
    same(flat, section(""));
    for (const attrs of [' style="display:none"', " hidden", ' bgcolor="#ff0000"', ' align="center"']) flags(flat, section(attrs), "<table");
  });

  it("paint on the wrapper table or its row", () => {
    kept(flat, plain, stack(pad("0 0 8px 0", wrap("<td>a</td>", 'width="100%" bgcolor="#eeeeee" style="width:100%;"'))), "bgcolor");
    kept(flat, plain, stack(pad("0 0 8px 0", `<table width="100%" style="width:100%;" ${T}><tr bgcolor="#eeeeee"><td>a</td></tr></table>`)));
  });
});

describe("normalize keeps: paint height in a row that can stretch", () => {
  const RED = '<td bgcolor="#ff0000" style="background-color:#f00;">Total</td>';
  const hoisted = (box = RED) => `<td style="padding:0;">${wrap(box)}</td>`;
  const table = (row: string, rows = "", tr = "<tr>") => `<table ${T} width="300" style="width:300px;table-layout:fixed;">${rows}${tr}${row}</tr></table>`;

  it("a painted box in a wrapper beside a taller column, which paints only its own height", () => {
    const row = (...tds: string[]) => `<table ${T} width="100%"><tr>${tds.join("")}<td>1<br>2<br>3</td></tr></table>`;
    const auto = (box: string) => wrap(box, 'width="100%" style="width:100%;"');
    flags(row(`<td>${auto(BOX)}</td>`), row(BOX), "bgcolor");
    same(stack(`<td>${auto(BOX)}</td>`), stack(BOX));
  });

  it("a rowspan from the row above reaching into the row", () => {
    const above = '<tr><td style="padding:0">x</td><td rowspan="2" style="padding:0">1<br>2<br>3<br>4<br>5</td></tr>';
    flags(table(hoisted(), above), table(RED, above), "bgcolor");
    same(table(hoisted(), '<tr><td style="padding:0">x</td></tr>'), table(RED, '<tr><td style="padding:0">x</td></tr>'));
  });

  it("a row with a height or paint of its own", () => {
    same(table(hoisted()), table(RED));
    for (const tr of ['<tr height="100">', '<tr style="height:100px;">']) flags(table(hoisted(), "", tr), table(RED, "", tr), "<td");
  });

  it("a span on the painted box", () => {
    const two = '<tr><td style="padding:0">x</td><td style="padding:0">y</td></tr>';
    const spanned = RED.replace("<td ", '<td colspan="2" ');
    flags(table(hoisted(spanned), two), table(spanned, two), "<td");
  });
});

// Each pair paints the same on both sides and differs only in where the padding sits, so only the
// paint guard keeps them apart: without it the padding would be folded or merged into the same form.
describe("normalize keeps: padding inside a painted cell (the paint guard alone)", () => {
  // Chromium paints each of these pairs differently
  const VISIBLE = [
    ['bgcolor="#ff0000"', ""],
    ['background="a.png"', ""],
    ["", "background-color:#f00;"],
    ["", "background-image:url(a.png);"],
    ["", "border:2px solid #f00;"],
    ["", "border-bottom:2px solid #f00;"],
    ["", "outline:4px solid #f00;"],
    ["", "box-shadow:0 0 0 4px #f00;"],
    ["", "-webkit-box-shadow:0 0 0 4px #f00;"],
  ];
  // kept on purpose though they look the same here: a spacer's height (differs in quirks mode),
  // what only Outlook reads, radius that shows once the cell is painted
  const KEPT = [
    ['height="40"', ""],
    ["", "height:40px;"],
    ["", "min-height:40px;"],
    ["", "line-height:40px;"],
    ["", "mso-padding-alt:0;"],
    ["", "border-radius:8px;"],
  ];
  const PAINT = [...VISIBLE, ...KEPT];
  const cell = ([attrs, style]: string[], pad: string) => `<td ${attrs} style="${style}${pad}">a</td>`;

  it("folds the same pair when the cell paints nothing", () => {
    same(stack(cell(["", ""], "padding:0 0 16px 0;"), "<td>b</td>"), stack(cell(["", ""], ""), pad("16px 0 0 0", "b")));
    same(stack(pad("0 0 8px 0", wrap(cell(["", ""], ""))), "<td>b</td>"), stack(cell(["", ""], "padding:0 0 8px 0;"), "<td>b</td>"));
  });

  it("keeps a gap from moving onto or off a painted cell", () => {
    for (const p of PAINT) flags(stack(cell(p, "padding:0 0 16px 0;"), "<td>b</td>"), stack(cell(p, ""), pad("16px 0 0 0", "b")), "<td");
  });

  it("keeps a wrapper's padding outside the painted cell it wraps", () => {
    for (const p of PAINT) flags(stack(pad("0 0 8px 0", wrap(cell(p, ""))), "<td>b</td>"), stack(cell(p, "padding:0 0 8px 0;"), "<td>b</td>"), "<td");
  });

  it("keeps a painted cell with its own width in its wrapper", () => {
    // in a table that sizes to a longer row below, a 50% box is half of it, not the wrapper's whole row
    const t = (row: string) => `<table ${T}><tr>${row}</tr><tr><td>${"b".repeat(40)}</td></tr></table>`;
    const box = (w: string) => `<td ${w} bgcolor="#ff0000" style="background-color:#f00;">Total</td>`;
    same(t(`<td style="padding:0;">${wrap(box(""), 'width="100%" style="width:100%;"')}</td>`), t(box("")));
    flags(t(`<td style="padding:0;">${wrap(box('width="50%"'), 'width="100%" style="width:100%;"')}</td>`), t(box('width="50%"')), "<td");
  });
});

describe("normalize keeps: hidden content (the hidden guard alone)", () => {
  it("keeps a gap from moving off a hidden cell, however it is spelled", () => {
    // visibility:hidden still takes its space; it is kept with the hidden boxes on purpose
    for (const style of ["display:none;", "display:none !important;", "display:none ! important;", "DISPLAY:NONE;", "visibility:hidden;"])
      flags(stack(pad("0 0 8px 0", "a", style), "<td>b</td>"), stack(`<td style="${style}">a</td>`, pad("8px 0 0 0", "b")), "<td");
    same(stack(pad("0 0 8px 0", "a", "display:block;"), "<td>b</td>"), stack('<td style="display:block;">a</td>', pad("8px 0 0 0", "b")));
  });
});

describe("normalize keeps: hidden content", () => {
  const hidden = (style: string) => `<td style="${style}">a</td>`;

  it("a hidden cell inside a wrapper, against the content shown", () => {
    for (const style of ["display:none;", "mso-hide:all;", "max-height:0;overflow:hidden;", "visibility:hidden;"])
      flags(stack(pad("0 0 8px 0", "a"), "<td>b</td>"), stack(pad("0 0 8px 0", wrap(hidden(style))), "<td>b</td>"), style.split(":")[0]!);
  });

  it("a hidden wrapper table or row", () => {
    const [flat, plain] = [stack(pad("0 0 8px 0", "a")), stack(pad("0 0 8px 0", wrap("<td>a</td>")))];
    for (const style of ["display:none;", "mso-hide:all;"]) kept(flat, plain, stack(pad("0 0 8px 0", wrap("<td>a</td>", `width="100%" style="width:100%;${style}"`))), style);
    kept(flat, plain, stack(pad("0 0 8px 0", `<table width="100%" style="width:100%;" ${T}><tr style="display:none;"><td>a</td></tr></table>`)));
  });

  it("a gap moved across the rules or frame a table draws", () => {
    const ruled = (attrs: string, upper: string, lower: string) => `<table ${T} ${attrs} width="300"><tr>${upper}</tr><tr>${lower}</tr></table>`;
    same(ruled("", pad("0 0 16px 0", "a"), "<td>b</td>"), ruled("", "<td>a</td>", pad("16px 0 0 0", "b")));
    for (const attrs of ['rules="rows"', 'frame="box"']) flags(ruled(attrs, pad("0 0 16px 0", "a"), "<td>b</td>"), ruled(attrs, "<td>a</td>", pad("16px 0 0 0", "b")), "padding");
  });

  it("padding moved onto a hidden cell, where it vanishes", () => {
    flags(stack(pad("0 0 8px 0", "a"), hidden("display:none;"), "<td>b</td>"), stack("<td>a</td>", pad("8px 0 0 0", "h", "display:none;"), "<td>b</td>"), "padding");
  });

  it("a gap moved off a cell or row hidden by the hidden attribute or display:none !important", () => {
    const off = (upper: string, lower: string) => `<table ${T} width="100%"><tr>${upper}</tr><tr${lower}><td>b</td></tr><tr><td>c</td></tr></table>`;
    flags(stack('<td hidden style="padding:0 0 8px 0;">a</td>', "<td>b</td>"), stack("<td hidden>a</td>", pad("8px 0 0 0", "b")), "padding");
    flags(stack(pad("0 0 8px 0", "a", "display:none !important;"), "<td>b</td>"), stack('<td style="display:none !important;">a</td>', pad("8px 0 0 0", "b")), "padding");
    flags(off(pad("0 0 8px 0", "a"), " hidden"), off("<td>a</td>", " hidden").replace("<td>b</td>", pad("8px 0 0 0", "b")), "padding");
  });

  it("a gap moved onto or off a cell or row a head style can change", () => {
    // under a media query, .m-hide { display:none !important } or .m-pad { padding:4px !important }
    flags(stack('<td class="m-pad" style="padding:0 0 16px 0;">a</td>', "<td>b</td>"), stack('<td class="m-pad">a</td>', pad("16px 0 0 0", "b")), "padding");
    const rows = (a: string, b: string) => `<table ${T} width="100%"><tr>${a}</tr><tr class="m-hide">${b}</tr><tr><td>c</td></tr></table>`;
    flags(rows(pad("0 0 16px 0", "a"), "<td>b</td>"), rows("<td>a</td>", pad("16px 0 0 0", "b")), "padding");
    // a painted box keeps its own class; only the space outside it moves
    const classy = '<td class="m-hide" bgcolor="#eeeeee" style="background-color:#eee;">Total</td>';
    same(stack(pad("0 0 8px 0", wrap(classy)), "<td>b</td>"), stack(classy, pad("8px 0 0 0", "b")));
  });

  it("a hidden preheader on one side only, or with other text", () => {
    const pre = (text: string) => `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:transparent;opacity:0">${text}&zwnj;&nbsp;</div>`;
    const page = (head: string) => `<body>${head}<div role="article">${stack("<td>Hi</td>")}</div></body>`;
    flags(page(""), page(pre("Your order shipped")), "display:none");
    flags(page(pre("Your order shipped")), page(pre("Your order is late")), "late");
    flags(page(pre("Your order shipped")), page(pre("Your order  shipped").replace("&zwnj;&nbsp;", "&zwnj;")), "shipped");
  });
});

describe("normalize keeps: widths and heights", () => {
  const at = (attrs: string) => stack(pad("0 0 8px 0", wrap("<td>a</td>", attrs)), "<td>b</td>");
  const flat = stack(pad("0 0 8px 0", "a"), "<td>b</td>");

  it("a wrapper that is not full width, by attribute or style, in px or %", () => {
    flags(flat, at('width="600" style="width:100%;"'), 'width="600"');
    flags(flat, at('width="100%" style="width:600px;"'), "600px");
    flags(flat, at('width="50%" style="width:50%;"'), "50%");
    flags(flat, at('width="100%" style="width:100%;max-width:600px;"'), "max-width");
    flags(flat, at('width="100%" style="width:100%;min-width:300px;"'), "min-width");
    flags(at('width="600" style="width:600px;"'), at('width="100%" style="width:600px;"'), "width");
  });

  it("a width spelled as an attribute or as a style on a painted box", () => {
    const box = (w: string) => stack(pad("0 0 8px 0", wrap(`<td ${w} bgcolor="#eeeeee" style="background-color:#eee;">a</td>`)), "<td>b</td>");
    flags(box('width="300"'), box('style="width:300px;"').replace('style="background-color:#eee;"', ""), "width");
    flags(box('width="300"'), box('width="50%"'), "50%");
  });

  it("a height or min-height on a cell that would otherwise dissolve", () => {
    flags(flat, stack(pad("0 0 8px 0", wrap('<td style="min-height:40px;">a</td>')), "<td>b</td>"), "min-height");
    flags(flat, stack(pad("0 0 8px 0", wrap('<td height="40">a</td>')), "<td>b</td>"), "height");
    flags(stack(`<td height="40" style="padding:0 0 8px 0;">${wrap("<td>a</td>")}</td>`, "<td>b</td>"), stack('<td height="40" style="padding:0 0 8px 0;">a</td>', "<td>b</td>"), "table");
  });
});

describe("normalize keeps: alignment and direction", () => {
  const flat = (attrs = "", style = "") => stack(`<td ${attrs} style="${style}padding:0 0 8px 0;">a</td>`);
  const wrapped = (attrs = "", style = "", inner = "<td>a</td>", wrapper?: string) => stack(`<td ${attrs} style="${style}padding:0 0 8px 0;">${wrap(inner, wrapper)}</td>`);

  it("align or dir on the wrapper table, its cell or its row", () => {
    kept(flat(), wrapped(), wrapped("", "", "<td>a</td>", 'width="100%" align="center" style="width:100%;"'), 'align="center"');
    kept(flat(), wrapped(), wrapped("", "", "<td>a</td>", 'width="100%" dir="rtl" style="width:100%;"'), 'dir="rtl"');
    for (const inner of ['<td align="right">a</td>', '<td valign="top">a</td>', '<td dir="rtl">a</td>', '<td style="text-align:center;">a</td>'])
      kept(flat(), wrapped(), wrapped("", "", inner));
    kept(flat(), wrapped(), stack(pad("0 0 8px 0", `<table width="100%" style="width:100%;" ${T}><tr dir="rtl"><td>a</td></tr></table>`)));
  });

  it("align, dir or text-align on the outer cell, which the wrapper's content would not inherit", () => {
    same(flat(), wrapped());
    flags(flat('align="center"'), wrapped('align="center"'), "table");
    flags(flat('dir="rtl"'), wrapped('dir="rtl"'), "table");
    flags(flat("", "text-align:center;"), wrapped("", "text-align:center;"), "table");
    flags(flat("", "direction:rtl;"), wrapped("", "direction:rtl;"), "table");
  });
});

describe("normalize keeps: text styles from the outer row, section and table", () => {
  const outer = (inner: string, table = "", section = "", tr = "", td = "td") =>
    `<table ${T} width="300" style="width:300px;table-layout:fixed;${table}"><tbody${section}><tr${tr}><${td} style="padding:0 0 8px 0;">${inner}</${td}></tr></tbody></table>`;
  const both = (...a: [string?, string?, string?, string?]) => [outer(wrap("<td>a</td>"), ...a), outer("a", ...a)] as const;

  it("dissolves with nothing on them", () => {
    same(...both());
  });

  it("align, text styles or nowrap on the row or section, or text styles on the table", () => {
    const cases: Array<[string?, string?, string?, string?]> = [
      ["", "", ' align="center"'],
      ["", "", ' style="text-align:center"'],
      ["", ' align="center"'],
      ["", "", ' style="font-size:30px"'],
      ["", "", ' style="line-height:40px"'],
      ["font-size:30px;"],
      ["line-height:40px;"],
      ["", "", "", "th"],
    ];
    for (const c of cases) flags(...both(...c), "<table");
    const nowrap = (inner: string) => outer(inner).replace("<td style", "<td nowrap style");
    flags(nowrap(wrap("<td>aaa bbb ccc ddd</td>")), nowrap("aaa bbb ccc ddd"), "<table");
  });

  it("a painted box hoisted into a table with text styles", () => {
    const hoisted = (box: string) => `<table ${T} width="300" style="width:300px;table-layout:fixed;font-size:30px;"><tr>${box}</tr></table>`;
    flags(hoisted(`<td>${wrap(BOX)}</td>`), hoisted(BOX), "<td");
  });
});

describe("normalize keeps: a fixed-layout wrapper in a table that sizes to its content", () => {
  const img = '<td><img width="300" height="20" style="display:block;background:#f00" src=""></td>';
  const outer = (inner: string, style = "") => `<table ${T} style="${style}"><tr><td style="padding:0;">${inner}</td><td style="background:#00f">z</td></tr></table>`;

  it("dissolves in a fixed outer table, or when the wrapper sizes to its content too", () => {
    same(outer(wrap(img), "width:400px;table-layout:fixed;"), outer(img.slice(4, -5), "width:400px;table-layout:fixed;"));
    same(outer(wrap(img, 'width="100%" style="width:100%;"')), outer(img.slice(4, -5)));
  });

  it("keeps it in an auto-layout outer table", () => {
    flags(outer(wrap(img)), outer(img.slice(4, -5)), "<table");
  });
});

describe("normalize keeps: text styles", () => {
  const flat = (style: string) => stack(`<td style="${style}padding:0 0 8px 0;">a</td>`);
  const wrapped = (style: string, inner = "<td>a</td>") => stack(`<td style="${style}padding:0 0 8px 0;">${wrap(inner)}</td>`);

  it("font, colour and line-height on an outer cell keep its wrapper", () => {
    same(flat(""), wrapped(""));
    for (const style of ["font-family:Georgia, serif;", "font-size:18px;", "color:#ff0000;", "line-height:30px;", "letter-spacing:1px;", "white-space:nowrap;", "text-transform:uppercase;"])
      flags(flat(style), wrapped(style), "table");
  });

  it("text styles on the wrapper's own cell or table", () => {
    kept(flat(""), wrapped(""), wrapped("", '<td style="font-size:18px;">a</td>'));
    kept(flat(""), wrapped(""), wrapped("", '<td style="color:#ff0000;">a</td>'));
    kept(flat(""), wrapped(""), stack(pad("0 0 8px 0", wrap("<td>a</td>", 'width="100%" style="width:100%;font-family:Georgia;"'))), "font-family");
  });

  it("a text style that differs on a painted box", () => {
    const box = (style: string) => stack(pad("0 0 8px 0", wrap(`<td bgcolor="#eeeeee" style="background-color:#eee;${style}">a</td>`)), "<td>b</td>");
    flags(box("color:#111;"), box("color:#f00;"), "#f00");
    flags(box("line-height:22px;"), box("line-height:30px;"), "30px");
  });
});

describe("normalize keeps: MSO behaviour", () => {
  const flat = stack(pad("0 0 8px 0", "a"), "<td>b</td>");

  it("conditional comments, and what they say", () => {
    const ghost = (w: number) => `<!--[if mso]><table ${T} width="${w}"><tr><td width="${w}"><![endif]-->`;
    kept(flat, stack(pad("0 0 8px 0", wrap("<td>a</td>")), "<td>b</td>"), stack(pad("0 0 8px 0", wrap(`<td>${ghost(600)}a</td>`)), "<td>b</td>"));
    flags(stack(pad("0 0 8px 0", `${ghost(600)}a`)), stack(pad("0 0 8px 0", `${ghost(640)}a`)), "640");
    flags(stack(pad("0 0 8px 0", "<!--[if mso]>x<![endif]-->a")), stack(pad("0 0 8px 0", "<!--[if !mso]><!-->x<!--<![endif]-->a")), "!mso");
  });

  it("a ghost table between stacked rows stops the gap from moving", () => {
    const rows = (upper: string, lower: string) => `<table ${T} width="100%"><tr>${upper}</tr><!--[if mso]></td></tr><tr><td><![endif]--><tr>${lower}</tr></table>`;
    flags(rows(pad("0 0 8px 0", "a"), "<td>b</td>"), rows("<td>a</td>", pad("8px 0 0 0", "b")), "padding");
  });

  it("mso-* on the outer cell, the wrapper or the wrapped cell", () => {
    flags(stack(pad("0 0 8px 0", "a", "mso-line-height-rule:exactly;")), stack(pad("0 0 8px 0", wrap("<td>a</td>"), "mso-line-height-rule:exactly;")), "table");
    flags(flat, stack(pad("0 0 8px 0", wrap("<td>a</td>", 'width="100%" style="width:100%;mso-table-lspace:0pt;"')), "<td>b</td>"), "mso-table-lspace");
    flags(flat, stack(pad("0 0 8px 0", wrap('<td style="mso-padding-alt:0 0 8px 0;">a</td>')), "<td>b</td>"), "mso-padding-alt");
    flags(stack(pad("0 0 8px 0", "a"), "<td>b</td>"), stack(pad("0 0 8px 0", "a", "mso-padding-alt:0;"), "<td>b</td>"), "mso-padding-alt");
  });

  it("VML that differs", () => {
    const vml = (fill: string) => stack(pad("0 0 8px 0", `<!--[if gte mso 9]><v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;"><v:fill type="tile" color="${fill}" /><![endif]-->a`));
    flags(vml("#eeeeee"), vml("#eeeeef"), "#eeeeef");
    flags(stack(pad("0 0 8px 0", "a")), vml("#eeeeee"), "v:rect");
  });
});

describe("normalize keeps: spacing across painted boundaries", () => {
  const LOWER = '<td bgcolor="#dddddd" style="background-color:#ddd;">Lower</td>';

  it("padding moved from outside a painted box to inside it", () => {
    flags(stack(pad("0 0 8px 0", wrap(BOX)), "<td>b</td>"), stack(BOX.replace("padding:8px;", "padding:8px 8px 16px 8px;"), "<td>b</td>"), "padding");
    flags(stack(pad("0 8px", wrap(BOX))), stack(BOX.replace("padding:8px;", "padding:8px 16px;")), "padding");
  });

  it("a gap moved across a painted edge", () => {
    flags(stack(pad("0 0 16px 0", "a"), BOX, "<td>b</td>"), stack("<td>a</td>", BOX, pad("16px 0 0 0", "b")), "padding");
    flags(stack(pad("0 0 16px 0", wrap(BOX)), LOWER), stack(BOX, LOWER.replace('style="', 'style="padding:16px 0 0 0;')), "[gap");
  });

  it("a gap that changes size", () => {
    flags(stack(pad("0 0 16px 0", wrap(BOX)), "<td>b</td>"), stack(BOX, pad("24px 0 0 0", "b")), "[gap");
    flags(stack(pad("0 0 16px 0", "a"), "<td>b</td>"), stack("<td>a</td>", pad("12px 0 0 0", "b")), "12px");
    flags(stack(pad("0 8px", wrap("<td>a</td>"))), stack(pad("0 12px", "a")), "12px");
  });
});

describe("normalize keeps: a gap only the passes can make", () => {
  it("an attribute in the input never stands for a gap", () => {
    for (const fake of ['x-gap="0 0 8 0"', '[gap="0 0 8 0"'])
      flags(stack(pad("0 0 8px 0", wrap(BOX)), "<td>b</td>"), stack(BOX.replace("<td ", `<td ${fake} `), "<td>b</td>"), "gap");
  });
});

describe("normalize equates: the same spacing spelled two ways", () => {
  it("a wrapper with a bare padding cell dissolves into the cell around it", () => {
    same(stack(pad("0 0 16px 0", wrap(pad("0 8px", "a"))), "<td>b</td>"), stack(pad("0 8px 16px 8px", "a"), "<td>b</td>"));
    same(stack(pad("0 0 16px 0", wrap(pad("0 0 8px 0", wrap("<td>a</td>"))))), stack(pad("0 0 24px 0", "a")));
    same(stack(pad("0 0 16px 0", wrap("<td>a</td>", 'width="100%"'))), stack(pad("0 0 16px 0", "a")));
  });

  it("a wrapper around a painted box becomes the box's outside gap", () => {
    same(stack(pad("0 0 8px 0", wrap(BOX)), "<td>b</td>"), stack(BOX, pad("8px 0 0 0", "b")));
  });

  it("the gap between stacked single-cell rows is summed onto the upper row", () => {
    same(stack(pad("0 0 8px 0", "a"), pad("8px 0 0 0", "b")), stack(pad("0 0 16px 0", "a"), "<td>b</td>"));
    same(stack(pad("0 0 8px 0", "a"), pad("8px 0 4px 0", "b"), pad("4px 0 0 0", "c")), stack("<td>a</td>", pad("16px 0 0 0", "b"), pad("8px 0 0 0", "c")));
    same(stack(BOX, pad("8px 0 0 0", "b")), stack(pad("0 0 8px 0", wrap(BOX)), "<td>b</td>"));
  });

  it("formatting whitespace and padding spelled as shorthand or sides", () => {
    same(stack(pad("0 0 8px 0", "a")), stack('<td style="padding-bottom:8px;">a</td>').replace(/></g, ">\n  <"));
  });

  // the output's long lines are broken after a declaration or rule (docs/support.md#size-limits), and
  // the two renders can break in different places
  it("a line break after a declaration or rule", () => {
    same('<p style="color:red;font-size:12px">x</p>', '<p style="color:red;\nfont-size:12px">x</p>');
    same("<style>.a{color:red;margin:0}.b{color:blue}</style><p>x</p>", "<style>.a{color:red;\nmargin:0}\n.b{color:blue}</style><p>x</p>");
    flags('<p style="font-family:\'a;b\'">x</p>', '<p style="font-family:\'a;\nb\'">x</p>', "a;");
  });
});

// The two real paths: the source with its hints evaluated, compiled (the HTML render), and the
// compiled template filled by the engine. The banner is an `if` arm whose spacing the two spell differently.
describe("normalize on real compiles", () => {
  let fill: Fill;
  beforeAll(async () => {
    fill = (await engine(resolve(import.meta.dirname, "../../.."), "liquid"))!;
  });
  const BANNER = "margin:24px 0;padding:6px 12px;background:#fef9c3;";
  const page = (banner = BANNER, attrs = "") => `<div style="max-width:600px;margin:0 auto;padding:24px;font-family:Arial,sans-serif;font-size:15px;line-height:22px;color:#1f2937;">
  <div style="margin:0 0 16px 0;padding:6px 12px;background:#f3f4f6;">Before</div>
  <div data-email-if="banner" ${attrs} style="${banner}">Sale</div>
  <div style="margin:16px 0 0 0;padding:6px 12px;background:#f3f4f6;">After</div>
</div>`;
  const html = (src: string, data: Record<string, unknown>) => compile(preview(src, data)).html;
  const filled = (src: string, data: Record<string, unknown>) => fill(compile(src, { template: "liquid" }).html, data);
  const SHOWN = { banner: true };

  it("reads the same for the arm shown and dropped, though the gaps sit on other cells", () => {
    for (const data of [SHOWN, { banner: false }]) {
      expect(filled(page(), data)).not.toBe(html(page(), data));
      same(html(page(), data), filled(page(), data));
    }
  });

  it("flags a meaningful change to the arm when it is shown", () => {
    const cases: Array<[string, string, string?]> = [
      // unpainted, its gap sums with the one above
      ["margin:24px 0;padding:6px 12px;", "[gap"],
      [BANNER.replace("#fef9c3", "#fef9c4"), "#fef9c4"],
      [BANNER + "background-image:url(https://x.test/a.png);", "background="],
      [BANNER + "border:1px solid #000;", "border"],
      [BANNER + "border-radius:8px;", "border-radius"],
      [BANNER + "display:none;", "[gap"],
      [BANNER + "min-height:60px;", "height"],
      [BANNER + "width:300px;", "padding"],
      [BANNER + "text-align:center;", "text-align"],
      [BANNER, "direction", 'dir="rtl"'],
      [BANNER + "color:#f00;", "#f00"],
      [BANNER + "font-family:Georgia,serif;", "Georgia"],
      [BANNER + "line-height:30px;", "30px"],
      // the gap grows, or moves inside the painted box
      ["margin:32px 0;padding:6px 12px;background:#fef9c3;", "[gap"],
      ["margin:16px 0 0 0;padding:14px 12px 30px;background:#fef9c3;", "[gap"],
    ];
    for (const [banner, at, attrs] of cases) flags(html(page(), SHOWN), filled(page(banner, attrs), SHOWN), at);
  });
});

describe("normalize keeps: what HTML's own defaults add", () => {
  it("padding in a table without cellpadding, whose cells have 1px on the sides a style leaves out", () => {
    flags('<table><tr><td style="padding-bottom:4px">a</td></tr></table>', '<table><tr><td style="padding:0 0 4px 0">a</td></tr></table>', "padding");
    flags(`<table><tr><td style="padding:0;">a</td></tr><tr>${pad("0 0 4px 0", "b")}</tr></table>`, `<table><tr><td>a</td></tr><tr>${pad("4px 0 0 0", "b")}</tr></table>`, "padding");
  });

  it("a wrapper without cellspacing or cellpadding, which spaces and pads its cell", () => {
    for (const attrs of ['cellpadding="0"', 'cellspacing="0"'])
      flags(stack(pad("0 0 12px 0", "a")), stack(pad("0 0 8px 0", `<table width="100%" ${attrs}><tr>${pad("0 0 4px 0", "a")}</tr></table>`)), "padding");
  });

  it("author tables as the compiler passes them through", () => {
    const [x, y] = ['<table><tr><td style="padding-bottom:4px">a</td></tr></table>', '<table><tr><td style="padding:0 0 4px 0">a</td></tr></table>'].map((src) => compile(src).html);
    flags(x!, y!, "padding");
  });

  it("rows beside a rowspan cell, which are columns", () => {
    const span = (a: string, b: string) => `<table ${T} width="100%"><tr>${a}</tr><tr>${b}</tr></table>`;
    flags(span('<td rowspan="2" style="padding:0 0 8px 0;">a</td>', "<td>b</td>"), span('<td rowspan="2">a</td>', pad("8px 0 0 0", "b")), "padding");
  });

  it("a header cell, whose text is bold and centred", () => {
    kept(stack(pad("0 0 8px 0", "a")), stack(pad("0 0 8px 0", wrap(pad("0", "a")))), stack(pad("0 0 8px 0", wrap('<th style="padding:0;">a</th>'))));
  });

  it("the space next to an inline image", () => {
    flags('<p>Hi <img src="a.png" alt=""></p>', '<p>Hi<img src="a.png" alt=""></p>', "Hi");
    flags('<p><img src="a.png" alt=""> Ada</p>', '<p><img src="a.png" alt="">Ada</p>', "Ada");
  });

  it("spaces and line breaks in preformatted text", () => {
    flags("<pre>a  b</pre>", "<pre>a b</pre>", "a");
    flags("<pre>a\nb</pre>", "<pre>a b</pre>", "a");
    flags('<div style="white-space:pre-wrap;">a  b</div>', '<div style="white-space:pre-wrap;">a b</div>', "a");
    same('<div style="white-space:nowrap;">a  b</div>', '<div style="white-space:nowrap;">a b</div>');
  });
});

describe("normalize keeps: text and attributes as written", () => {
  it("the space beside a comment, which meets the text past it", () => {
    flags("<p>Hello <!--[if mso]>x<![endif]--> World</p>", "<p>Hello<!--[if mso]>x<![endif]-->World</p>", "Hello");
    flags("<p>Hello <!-- x -->World</p>", "<p>Hello<!-- x -->World</p>", "Hello");
    same("<div>\n  <!--[if mso]>x<![endif]-->\n  <p>a</p>\n</div>", "<div><!--[if mso]>x<![endif]--><p>a</p></div>");
  });

  it("the space between inline-block elements, not between blocks", () => {
    const two = (style: string, gap: string) => `<div><div style="display:${style};width:100px;background:#f00">a</div>${gap}<div style="display:${style};width:100px;background:#00f">b</div></div>`;
    flags(two("inline-block", " "), two("inline-block", ""), "<div");
    same(two("block", " "), two("block", ""));
    same('<td><img style="display:block" src="a.png" alt=""> <img style="display:block" src="b.png" alt=""></td>', '<td><img style="display:block" src="a.png" alt=""><img style="display:block" src="b.png" alt=""></td>');
  });

  it("markup and escaped text inside an MSO comment", () => {
    flags("<!--[if mso]><table><tr><td><![endif]-->", "<!--[if mso]>&lt;table&gt;&lt;tr&gt;&lt;td&gt;<![endif]-->", "&lt;");
    flags("<!--[if mso]>a&#60;b<![endif]-->", "<!--[if mso]>a<b<![endif]-->", "a");
    flags("<!--[if mso]>a&nbsp;&nbsp;b<![endif]-->", "<!--[if mso]>a b<![endif]-->", "a");
    same("<!--[if mso]>a&nbsp;b<![endif]-->", "<!--[if mso]>a\u00a0b<![endif]-->");
  });

  it("spaces inside a link, alt text or a quoted font name", () => {
    flags('<a href="https://x.test/a b">x</a>', '<a href="https://x.test/a  b">x</a>', "href");
    flags('<img alt="a  b" src="a.png">', '<img alt="a b" src="a.png">', "alt");
    flags('<p style="font-family:\'My  Font\'">x</p>', '<p style="font-family:\'My Font\'">x</p>', "My");
    same('<p class=" a  b " style=" color:red;  font-size:12px ">x</p>', '<p class="a b" style="color:red; font-size:12px">x</p>');
  });
});

import { describe, expect, it } from "vitest";
import { TRACE_ATTR } from "../../../src/emit/trace.ts";
import { diffVariant, parseStyle, tokenize, type Compiled, type Mismatch } from "../../../src/responsive/diff.ts";

// every marker in the html names an author element, except the text runs listed
const MARKERS = new RegExp(`${TRACE_ATTR}="([^"]*)"`, "g");
const compiled = (html: string, textRuns: readonly string[] = []): Compiled => ({
  html,
  elements: new Set([...html.matchAll(MARKERS)].map((m) => m[1]!).filter((m) => !textRuns.includes(m))),
});
const diff = (base: string, variant: string, textRuns: readonly string[] = []) => diffVariant(compiled(base, textRuns), compiled(variant, textRuns), "max-width 480px");

const overrides = (base: string, variant: string, textRuns: readonly string[] = []) => {
  const d = diff(base, variant, textRuns);
  if ("error" in d) throw new Error(d.error);
  return d.overrides.map((o) => ({ ...o, decls: o.decls.map(([p, v]) => `${p}:${v}`) }));
};
const mismatch = (base: string, variant: string): Mismatch => {
  const d = diff(base, variant);
  if (!("error" in d)) throw new Error("expected an error");
  return d;
};
const error = (base: string, variant: string): string => mismatch(base, variant).error;
// a tag as a traced compile writes it: the author element it came from, as line:col
const from = (loc: string): string => ` ${TRACE_ATTR}="${loc}"`;

describe("tokenize", () => {
  it("lists tags, skipping comments and text", () => {
    const tags = tokenize('<!--[if mso]><table><![endif]--><td a="x>y">hi</td><!--[if !mso]><!--><br><!--<![endif]-->');
    expect(tags.map((t) => (t.closing ? "/" : "") + t.name)).toEqual(["td", "/td", "br"]);
  });
  it("keeps positions", () => {
    const html = "ab<p>c</p>";
    const [p] = tokenize(html);
    expect(html.slice(p!.start, p!.end)).toBe("<p>");
  });
});

describe("parseStyle", () => {
  it("splits on ; outside url() and quotes, and drops !important", () => {
    expect(parseStyle("a:b; background:url(data:x;y) ; font-family:'a;b', c !important;;")).toEqual([
      ["a", "b"],
      ["background", "url(data:x;y)"],
      ["font-family", "'a;b', c"],
    ]);
  });
});

describe("diffVariant", () => {
  it("a changed declaration is overridden with the variant's value", () => {
    expect(overrides('<td style="padding:24px;color:red">x</td>', '<td style="padding:12px;color:red">x</td>')).toEqual([
      { index: 0, decls: ["padding:12px"] },
    ]);
  });

  it("an added declaration is overridden", () => {
    expect(overrides('<td style="color:red">x</td>', '<td style="color:red;font-size:14px">x</td>')[0]!.decls).toEqual(["font-size:14px"]);
  });

  it("a declaration only in the base goes back to its reset", () => {
    expect(overrides('<div style="padding:8px;max-height:0">x</div>', "<div>x</div>")[0]!.decls).toEqual(["padding:0", "max-height:none"]);
  });

  it("display resets by tag", () => {
    const base = (tag: string) => `<${tag} style="display:none"></${tag}>`;
    const plain = (tag: string) => `<${tag}></${tag}>`;
    expect(overrides(base("td"), plain("td"))[0]!.decls).toEqual(["display:table-cell"]);
    expect(overrides(base("span"), plain("span"))[0]!.decls).toEqual(["display:inline"]);
    expect(overrides(base("div"), plain("div"))[0]!.decls).toEqual(["display:block"]);
  });

  it("mso-* differences are ignored", () => {
    expect(overrides('<td style="mso-hide:all;color:red">x</td>', '<td style="color:red">x</td>')).toEqual([]);
  });

  it("differences inside MSO conditionals are ignored", () => {
    const base = '<!--[if mso]><table width="600"><tr><td><![endif]--><p>x</p><!--[if mso]></td></tr></table><![endif]-->';
    const variant = '<!--[if mso]><table width="320"><tr><td><![endif]--><p>x</p><!--[if mso]></td></tr></table><![endif]-->';
    expect(overrides(base, variant)).toEqual([]);
  });

  it("reads width, height, bgcolor and valign attributes as their CSS", () => {
    const base = '<td width="300" height="40" bgcolor="#111111" valign="top">x</td>';
    const variant = '<td width="150" height="40" bgcolor="#222222" valign="middle">x</td>';
    expect(overrides(base, variant)[0]!.decls).toEqual(["width:150px", "background-color:#222222", "vertical-align:middle"]);
  });

  it("align on a cell is text-align; on a table it can't be taken back", () => {
    expect(overrides('<td align="left">x</td>', '<td align="center">x</td>')[0]!.decls).toEqual(["text-align:center"]);
    expect(error('<table align="left"></table>', '<table align="center"></table>')).toMatch(/align attribute/);
  });

  it("a style declaration wins over the attribute it repeats", () => {
    expect(overrides('<td width="300" style="width:300px">x</td>', '<td width="150" style="width:150px">x</td>')[0]!.decls).toEqual(["width:150px"]);
  });

  it("an inherited property missing in the variant takes the nearest ancestor's value", () => {
    const base = '<td style="font-size:16px"><p style="font-size:18px">x</p></td>';
    const variant = '<td style="font-size:14px"><p>x</p></td>';
    expect(overrides(base, variant)).toEqual([
      { index: 0, decls: ["font-size:14px"] },
      { index: 1, decls: ["font-size:14px"] },
    ]);
  });

  it("a property with no safe reset is an error that names the variant", () => {
    const msg = error('<td style="text-align:center">x</td>', "<td>x</td>");
    expect(msg).toContain("max-width 480px");
    expect(msg).toContain("text-align");
  });

  it("a different tag sequence is an error quoting the first differing tag", () => {
    const msg = error('<table role="presentation"><tr><td>a</td></tr></table>', '<table role="presentation"><tr><td>a</td><td>b</td></tr></table>');
    expect(msg).toContain("max-width 480px");
    expect(msg).toContain('"</tr>"');
    expect(msg).toContain('"<td>"');
  });

  it("a shorter variant is a structure change too", () => {
    expect(error("<p>a</p><p>b</p>", "<p>a</p>")).toContain('"<p>"');
  });

  it("takes inherited values from the right ancestor when html closes tags implicitly", () => {
    // <li> without an end tag: the </ul> closes it, the second <p> sits under the td again
    const base = '<td style="color:#111"><ul><li>a<li>b</ul><p style="color:#222">x</p></td>';
    const variant = '<td style="color:#333"><ul><li>a<li>b</ul><p>x</p></td>';
    expect(overrides(base, variant).map((o) => o.decls)).toEqual([["color:#333"], ["color:#333"]]);
  });
});

describe("diffVariant checks what the overrides assume", () => {
  it("changed generated text is an error naming the element, both texts and the location", () => {
    const m = mismatch(`<p${from("3:5")}><span${from("3:5")}>Desktop</span>Hi</p>`, `<p${from("3:5")}><span${from("3:5")}>Mobile</span>Hi</p>`);
    expect(m.error).toBe('The max-width 480px rules change the generated text (::before / ::after) of the element at line 3, column 5: "Desktop" on the base, "Mobile" on this screen');
    expect(m.loc).toEqual({ line: 3, col: 5 });
    expect(m.hint).toMatch(/hide the others with display: none/);
  });

  it("changed text in an ordinary element is an error, quoted around the first difference", () => {
    const long = "A very long paragraph of copy that goes on and on before it ";
    const msg = error(`<td${from("2:1")}><p>${long}ends here</p></td>`, `<td${from("2:1")}><p>${long}stops here</p></td>`);
    expect(msg).toContain("change the text in <td> (from line 2, column 1)");
    expect(msg).toContain('"...on and on before it ends here" on the base, "...on and on before it stops here" on this screen');
  });

  it("text after the last tag and text that is only in one compile count too", () => {
    expect(error("<p>a</p>tail", "<p>a</p>other")).toContain('"tail" on the base, "other" on this screen');
    expect(error("<td><b>a</b></td>", "<td><b>a</b>!</td>")).toContain('"" on the base, "!" on this screen');
  });

  it("a run of whitespace counts as one space; whether there is any still counts", () => {
    expect(overrides("<td>\n<p>a  b</p>\n</td>", "<td>\n\n<p>a \n b</p>\n</td>")).toEqual([]);
    expect(error("<p>a b</p>", "<p>ab</p>")).toContain("change the text");
  });

  it("text and tags inside Outlook conditionals are not compared", () => {
    expect(overrides("<td>a<!--[if mso]>Desktop<![endif]--></td>", "<td>a<!--[if mso]>Mobile<br><![endif]--></td>")).toEqual([]);
    expect(overrides("<td><!--[if !mso]><!-->a<!--<![endif]--></td>", "<td>a</td>")).toEqual([]);
  });

  it("reordered elements with the same tag sequence are an error naming both", () => {
    const row = (a: string, b: string) => `<tr><td${from(a)}>x</td><td${from(b)}>x</td></tr>`;
    const m = mismatch(row("4:3", "5:3"), row("5:3", "4:3"));
    expect(m.error).toBe("The max-width 480px rules change the order of elements: the base has <td> (from line 4, column 3) where this screen has <td> (from line 5, column 3)");
    expect(m.loc).toEqual({ line: 4, col: 3 });
  });

  it("another element in the same place is an error too", () => {
    expect(error(`<td${from("4:3")}>x</td>`, `<td${from("9:3")}>x</td>`)).toContain("put another element in place");
  });

  it("compares identity only between element markers: the emitter marks a box-less cell with its text run", () => {
    // `.a{padding:10px}` on a screen: the cell of the block was marked with its text run, now with the block
    expect(overrides(`<td${from("1:127")}>One</td>`, `<td style="padding:10px;"${from("1:112")}>One</td>`, ["1:127"])[0]!.decls).toEqual(["padding:10px"]);
    expect(overrides(`<td${from("4:3")}>x</td>`, "<td>x</td>")).toEqual([]);
  });

  it.each([
    ["src", '<img src="a.png" alt="">', '<img src="b.png" alt="">', '"a.png" on the base, "b.png" on this screen'],
    ["href", '<a href="https://x.test/a">x</a>', '<a href="https://x.test/b">x</a>', '"https://x.test/a" on the base, "https://x.test/b"'],
    ["alt", '<img src="a.png" alt="Logo">', '<img src="a.png" alt="">', '"Logo" on the base, "" on this screen'],
    ["colspan", '<td colspan="2">x</td>', "<td>x</td>", '"2" on the base, none on this screen'],
    ["dir", '<p dir="rtl">x</p>', '<p dir="ltr">x</p>', '"rtl" on the base'],
    ["aria-hidden", "<span>x</span>", '<span aria-hidden="true">x</span>', 'none on the base, "true" on this screen'],
    ["role", '<table role="presentation"></table>', "<table></table>", '"presentation" on the base'],
    ["target", '<a href="#" target="_blank">x</a>', '<a href="#">x</a>', '"_blank" on the base'],
  ])("a changed %s is an error naming the attribute and both values", (attr, base, variant, values) => {
    const msg = error(base, variant);
    expect(msg).toContain(`change ${attr} on <`);
    expect(msg).toContain(values);
  });

  it("names the author element of an attribute change and points at it", () => {
    const m = mismatch(`<img${from("7:3")} src="a.png">`, `<img${from("7:3")} src="b.png">`);
    expect(m.error).toBe('The max-width 480px rules change src on <img> (from line 7, column 3): "a.png" on the base, "b.png" on this screen');
    expect(m.loc).toEqual({ line: 7, col: 3 });
  });

  it("classes and presentational attributes are not content: no error", () => {
    expect(overrides('<td class="t-0 x">a</td>', '<td class="x">a</td>')).toEqual([]);
    expect(overrides('<td width="300" align="left">a</td>', '<td width="150" align="center">a</td>')[0]!.decls).toEqual(["width:150px", "text-align:center"]);
  });

  it("the background attribute is read as its background-image", () => {
    expect(overrides('<td background="a.png">a</td>', '<td background="b.png">a</td>')[0]!.decls).toEqual(["background-image:url('b.png')"]);
    expect(overrides('<td background="a.png" style="background-image:url(\'a.png\')">a</td>', '<td background="b.png" style="background-image:url(\'b.png\')">a</td>')[0]!.decls).toEqual([
      "background-image:url('b.png')",
    ]);
  });

  it("quotes tags without their trace marker", () => {
    expect(error(`<p${from("1:1")}>a</p>`, `<div${from("1:1")}>a</div>`)).toContain('"<p>"');
  });

  it("a structure change points at the author element around it", () => {
    const m = mismatch(`<td${from("6:2")}><p>a</p></td>`, `<td${from("6:2")}><div>a</div></td>`);
    expect(m.loc).toEqual({ line: 6, col: 2 });
    expect(m.hint).toBeUndefined();
  });
});

describe("diffVariant reads attributes and whitespace the way they render", () => {
  it("hspace and vspace are the margins of a floated image: a change is an override, not an error", () => {
    const img = (n: number) => `<img src="a.png" align="left" hspace="${n}" vspace="${n}">`;
    expect(overrides(img(12), img(6))[0]!.decls).toEqual(["margin-left:6px", "margin-right:6px", "margin-top:6px", "margin-bottom:6px"]);
    expect(overrides(img(12), '<img src="a.png" align="left">')[0]!.decls).toEqual(["margin-left:0", "margin-right:0", "margin-top:0", "margin-bottom:0"]);
  });

  it("a width or height attribute that isn't a length can't be overridden: a change is an error", () => {
    expect(error('<td width="auto">a</td>', '<td width="300">a</td>')).toContain("change the width attribute of");
    expect(error('<img src="a.png" height="auto">', '<img src="a.png">')).toContain("change the height attribute of");
    expect(overrides('<td width="auto">a</td>', '<td width="auto">a</td>')).toEqual([]);
  });

  it("whitespace next to a block or table boundary can't render, so none and some are the same there", () => {
    expect(overrides("<td> <table></table></td>", "<td><table></table></td>")).toEqual([]);
    expect(overrides("<td>\n<p>a</p> </td>", "<td><p>a</p></td>")).toEqual([]);
    expect(overrides("<p>a <br> b</p>", "<p>a<br>b</p>")).toEqual([]);
  });

  it("between inline content it renders as a space, so it still counts", () => {
    expect(error("<p><b>a</b> <i>b</i></p>", "<p><b>a</b><i>b</i></p>")).toContain('" " on the base, "" on this screen');
  });

  it("under a pre white-space, own or inherited, text is compared exactly", () => {
    expect(error('<td style="white-space:pre">a b</td>', '<td style="white-space:pre">a  b</td>')).toContain('"a b" on the base, "a  b" on this screen');
    expect(error('<td style="white-space:pre-wrap"><span>a\n</span></td>', '<td style="white-space:pre-wrap"><span>a </span></td>')).toContain("change the text");
    expect(error('<div style="white-space:pre-line"><p>a\nb</p></div>', '<div style="white-space:pre-line"><p>a b</p></div>')).toContain("change the text");
    // a screen that turns pre on compares exactly too
    expect(error("<td>a b</td>", '<td style="white-space:break-spaces">a  b</td>')).toContain("change the text");
    expect(overrides('<td style="white-space:nowrap">a b</td>', '<td style="white-space:nowrap">a  b</td>')).toEqual([]);
  });

  it("decodes entities in attribute values, so a declaration carries the real url", () => {
    expect(overrides('<td background="a.jpg?w=1&amp;h=2">x</td>', '<td background="b.jpg?w=1&amp;h=2">x</td>')[0]!.decls).toEqual(["background-image:url('b.jpg?w=1&h=2')"]);
    const bg = (u: string) => `<td style="background-image:url('${u}?w=1&amp;h=2')">x</td>`;
    expect(overrides(bg("a.jpg"), bg("b.jpg"))[0]!.decls).toEqual(["background-image:url('b.jpg?w=1&h=2')"]);
    expect(error('<a href="x?a=1&amp;b=2">x</a>', '<a href="x?a=1&amp;b=3">x</a>')).toContain('"x?a=1&b=2" on the base, "x?a=1&b=3"');
  });
});


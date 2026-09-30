import { describe, expect, test } from "vitest";
import { compile } from "../../src/index.ts";

const body = (h: string) => h.slice(h.indexOf("<body"), h.indexOf("</body>"));
// what Gmail or Apple Mail reads: every comment ends at its first -->
const elsewhere = (h: string) => body(h).replace(/<!--[\s\S]*?-->/g, "").replace(/\n\s*\n/g, "\n");
// what Outlook reads: [if mso] content is live, [if !mso] content and plain comments are gone
const outlook = (h: string) =>
  body(h)
    .replace(/<!--\[if !mso\]><!-->[\s\S]*?<!--<!\[endif\]-->/g, "")
    .replace(/<!--\[if mso\]>([\s\S]*?)<!\[endif\]-->/g, "$1")
    .replace(/<!--[\s\S]*?-->/g, "");

const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

const row = (style: string, items: string[]) => `<div style="${style}">${items.join("")}</div>`;
const item = (style: string, text: string, hint = false) => `<div style="${style}"${hint ? ' data-email="outlook-only"' : ""}>${text}</div>`;

// the row without its outlook-only items is what every other client has to get, byte for byte
const sameElsewhere = (withItem: string, without: string, sameDiagnostics = true) => {
  const a = compile(withItem).html;
  const b = compile(without).html;
  expect(elsewhere(a)).toBe(elsewhere(b));
  expect(elsewhere(a)).not.toContain("OOX");
  expect(outlook(a)).toContain("OOX");
  // tables the Outlook side opens are closed again
  expect(count(outlook(a), /<table\b/g)).toBe(count(outlook(a), /<\/table>/g));
  expect(count(outlook(a), /<td\b/g)).toBe(count(outlook(a), /<\/td>/g));
  if (sameDiagnostics) expect(compile(withItem).diagnostics.filter((d) => d.severity !== "info")).toEqual(compile(without).diagnostics.filter((d) => d.severity !== "info"));
};

describe("outlook-only flex item", () => {
  const f = "display:flex";
  const A = item("width:200px", "A");
  const B = item("width:200px", "B");
  const O = item("width:100px", "OOX", true);

  test("middle px item leaves no cell for other clients", () => {
    sameElsewhere(row(f, [A, O, B]), row(f, [A, B]));
  });
  test("first and last px item", () => {
    sameElsewhere(row(f, [O, A, B]), row(f, [A, B]));
    sameElsewhere(row(f, [A, B, O]), row(f, [A, B]));
  });
  test("the cell and its width stay in the Outlook side", () => {
    const out = outlook(compile(row(f, [A, O, B])).html);
    expect(out).toMatch(/<td[^>]*width="100"[^>]*>[\s\S]*OOX/);
  });
  test("percent columns share the row as if the item weren't there", () => {
    sameElsewhere(row(f, [item("width:50%", "A"), O, item("width:50%", "B")]), row(f, [item("width:50%", "A"), item("width:50%", "B")]));
  });
  test("grow columns and gaps ignore the item", () => {
    const g = "display:flex;gap:20px";
    sameElsewhere(row(g, [item("flex:1", "A"), O, item("flex:1", "B")]), row(g, [item("flex:1", "A"), item("flex:1", "B")]));
    sameElsewhere(row(g, [item("flex:1", "A"), item("width:100px", "OOX", true), item("width:120px", "B")]), row(g, [item("flex:1", "A"), item("width:120px", "B")]));
  });
  test("an item without a width", () => {
    sameElsewhere(row(f, [A, item("", "OOX", true), B]), row(f, [A, B]));
  });
  test("a rounded button as the item", () => {
    const btn = `<a data-email="outlook-only" href="https://x.test" style="display:inline-block;padding:10px 20px;background:#00f;color:#fff;border-radius:6px">OOX</a>`;
    sameElsewhere(row(f, [A, btn, B]), row(f, [A, B]), false); // the button's own warnings stay
  });
  test("a column flex container with a gap", () => {
    const c = "display:flex;flex-direction:column;gap:16px";
    sameElsewhere(row(c, [item("", "A"), item("", "OOX", true), item("", "B")]), row(c, [item("", "A"), item("", "B")]));
    sameElsewhere(row(c, [item("", "OOX", true), item("", "A"), item("", "B")]), row(c, [item("", "A"), item("", "B")]));
  });
  test("an item holding its own Outlook-only markup keeps only the Outlook side", () => {
    const inner = `<div data-email="outlook-only" style="width:100px"><div style="max-width:60px;margin:0 auto;background:#eee">OOX</div></div>`;
    sameElsewhere(row(f, [A, inner, B]), row(f, [A, B]));
  });
});

describe("outlook-only wrapping item", () => {
  const w = "display:flex;flex-wrap:wrap";
  const A = item("flex:0 0 200px", "A");
  const B = item("flex:0 0 200px", "B");
  const O = item("flex:0 0 100px", "OOX", true);
  test("middle item", () => {
    sameElsewhere(row(w, [A, O, B]), row(w, [A, B]));
  });
  test("first and last item", () => {
    sameElsewhere(row(w, [O, A, B]), row(w, [A, B]));
    sameElsewhere(row(w, [A, B, O]), row(w, [A, B]));
  });
  test("lines break where they would without the item", () => {
    const three = [A, B, item("flex:0 0 200px", "C"), item("flex:0 0 200px", "D")];
    sameElsewhere(row(w, [three[0]!, three[1]!, O, three[2]!, three[3]!]), row(w, three));
  });
  test("share columns with a gap", () => {
    const g = "display:flex;flex-wrap:wrap;gap:20px";
    sameElsewhere(row(g, [item("flex:0 0 calc(50% - 10px)", "A"), O, item("flex:0 0 calc(50% - 10px)", "B")]), row(g, [item("flex:0 0 calc(50% - 10px)", "A"), item("flex:0 0 calc(50% - 10px)", "B")]));
  });
  test("the ghost cell is Outlook's alone", () => {
    const out = outlook(compile(row(w, [A, O, B])).html);
    expect(out).toMatch(/<td width="100"[^>]*>[\s\S]*OOX/);
  });
});

describe("outlook-only grid cell", () => {
  const g = "display:grid;grid-template-columns:1fr 1fr";
  const cell = (t: string) => item("", t);
  const O = item("", "OOX", true);
  test("the other cells fill the grid as if it weren't there", () => {
    sameElsewhere(row(g, [cell("A"), O, cell("B"), cell("C")]), row(g, [cell("A"), cell("B"), cell("C")]));
  });
  test("first and last", () => {
    sameElsewhere(row(g, [O, cell("A"), cell("B")]), row(g, [cell("A"), cell("B")]));
    sameElsewhere(row(g, [cell("A"), cell("B"), O]), row(g, [cell("A"), cell("B")]));
  });
  test("with gaps and px tracks", () => {
    const p = "display:grid;grid-template-columns:100px 1fr;gap:10px 20px";
    sameElsewhere(row(p, [cell("A"), cell("B"), O, cell("C")]), row(p, [cell("A"), cell("B"), cell("C")]));
  });
});

describe("a container with nothing but outlook-only items", () => {
  const p = (t: string) => `<p>${t}</p>`;
  const O = (t = "OOX") => item("width:50px", t, true);
  const bare = ["display:flex", "display:flex;gap:10px;margin:12px 0", "display:flex;flex-wrap:wrap", "display:grid;grid-template-columns:1fr 1fr"];
  test.each(bare)("a bare one (%s) is nothing for other clients", (style) => {
    sameElsewhere(`${p("A")}${row(style, [O("OOX"), O("OOX2")])}${p("B")}`, `${p("A")}${p("B")}`);
  });
  test("the Outlook side keeps the row and its cells", () => {
    const out = outlook(compile(`${p("A")}${row("display:flex", [O(), O("OOX2")])}`).html);
    expect(count(out, /<td[^>]*width="50"/g)).toBe(2);
  });
  // an empty row with a painted or padded box leaves its filler cell
  const boxed = ["display:flex;background:#eee;padding:8px", "display:flex;flex-wrap:wrap;padding:8px", "display:flex;min-height:40px"];
  test.each(boxed)("a boxed one (%s) is its empty box for other clients", (style) => {
    sameElsewhere(`${p("A")}${row(style, [O()])}${p("B")}`, `${p("A")}${row(style, [])}${p("B")}`);
  });
  test("a boxed grid keeps the box cell's type for Outlook and gives the rest a filler row", () => {
    const { html } = compile(`${p("A")}${row("display:grid;grid-template-columns:1fr 1fr;padding:8px", [O()])}${p("B")}`);
    expect(html).toContain('<td style="padding:8px 8px 24px 8px;">');
    expect(html).toContain('<!--[if !mso]><!--><tr>\n<td style="font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td>\n</tr><!--<![endif]-->');
  });
});

describe("outlook-only block", () => {
  test("margins around it collapse as if it weren't there", () => {
    const p = (t: string) => `<p style="margin:12px 0">${t}</p>`;
    sameElsewhere(`${p("A")}<div data-email="outlook-only" style="padding:8px">OOX</div>${p("B")}`, `${p("A")}${p("B")}`);
  });
});

describe("outlook-only button", () => {
  const btn = (attr: string) => `<a ${attr} href="https://x.test" style="display:inline-block;padding:10px 20px;background:#00f;color:#fff;border-radius:6px">OOX</a>`;
  test("VML stays, the link goes", () => {
    const h = compile(`<p>x</p>${btn('data-email="outlook-only"')}`).html;
    expect(elsewhere(h)).not.toContain("OOX");
    expect(elsewhere(h)).not.toContain("<a ");
    const out = outlook(h);
    expect(out).toContain("v:roundrect");
    expect(out).not.toContain("<a ");
  });
});

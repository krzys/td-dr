import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compile, toText } from "../../../src/index.ts";

const golden = (path: string) => readFileSync(new URL(`../../fixtures/${path}`, import.meta.url), "utf8");
const BLOCK_TAG = /(?<!\\)\{\{~?\s*(?:[#^/]|else\b)[\s\S]*?\}\}|\{%[\s\S]*?%\}/g;
const MSO = /<!--\[if mso[\s\S]*?<!\[endif\]-->/g;

describe("toText on goldens", () => {
  it("field-guide: what the reader sees, in reading order", () => {
    const text = toText(golden("real-world/field-guide/expected.html"));
    // the preheader and the dark logo are hidden, the Outlook button is Outlook's
    expect(text).not.toContain("Twelve trails, three new jackets");
    expect(text.match(/Pinewick Outfitters\n/g)).toHaveLength(2); // the logo once, the footer once
    expect(text.match(/Read the guide/g)).toHaveLength(1);
    expect(text.startsWith("Pinewick Outfitters\n(https://pinewick.example/?utm_source=email&utm_medium=newsletter&utm_campaign=autumn-26)\n\n")).toBe(true);
    expect(text).toContain("New (https://pinewick.example/new) Trail (https://pinewick.example/trail) Camp\n(https://pinewick.example/camp)");
    expect(text).toContain("\n\nShorter days, longer trails\n===========================\n\n");
    expect(text).toContain("\n\nLayers that pull their weight\n-----------------------------\n\n");
    expect(text).toContain("Read the guide → (https://pinewick.example/guide)");
    expect(text).toContain("- Map and compass, even with a phone\n- 1 litre of water per three hours\n- Emergency blanket\n");
    expect(text).toContain("Shell | Layers | Weight | Price\nTarn | 2.5 | 210 g | €119\n");
    expect(text).toContain("Fernway wind |  | 95 g | €69");
    // images by their alt, links around them by it too
    expect(text).toContain("Ridgeline insulated jacket in rust");
    expect(text).toContain("Tent at dawn by a loch (https://pinewick.example/community/1)");
    // a number or address said once when the label already is it
    expect(text).toContain("Book on 0131 555 0192, by text (+447700900123) or email\n(shop@pinewick.example).");
    expect(text).toContain("כתבו ל־shop@pinewick.example או");
    // emoji sequences keep their joiners
    expect(text).toContain("👩\u200d👩\u200d👧\u200d👦");
    expect(text).not.toMatch(/&[a-z]+;|&#\d+;|<[a-z]/);
    expect(text).not.toMatch(/\n\n\n|[ \t]\n/);
    for (const line of text.split("\n")) if (line.length > 78) expect(line).not.toContain(" ");
  });

  it("receipt (handlebars): block tags on their own lines, fields as written", () => {
    expect(toText(golden("templates/receipt/expected.handlebars.html"))).toBe(
      [
        "{{brand.name}} Order {{order.id}}",
        "",
        "Thanks, {{user.name}}",
        "=====================",
        "",
        "Placed on {{order.date}}",
        "",
        "{{#if paid}}",
        "Paid with {{order.card}}. No further action needed.",
        "",
        "{{/if}}",
        "{{#unless paid}}",
        "Payment of {{order.total}} is still open.",
        "",
        "Pay now ({{order.payUrl}})",
        "",
        "{{/unless}}",
        "{{#each order.items as |line|}}",
        "{{line.name}}",
        "Qty {{line.qty}}",
        "{{line.price}}",
        "",
        "{{#if line.discount}}",
        "Discount {{line.discount}}",
        "",
        "{{/if}}",
        "{{/each}}",
        "Total {{order.total}}",
        "",
        "Ship to",
        "{{shipping.name}}",
        "{{shipping.street}}",
        "{{shipping.city}}",
        "",
        "Billing",
        "{{billing.name}}",
        "{{billing.street}}",
        "{{billing.city}}",
        "",
        "Questions about {{order.id}}? {{support.email}}",
        "",
      ].join("\n"),
    );
  });

  it("receipt (liquid): the same tags in the same order, each on its own line", () => {
    const html = golden("templates/receipt/expected.liquid.html");
    const text = toText(html);
    const tags = html.replace(MSO, "").match(BLOCK_TAG)!;
    expect(tags).toHaveLength(8);
    expect(text.match(BLOCK_TAG)).toEqual(tags);
    for (const t of tags) expect(text).toContain(`\n${t}\n`);
    expect(text).toContain("Pay now ({{ order.payUrl | escape }})");
    expect(text).toContain("Total {{ order.total | escape }}\n");
  });

  it("every template golden keeps its block tags, and the HTML's fields stay whole", () => {
    for (const name of ["each-and-if", "else-if-chain", "chain-in-flex-cell", "nested-each", "text-level", "if-unless-block", "liquid-grouping"]) {
      for (const dialect of ["handlebars", "liquid"]) {
        const html = golden(`templates/${name}/expected.${dialect}.html`);
        const text = toText(html);
        expect(text.match(BLOCK_TAG) ?? [], `${name} ${dialect}`).toEqual(html.replace(MSO, "").match(BLOCK_TAG) ?? []);
        for (const f of text.match(/\{\{[^}]*\}?\}?/g) ?? []) expect(f, `${name} ${dialect}`).toMatch(/\}\}$/);
      }
    }
  });

  it("literal-braces: escapes stay, an entity brace beside a field doesn't make {{{", () => {
    expect(toText(golden("templates/literal-braces/expected.handlebars.html"))).toBe(
      [
        "Type \\{{ not a path }} and \\{{{ nor this }}} as you like.",
        "",
        "Your code is { {{user.code}} }, saved in C:\\\\{{!}}\\{{ a b }} or C:\\",
        "",
        "50% off {braces}: {{user.name}}\\",
        "",
      ].join("\n"),
    );
    const liquid = toText(golden("templates/literal-braces/expected.liquid.html"));
    expect(liquid).toContain('Your code is {{ "{" }}{{ user.code | escape }}}, saved in');
  });

  it("nested-lists: markers, numbering from start, nesting by indent", () => {
    expect(toText(golden("article/nested-lists/expected.html"))).toBe(
      [
        "Packing list",
        "",
        "- Clothes",
        "  - Rain jacket",
        "    - With a hood",
        "  - Two pairs of socks",
        "- Documents",
        "  1. Passport",
        "  2. Booking number",
        "",
        "3. Check in online",
        "4. Print the boarding pass",
        "",
        "1. Gate opens",
        "",
        "- Bring snacks",
        "",
        "No bullet here",
        "",
      ].join("\n"),
    );
  });

  it("newsletter and invoice: buttons as links, rows of short cells on one line", () => {
    const news = toText(golden("real-world/newsletter/expected.html"));
    expect(news).toContain("\n\nSee what's changing → (https://larch.example/whats-new)\n\n");
    expect(news).toContain("\nUnsubscribe (https://larch.example/unsubscribe)\n");
    const invoice = toText(golden("real-world/invoice/expected.html"));
    expect(invoice).toContain("\n\nYour invoice\nis here!\n============\n\n");
    expect(invoice).toContain("\nSubtotal $60\n");
    expect(invoice).toContain("\nPay Now (https://cartwell.example/pay/INV-0824-0012)\n");
  });
});

describe("toText", () => {
  const body = (html: string) => toText(`<!doctype html><html><head><title>t</title><style>p{}</style></head><body>${html}</body></html>`);

  it("says a link as label (url), or the url alone when that is the label", () => {
    expect(body('<p>See <a href="https://ex.test/a">the docs</a>.</p>')).toBe("See the docs (https://ex.test/a).\n");
    expect(body('<p><a href="https://www.ex.test/">ex.test</a></p>')).toBe("https://www.ex.test/\n");
    expect(body('<p><a href="https://ex.test/x"></a></p>')).toBe("https://ex.test/x\n");
    expect(body('<p><a href="#top">Top</a> <a href="">Here</a></p>')).toBe("Top Here\n");
    expect(body('<p><a href="https://ex.test/"><img src="l.png" alt="Logo"></a></p>')).toBe("Logo (https://ex.test/)\n");
  });

  it("says a mailto: or tel: address once", () => {
    expect(body('<p><a href="mailto:hi@ex.test?subject=Hi">hi@ex.test</a></p>')).toBe("hi@ex.test\n");
    expect(body('<p><a href="mailto:hi@ex.test">Write to us</a></p>')).toBe("Write to us (hi@ex.test)\n");
    expect(body('<p><a href="tel:+15550100200">+1 555 010 0200</a></p>')).toBe("+1 555 010 0200\n");
    expect(body('<p><a href="tel:+15550100200">Call</a></p>')).toBe("Call (+15550100200)\n");
  });

  it("says the url once for links split around blocks", () => {
    const html = '<a href="https://ex.test/p" style="display:block"><img src="a.png" alt="Shoe"></a><a href="https://ex.test/p" style="display:block">Trail shoe</a>';
    expect(body(html)).toBe("Shoe (https://ex.test/p)\nTrail shoe\n");
    expect(body('<p><a href="https://ex.test/p">A</a> or <a href="https://ex.test/p">B</a></p>')).toBe("A (https://ex.test/p) or B (https://ex.test/p)\n");
  });

  it("leaves out hidden, Outlook-only and spacer content", () => {
    const html = [
      '<div style="display:none;mso-hide:all">preheader</div>',
      '<p style="mso-hide:all">dark</p><p hidden>gone</p>',
      "<!--[if mso]><p>outlook</p><![endif]-->",
      '<!--[if !mso]><!--><p>others</p><!--<![endif]-->',
      '<table role="presentation"><tr><td>&nbsp;</td></tr><tr><td><img src="s.gif" width="1" height="1" alt="x"><img src="d.png" alt=""></td></tr></table>',
    ].join("");
    expect(body(html)).toBe("others\n");
  });

  it("decodes entities and collapses whitespace, keeping &nbsp; joins", () => {
    expect(body("<p>Fish &amp;\n   chips &lt;3 &mdash; 10&nbsp;km</p>")).toBe("Fish & chips <3 — 10 km\n");
    expect(body("<p>one<br>two<br><br>three</p><h3>Sub</h3><p>four</p>")).toBe("one\ntwo\n\nthree\n\nSub\n\nfour\n");
  });

  it("wraps at 78 columns, never inside a URL or a field", () => {
    const words = "word ".repeat(20).trim();
    const out = body(`<p>${words} https://ex.test/${"a".repeat(90)} {{ user.first_name | default: "there" }} end</p>`);
    for (const line of out.trimEnd().split("\n")) {
      if (line.length > 78) expect(line).not.toContain(" ");
      else expect(line.length).toBeLessThanOrEqual(78);
    }
    expect(out).toContain(`https://ex.test/${"a".repeat(90)}`);
    expect(out).toContain('{{ user.first_name | default: "there" }}');
  });

  it("hangs a list item's wrapped lines under its text", () => {
    const out = body(`<ol start="9"><li>${"long ".repeat(20)}</li><li>b</li></ol>`);
    expect(out.split("\n")[0]).toMatch(/^9\. long/);
    expect(out.split("\n")[1]).toMatch(/^ {3}long/);
    expect(out).toContain("\n10. b\n");
  });

  it("is what a compiled email reads as", () => {
    const { html } = compile('<h1>Hi</h1><p>Read <a href="https://ex.test/">this</a>.</p><ul><li>One</li><li>Two</li></ul>');
    expect(toText(html)).toBe("Hi\n==\n\nRead this (https://ex.test/).\n\n- One\n- Two\n");
  });
});

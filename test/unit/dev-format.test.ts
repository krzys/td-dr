import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { format } from "../../adapters/dev/ui/format.js";

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".html") ? [p] : [];
  });
const files = walk(new URL("../fixtures", import.meta.url).pathname);
const strip = (s: string) => s.replace(/\s+/g, "");

describe("format on every fixture (inputs, compiled output, Handlebars and Liquid templates)", () => {
  test("has a real corpus", () => expect(files.length).toBeGreaterThan(500));

  test("never falls back, changes only whitespace, and is stable when applied twice", () => {
    const bad: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      const r = format(src);
      if (!r.ok) bad.push(`${f}: fell back`);
      else if (strip(r.text) !== strip(src)) bad.push(`${f}: text changed`);
      else if (format(r.text).text !== r.text) bad.push(`${f}: not stable`);
    }
    expect(bad).toEqual([]);
  });
});

describe("format", () => {
  test("keeps template blocks, else branches and tags in attributes together", () => {
    const r = format('<table><tr>{{#each items}}<td class="{{#if a}}x{{else}}y{{/if}}" title="a > b">{{ name }}</td>{{/each}}</tr></table>');
    expect(r.text).toBe(
      ['<table>', "  <tr>", "    {{#each items}}", '      <td class="{{#if a}}x{{else}}y{{/if}}" title="a > b">{{ name }}</td>', "    {{/each}}", "  </tr>", "</table>"].join("\n"),
    );
  });

  test("handles Liquid blocks the same way", () => {
    const r = format("<div>{% if a %}<p>x</p>{% elsif b %}<p>y</p>{% else %}<p>z</p>{% endif %}</div>");
    expect(r.text).toContain("{% elsif b %}");
    expect(r.ok).toBe(true);
  });

  test("leaves text between inline elements alone", () => {
    expect(format("<td>Hi <b>there</b>, <a href=x>you</a> !</td>").text).toBe("<td>Hi <b>there</b>, <a href=x>you</a> !</td>");
  });

  test("keeps pre, textarea, script and conditional comments exactly as written", () => {
    const src = "<div><pre>  a\n   b</pre><script>if (a<b) { x() }</script><!--[if mso]><table><tr><td><![endif]--></div>";
    const r = format(src);
    expect(r.text).toContain("<pre>  a\n   b</pre>");
    expect(r.text).toContain("<script>if (a<b) { x() }</script>");
    expect(r.text).toContain("<!--[if mso]><table><tr><td><![endif]-->");
  });

  test("survives unbalanced tags, crossing template blocks and garbage", () => {
    for (const src of ["</td><td>x", "{{/if}}{{else}}<p>", "{{#if a}}<td>a{{else}}<td class=b>{{/if}}x</td>", "<a href='", "{{ ", "<!-- open", "<style>a{", "text < more"]) {
      const r = format(src);
      expect(strip(r.text)).toBe(strip(src));
    }
  });

  test("locate maps a position in the original to the same spot in the formatted text", () => {
    const src = "<table><tr><td>one</td><td>two</td></tr></table>";
    const r = format(src);
    const col = src.indexOf("<td>two");
    const at = r.locate(1, col);
    expect(r.text.split("\n")[at.line - 1]!.slice(at.col)).toMatch(/^<td>two/);
  });
});

test("deep email nesting keeps indenting", () => {
  const depth = 30;
  const html = "<table><tr><td>".repeat(depth / 3) + "<p>x</p>" + "</td></tr></table>".repeat(depth / 3);
  const lines = format(html).text.split("\n");
  expect(lines.find((l) => l.trim() === "<p>x</p>")).toBe(`${"  ".repeat(depth)}<p>x</p>`);
});

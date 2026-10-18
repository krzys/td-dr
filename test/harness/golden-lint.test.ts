// Structural checks on every golden file: things Chromium renders fine but
// Outlook or Gmail don't. A broken emitter must fail here even if pixels match.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { isActive, loadFixtures } from "./fixture-runner.ts";
import { goldenName, templateDialects } from "./template-fixture.ts";

export const lintEmail = (html: string): string[] => {
  const problems: string[] = [];
  const tables: boolean[] = [];
  for (const m of html.matchAll(/<(\/?)(table|tr)\b[^>]*>/gi)) {
    if (m[2]!.toLowerCase() === "tr") {
      if (!m[1] && tables.length) tables[tables.length - 1] = true;
    } else if (!m[1]) tables.push(false);
    else if (tables.pop() === false) problems.push("<table> without a <tr>");
  }
  for (const m of html.matchAll(/<(td|table)\b[^>]*\sstyle="([^"]*)"/gi)) {
    for (const d of m[2]!.split(";")) {
      const [p, v] = d.split(":").map((x) => x?.trim());
      if (p?.startsWith("margin") && v !== "0" && v !== "0 auto") problems.push(`margin on <${m[1]}>: ${d}`);
    }
  }
  for (const m of html.matchAll(/\sbgcolor="([^"]*)"/gi)) {
    // a field the ESP fills with a colour (docs/templates.md#colours-from-data)
    if (!/^(#[0-9a-f]{6}|[a-z]+|\{\{ ?[\w.@]+( \| escape)? ?\}\})$/i.test(m[1]!)) problems.push(`bgcolor="${m[1]}"`);
  }
  const opens = html.match(/<!--\[if /g)?.length ?? 0;
  const closes = html.match(/<!\[endif\]/g)?.length ?? 0;
  if (opens !== closes) problems.push(`${opens} [if] vs ${closes} [endif]`);
  // conditional comments don't nest: the first <![endif]--> inside ends the outer one
  let depth = 0;
  for (const m of html.matchAll(/<!--\[if |<!\[endif\]/g)) {
    depth += m[0].startsWith("<!--") ? 1 : -1;
    if (depth > 1) {
      problems.push("conditional comment inside another");
      break;
    }
  }
  // Outlook drops a link around a table (docs/support.md#links-around-blocks)
  let inLink = 0;
  for (const m of html.matchAll(/<(\/?)(a|table)\b/gi)) {
    if (m[2]!.toLowerCase() === "a") inLink = Math.max(0, inLink + (m[1] ? -1 : 1));
    else if (!m[1] && inLink > 0) problems.push("<table> inside <a>");
  }
  if (/<hr\b/i.test(html)) problems.push("<hr> (use a divider cell)");
  if (/currentcolor/i.test(html)) problems.push("currentcolor");
  if (/style="[^"]*&quot;/.test(html)) problems.push("&quot; inside style");
  return problems;
};

describe("golden self-lint", () => {
  test("lintEmail catches the basics", () => {
    expect(lintEmail("<table><tr><td>x</td></tr></table>")).toEqual([]);
    expect(lintEmail('<table>\n</table><td style="margin:4px">')).toEqual(["<table> without a <tr>", "margin on <td>: margin:4px"]);
    expect(lintEmail('<a href="#"><table><tr><td>x</td></tr></table></a>')).toEqual(["<table> inside <a>"]);
    expect(lintEmail('<td bgcolor="rgba(0,0,0,.5)"><!--[if mso]>')).toHaveLength(2);
    expect(lintEmail('<td bgcolor="{{brand.bg}}"></td><td bgcolor="{{ brand.bg | escape }}"></td>')).toEqual([]);
  });

  for (const f of loadFixtures().filter(isActive)) {
    const dialects = templateDialects(f);
    for (const name of dialects ? dialects.map((d) => goldenName(dialects, d)) : ["expected.html"]) {
      const file = join(f.dir, name);
      if (!existsSync(file)) continue;
      test(`${f.feature}/${f.name}${name === "expected.html" ? "" : ` (${name})`}`, () => {
        const html = readFileSync(file, "utf8");
        expect(lintEmail(html)).toEqual([]);
        // Outlook renders an image without a width attr at its file size; that must be reported
        const bare = [...html.matchAll(/<img\b[^>]*>/gi)].filter((m) => !/\swidth="/.test(m[0])).length;
        if (bare) {
          const diags = existsSync(join(f.dir, "diagnostics.json")) ? readFileSync(join(f.dir, "diagnostics.json"), "utf8") : "";
          expect(/"severity": "error"|needs a width/.test(diags), `${bare} <img> without width and no diagnostic`).toBe(true);
        }
      });
    }
  }
});

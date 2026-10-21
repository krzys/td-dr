import { describe, expect, test } from "vitest";
import { compile, field, type DialectName } from "../../../src/index.ts";
import { startTags } from "../../../src/template/tags.ts";
import { annotateTemplate } from "../../../adapters/vite/render.ts";
import { fixtureOptions, isActive, loadFixtures } from "../../harness/fixture-runner.ts";
import { dataSets, expand, templateDialects, tokenize } from "../../harness/template-fixture.ts";

const data = { user: { name: "Ada" }, show: true, off: false, deals: [{ title: "Tea", price: "$9", tags: ["a", "b"] }, { title: "Pot", price: "$30", tags: [] }] };

const input = [
  `<title>${field("user.name")}</title>`,
  `<div style="max-width:600px;margin:0 auto">`,
  `<p>Hello ${field("user.name")}. <a href="https://x.test/${field("user.name")}">link ${field("user.name")}</a></p>`,
  `<div data-email-each="deals" data-email-as="deal"><b>${field("deal.title")}</b> for ${field("deal.price")}</div>`,
  `<p data-email-if="show">yes ${field("user.name")}</p>`,
  `<p data-email-else>no</p>`,
  `<p data-email-if="off">hidden ${field("user.name")}</p>`,
  `</div>`,
].join("\n");

const strip = (html: string): string => html.replace(/ data-tddr-t="\d+"/g, "").replace(/<tddr-f data-tddr-f="\d+">([^]*?)<\/tddr-f>/g, "$1");

describe.each(["handlebars", "liquid"] as const)("annotateTemplate, %s", (dialect: DialectName) => {
  const template = compile(input, { template: dialect }).html;
  const annotated = annotateTemplate(template);
  const plain = expand(template, dialect, data);
  const filled = expand(annotated, dialect, data);

  test("the engine fills it to the same page, only marked", () => {
    expect(strip(filled)).toBe(plain);
  });

  test("every start tag has its index in the template, repeated for each copy of a loop", () => {
    const tags = startTags(template);
    const marks = [...annotated.matchAll(/data-tddr-t="(\d+)"/g)].map((m) => Number(m[1]));
    expect(marks).toEqual(tags.map((_t, i) => i));
    const shown = [...filled.matchAll(/<b [^>]*data-tddr-t="(\d+)"/g)].map((m) => m[1]);
    expect(shown).toHaveLength(2);
    expect(new Set(shown).size).toBe(1);
    // the filled page's n-th tag is the n-th tag of the annotated fill, wrappers apart
    expect(startTags(filled).filter((t) => t.tag !== "tddr-f").map((t) => t.tag)).toEqual(startTags(plain).map((t) => t.tag));
  });

  test("text placeholders are wrapped with their offset in the template, in loops and branches too", () => {
    const wrapped = [...filled.matchAll(/<tddr-f data-tddr-f="(\d+)">([^<]*)<\/tddr-f>/g)].map((m) => [template.slice(Number(m[1]), Number(m[1]) + 2), m[2]]);
    expect(wrapped.map((w) => w[1])).toEqual(["Ada", "Ada", "Tea", "$9", "Pot", "$30", "Ada"]);
    expect(wrapped.every((w) => w[0] === "{{")).toBe(true);
  });

  test("the attribute placeholder, the title and the engine's own tags are left as they were", () => {
    expect(annotated).toContain("<title data-tddr-t=");
    expect(annotated).not.toMatch(/<title[^>]*><tddr-f/);
    expect(annotated).not.toMatch(/<tddr-f[^>]*>\{%/);
    expect(annotated).not.toMatch(/<tddr-f[^>]*>\{\{[#/]/);
    expect(filled).toContain('href="https://x.test/Ada"');
  });
});

describe("annotateTemplate", () => {
  test("leaves placeholders in comments, styles and Outlook conditionals alone", () => {
    const t = "<style>a{b:{{c}}}</style><!-- {{d}} --><!--[if mso]><p>{{e}}</p><![endif]--><p>{{f}}</p>";
    const a = annotateTemplate(t);
    expect(a.match(/<tddr-f/g)).toHaveLength(1);
    expect(a).toContain('<p data-tddr-t="1"><tddr-f data-tddr-f="');
  });
});

describe("annotateTemplate over the template fixtures", () => {
  for (const f of loadFixtures().filter(isActive)) {
    for (const dialect of templateDialects(f) ?? []) {
      test(`${f.feature}/${f.name} [${dialect}] fills back to the plain page`, () => {
        const template = compile(tokenize(f.input), { ...fixtureOptions(f), template: dialect }).html;
        const annotated = annotateTemplate(template);
        for (const [, props] of dataSets(f)) expect(strip(expand(annotated, dialect, props))).toBe(expand(template, dialect, props));
      });
    }
  }

  test("an escaped brace is no placeholder, nor is a triple stash", () => {
    const a = annotateTemplate("<p>\\{{{ nor this }}} {{{raw}}} {{yes}}</p>");
    expect(a.match(/<tddr-f/g)).toHaveLength(1);
  });
});

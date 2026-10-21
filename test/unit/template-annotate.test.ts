import { describe, expect, test } from "vitest";
import { field, preview } from "../../src/index.ts";
import { startTags } from "../../src/template/tags.ts";

const data = { user: { name: "Ada" }, show: true, items: [{ name: "a", tags: ["x", "y"] }, { name: "b", tags: [] }] };

const src = [
  `<title>${field("user.name")}</title>`,
  `<div><p>Hi ${field("user.name")}, <b>x</b> ${field("user.name")}</p>`,
  `<ul><li data-email-each="items" data-email-as="it"><span>${field("it.name")}</span><i data-email-each="it.tags" data-email-as="g">${field("g")}</i></li></ul>`,
  `<tddr-if test="show"><p title="${field("user.name")}">shown</p></tddr-if></div>`,
].join("\n");

const attrs = (html: string, name: string): string[] => [...html.matchAll(new RegExp(`<(\\w[\\w-]*)[^>]* ${name}="([^"]*)"`, "g"))].map((m) => `${m[1]}:${m[2]}`);

describe("preview, annotated", () => {
  const out = preview(src, data, { annotate: true });

  test("is the plain preview plus attributes and field wrappers", () => {
    const plain = preview(src, data);
    const bare = out.replace(/ data-tddr-[sn]="[^"]*"/g, "").replace(/<tddr-f data-tddr-f="\d+">([^<]*)<\/tddr-f>/g, "$1");
    expect(bare).toBe(plain);
    // without the option nothing is added
    expect(plain).not.toContain("data-tddr");
  });

  test("every element has the index of its start tag in the input", () => {
    const tags = startTags(src);
    const byIndex = (name: string) => tags.flatMap((t, i) => (t.tag === name ? [i] : []));
    expect(attrs(out, "data-tddr-s")).toEqual([
      `title:${byIndex("title")[0]}`,
      `div:${byIndex("div")[0]}`,
      `p:${byIndex("p")[0]}`,
      `b:${byIndex("b")[0]}`,
      `ul:${byIndex("ul")[0]}`,
      `li:${byIndex("li")[0]}`,
      `span:${byIndex("span")[0]}`,
      `i:${byIndex("i")[0]}`,
      `i:${byIndex("i")[0]}`,
      `li:${byIndex("li")[0]}`,
      `span:${byIndex("span")[0]}`,
      `p:${byIndex("p")[1]}`,
    ]);
  });

  test("copies of a loop keep the index and say which repeat they are", () => {
    expect(attrs(out, "data-tddr-n")).toEqual(["li:0", "span:0", "i:0.0", "i:0.1", "li:1", "span:1"]);
  });

  test("a text field is wrapped with its offset in the input, an attribute field is not", () => {
    const offsets = [...out.matchAll(/<tddr-f data-tddr-f="(\d+)">([^<]*)<\/tddr-f>/g)].map((m) => [src[Number(m[1])], m[2]]);
    expect(offsets).toEqual([
      ["", "Ada"],
      ["", "Ada"],
      ["", "a"],
      ["", "x"],
      ["", "y"],
      ["", "b"],
    ]);
    // the title's text, and the title attribute, are plain
    expect(out).toContain("<title data-tddr-s=\"0\">Ada</title>");
    expect(out).toContain('title="Ada"');
    // the wrapper of the second Ada points at the second field of the paragraph
    const second = [...out.matchAll(/data-tddr-f="(\d+)">Ada/g)].map((m) => Number(m[1]));
    expect(second[1]! - second[0]!).toBe(src.indexOf(field("user.name"), src.indexOf("<b>")) - src.indexOf(field("user.name"), src.indexOf("<p>")));
  });

  test("a field next to a character reference still lines up", () => {
    const html = `<p>a &amp; ${field("x")} &lt; ${field("y")}</p>`;
    const o = preview(html, { x: "1", y: "2" }, { annotate: true });
    const at = [...o.matchAll(/data-tddr-f="(\d+)"/g)].map((m) => Number(m[1]));
    expect(at).toEqual([html.indexOf(field("x")), html.indexOf(field("y"))]);
  });
});

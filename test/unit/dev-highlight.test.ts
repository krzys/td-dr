import { globSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tokenize } from "../../adapters/dev/ui/highlight.js";

// tokens as "class:text", unclassed text as-is, so a failure reads like the markup
const show = (text: string, lang: "html" | "json") => tokenize(text, lang).map(([c, t]) => (c ? `${c}:${t}` : t));

describe("dev highlighter", () => {
  it("gives back exactly the text it was given", () => {
    const html = `<!DOCTYPE html>\n<!--[if mso]><table><![endif]-->\n<style>@media (max-width:600px){ .a{ color:#fff !important } }</style>\n<p class="x" hidden>a &amp; {{name}}</p>{% if a %}<br/>{% endif %}<a href=x>`;
    expect(tokenize(html, "html").map(([, t]) => t).join("")).toBe(html);
    const json = `{\n  "a": [1, -2.5e3, true, null],\n  "b": "x\\"y"\n}\n`;
    expect(tokenize(json, "json").map(([, t]) => t).join("")).toBe(json);
  });

  it("round-trips every expected fixture output", () => {
    const files = globSync("test/fixtures/**/expected*.html");
    expect(files.length).toBeGreaterThan(100);
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      expect(tokenize(text, "html").map(([, t]) => t).join(""), f).toBe(text);
    }
  });

  it("html: tags, attributes, values, entities, comments", () => {
    expect(show('<p class="x" hidden>a &amp; b</p><!-- hi -->', "html")).toEqual([
      "punct:<", "tag:p", " ", "attr:class", "punct:=", 'str:"x"', " ", "attr:hidden", "punct:>",
      "a ", "ent:&amp;", " b",
      "punct:</", "tag:p", "punct:>", "com:<!-- hi -->",
    ]);
    expect(show("<!DOCTYPE html>", "html")).toEqual(["doctype:<!DOCTYPE html>"]);
  });

  it("html: MSO conditional comments stand out from plain comments", () => {
    expect(show("<!--[if mso]><b>x</b><![endif]--><!--[if !mso]><!-->y<!--<![endif]-->", "html")).toEqual([
      "mso:<!--[if mso]>", "punct:<", "tag:b", "punct:>", "x", "punct:</", "tag:b", "punct:>", "mso:<![endif]-->",
      "mso:<!--[if !mso]><!-->", "y", "mso:<!--<![endif]-->",
    ]);
  });

  it("html: template tags in text and attribute values", () => {
    expect(show('{{#if a}}<a href="{{ url }}/x">{% if b %}{{{raw}}}</a>{{/if}}', "html")).toEqual([
      "tpl:{{#if a}}", "punct:<", "tag:a", " ", "attr:href", "punct:=", 'str:"', "tpl:{{ url }}", 'str:/x"', "punct:>",
      "tpl:{% if b %}", "tpl:{{{raw}}}", "punct:</", "tag:a", "punct:>", "tpl:{{/if}}",
    ]);
  });

  it("css inside <style>: at-rules, selectors, properties, numbers, colours", () => {
    expect(show("<style>@media (max-width:600px){.a b{color:#fff !important;width:50%}}</style>", "html")).toEqual([
      "punct:<", "tag:style", "punct:>",
      "at:@media", " (max-width:", "num:600px", ")", "punct:{",
      "sel:.a b", "punct:{", "prop:color", "punct::", "num:#fff", " ", "kw:!important", "punct:;", "prop:width", "punct::", "num:50%", "punct:}",
      "punct:}",
      "punct:</", "tag:style", "punct:>",
    ]);
  });

  it("json: keys, strings, numbers, keywords", () => {
    expect(show('{"a": "x", "n": -1.5, "t": true, "z": null}', "json")).toEqual([
      "punct:{", 'key:"a"', "punct::", " ", 'str:"x"', "punct:,", " ", 'key:"n"', "punct::", " ", "num:-1.5", "punct:,", " ",
      'key:"t"', "punct::", " ", "kw:true", "punct:,", " ", 'key:"z"', "punct::", " ", "kw:null", "punct:}",
    ]);
  });
});

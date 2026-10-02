import { describe, expect, it } from "vitest";
import { compile } from "../../../src/index.ts";

const CSS = ".w{max-width:600px;font-family:Arial;font-size:15px;line-height:22px;color:#111} .btn{display:inline-block;padding:12px 24px;background-color:#0a7d3b;color:#fff;text-decoration:none;border-radius:4px} .row{display:flex} .col{box-sizing:border-box;width:50%;padding:8px} .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px} .cell{background-color:#eee;padding:8px} .pic{display:block} .card{padding:8px;background-color:#eee;width:300px;margin:0 auto}";
const RULE = "@media (max-width:480px){.k{display:none}}";

const body = (html: string): string => html.slice(html.indexOf("<body")).replace(/ class="t-[0-9a-z]+"/g, "");
const lines = (html: string): string[] => body(html).split("\n");

const page = (inner: string, rule: string): string => `<style>${CSS}${rule}</style><div class="w">${inner}</div>`;

// Each kind of element with the class that hides it. Where the parent lays the item out itself
// (a flex or grid item, an inline element) the rule changes nothing in the base; any other element only
// gains the cell that hides it.
const KINDS: Array<{ name: string; html: string; same: boolean }> = [
  { name: "paragraph", html: '<p>Before</p><p class="k">Hidden</p><p>After</p>', same: false },
  { name: "padded div", html: '<div class="card k">Hidden</div><p>After</p>', same: false },
  { name: "heading", html: '<h2 class="k">Hidden</h2><p>After</p>', same: false },
  { name: "button", html: '<p>Before</p><a class="btn k" href="https://example.com/">Go</a><p>After</p>', same: false },
  { name: "block image", html: '<p>Before</p><img class="k pic" src="https://example.com/a.png" width="600" height="100" alt=""><p>After</p>', same: false },
  { name: "list", html: '<ul class="k"><li>One</li><li>Two</li></ul><p>After</p>', same: false },
  { name: "table", html: '<table class="k" width="100%"><tr><td>Cell</td></tr></table><p>After</p>', same: false },
  { name: "inline span", html: '<p>Text <span class="k">hidden</span> more</p>', same: true },
];

describe("an element hidden on some screens only", () => {
  for (const kind of KINDS) {
    it(`${kind.name}: the base is the base without the rule${kind.same ? "" : ", plus its hide cell"}`, () => {
      const plain = compile(page(kind.html, ""));
      const ruled = compile(page(kind.html, RULE));
      expect(ruled.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      expect(ruled.html).toContain("display:none !important");
      if (kind.same) {
        expect(lines(ruled.html).filter((l) => !l.includes("[if !mso]"))).toEqual(lines(plain.html));
        return;
      }
      // the wrapper only adds a cell: same sizes, paints, links, images and text, and the plain tags in order
      for (const re of [/ (?:width|height|bgcolor)="(?!100%)[^"]*"/g, /<(?:a|img|v:\w+)\b[^>]*>/g, />([^<>\s][^<>]*)</g]) {
        expect(body(ruled.html).match(re)?.sort()).toEqual(body(plain.html).match(re)?.sort());
      }
      const tags = (html: string): string[] => body(html).match(/<\/?[a-z][a-z0-9]*/g) ?? [];
      let at = 0;
      for (const t of tags(plain.html)) {
        const next = tags(ruled.html).indexOf(t, at);
        expect(next, t).toBeGreaterThanOrEqual(at);
        at = next + 1;
      }
    });
  }

  it("a fixed flex column keeps its cell and width and hides its content", () => {
    const out = compile(page('<div class="row"><div class="col">Left</div><div class="col k">Right</div></div>', RULE)).html;
    expect(out.match(/<td [^>]*width="300"/g)).toHaveLength(2);
    expect(out).not.toMatch(/<table[^>]* width="50%"/);
    expect(out).toMatch(/<td class="t-0">\s*<table[^>]*>\s*<tr>\s*<td[^>]*>Right/);
    expect(out).toContain(".t-0 { display:none !important;");
  });

  it("a grid item keeps its track, its background and its gutter", () => {
    const out = compile(page('<div class="grid"><div class="cell">One</div><div class="cell k">Two</div></div>', RULE)).html;
    expect(out.match(/bgcolor="#eeeeee"/g)).toHaveLength(2);
    expect(out.match(/<td [^>]*width="(?:292|300)"/g)).toHaveLength(2);
    expect(out.match(/padding-left:8px/g)).toHaveLength(1);
  });
});

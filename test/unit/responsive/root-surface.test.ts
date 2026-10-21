import { describe, expect, it } from "vitest";
import { compile } from "../../../src/index.ts";

// The page colour lives in the shell (body and page table), outside the html the screens diff (docs/support.md#dark-mode).
const page = (css: string): string =>
  `<html lang="en"><head><title>Root surface</title><style>body{background-color:var(--paper);font-family:Arial,sans-serif} ${css}</style></head><body><div style="max-width:400px;margin:0 auto;background-color:#ffffff;padding:16px"><p>Hello</p></div></body></html>`;
const headRules = (html: string): string => /<style>\n((?:@media|\.t-|:root)[\s\S]*?)\n<\/style>/.exec(html)?.[1] ?? "";
const pageTable = (html: string): string => /<table [^>]*width="100%"[^>]*line-height:normal[^>]*>/.exec(html)![0];
const darkBlock = (html: string): string => /@media \(prefers-color-scheme: dark\) \{\n([\s\S]*?)\n\}/.exec(headRules(html))?.[1] ?? "";

describe("root surface", () => {
  it("a page colour the dark screen changes repaints the body and the page table there", () => {
    const out = compile(page(":root{--paper:#f6f1e7} @media (prefers-color-scheme:dark){:root{--paper:#15130f}}"));
    expect(out.diagnostics).toEqual([]);
    const cls = /class="(t-[0-9a-z]+)"/.exec(pageTable(out.html))?.[1];
    expect(cls).toBeDefined();
    expect(pageTable(out.html)).toContain('bgcolor="#f6f1e7"');
    expect(darkBlock(out.html)).toContain("  body { background-color:#15130f !important; }");
    expect(darkBlock(out.html)).toContain(`  .${cls} { background-color:#15130f !important; }`);
    expect(headRules(out.html)).toContain(`[data-ogsb] .${cls} { background-color:#15130f !important; }`);
    expect(out.html).toMatch(/<body id="body" style="[^"]*">/);
    expect(out.html).toMatch(/<meta name="color-scheme" content="light dark">/);
  });

  it("keeps a body-level dark rule the author wrote", () => {
    const out = compile(page(":root{--paper:#f6f1e7} @media (prefers-color-scheme:dark){body{background-color:#101418}}"));
    expect(darkBlock(out.html)).toContain("  body { background-color:#101418 !important; }");
  });

  it("writes nothing for a page colour every screen shares", () => {
    const out = compile(page(":root{--paper:#f6f1e7} @media (prefers-color-scheme:dark){p{color:#eeeeee}}"));
    expect(headRules(out.html)).not.toMatch(/body \{/);
    expect(pageTable(out.html)).not.toContain("class=");
  });

  it("a narrower screen's page colour goes in its width block, without mirrors", () => {
    const out = compile(page(":root{--paper:#f6f1e7} @media (max-width:480px){:root{--paper:#ffffff}}"));
    const cls = /class="(t-[0-9a-z]+)"/.exec(pageTable(out.html))![1];
    expect(headRules(out.html)).toContain(`@media screen and (max-width:480px) {\n  body { background-color:#ffffff !important; }\n  .${cls} { background-color:#ffffff !important; }\n}`);
    expect(headRules(out.html)).not.toContain("data-ogsb");
  });
});

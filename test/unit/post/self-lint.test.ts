import { describe, expect, it, vi } from "vitest";
import type { Ctx } from "../../../src/ctx.ts";
import { selfLint } from "../../../src/post/self-lint.ts";
import type { Capabilities } from "../../../src/targets/capabilities.ts";
import { testCtx } from "../../helpers/index.ts";

// Every property is its own feature; only the slugs below are unsupported.
vi.mock("../../../src/targets/features.ts", () => ({
  featuresFor: (prop: string) => [`css-${prop}`],
  featuresForAtRule: (name: string) => [`css-at-${name}`],
  featuresForSelector: (sel: string) => (sel.includes(":hover") ? ["css-pseudo-class-hover"] : []),
}));

const UNSUPPORTED = new Set(["css-border-radius", "css-max-width", "css-box-shadow", "css-at-media", "css-at-supports", "css-pseudo-class-hover", "css-mso-line-height-rule", "html-valign", "css-height"]);

const lint = (html: string): { code: string; message: string }[] => {
  const caps: Capabilities = {
    targets: ["x"],
    check: (slug) => ({ status: UNSUPPORTED.has(slug) ? "n" : "y", clients: UNSUPPORTED.has(slug) ? ["Outlook"] : [], unsupported: UNSUPPORTED.has(slug) ? ["Outlook"] : [], notes: [] }),
  };
  const ctx: Ctx = { ...testCtx(), caps };
  selfLint(html, ctx);
  return ctx.diagnostics.list();
};

const page = (body: string, head = "") => `<!DOCTYPE html><html><head>${head}</head><body>${body}</body></html>`;

describe("selfLint", () => {
  it("flags a genuinely unsupported emitted property as W006 naming slug and element", () => {
    const [d, ...rest] = lint(page('<table role="presentation"><tr><td style="box-shadow:0 1px #000;color:red">x</td></tr></table>'));
    expect(rest).toEqual([]);
    expect(d?.code).toBe("W006");
    expect(d?.message).toContain("css-box-shadow");
    expect(d?.message).toContain("<td>");
  });

  it("does not flag the documented fallbacks", () => {
    const html = page(
      [
        '<table role="presentation" style="max-width:600px;margin:0 auto"><tr><td style="border-radius:4px;white-space:nowrap;mso-line-height-rule:exactly">',
        '<img src="a.png" style="border-radius:50%;display:block;height:auto;max-width:100%">',
        "</td></tr></table>",
      ].join(""),
    );
    expect(lint(html)).toEqual([]);
  });

  it("walks into fluid wrap rows", () => {
    const col = '<div class="tddr-col" style="display:inline-block"><table role="presentation"><tr><td style="box-shadow:0 1px #000">x</td></tr></table></div>';
    const [d] = lint(page(`<table role="presentation"><tr><td><div style="font-size:0">${col}</div></td></tr></table>`));
    expect(d?.code).toBe("W006");
    expect(d?.message).toContain("css-box-shadow");
  });

  it("flags an allowlisted property on a tag the allowlist does not cover", () => {
    expect(lint(page('<table role="presentation"><tr style="border-radius:3px"><td>x</td></tr></table>'))).toHaveLength(1);
  });

  it("ignores author pass-through content inside a td", () => {
    expect(lint(page('<table role="presentation"><tr><td><span style="box-shadow:0 0 1px #000">x</span><p style="box-shadow:none">y</p></td></tr></table>'))).toEqual([]);
  });

  it("checks table, tr, td and img attributes", () => {
    const ds = lint(page('<table role="presentation"><tr><td valign="top">x</td></tr></table>'));
    expect(ds.map((d) => d.code)).toEqual(["W006"]);
    expect(ds[0]?.message).toContain("html-valign");
  });

  it("dedupes repeats of the same slug on the same element kind", () => {
    const cell = '<tr><td style="box-shadow:0 0 1px #000">x</td></tr>';
    expect(lint(page(`<table role="presentation">${cell}${cell}${cell}</table>`))).toHaveLength(1);
  });

  it("allows the shell's reset rules, @media and mso conditional comments", () => {
    const head = [
      "<style>",
      "body { margin:0; width:100% !important; -webkit-text-size-adjust:100%; }",
      "table, td { border-collapse:collapse; mso-table-lspace:0pt; }",
      "a[x-apple-data-detectors] { color:inherit !important; }",
      "u + #body a { color:inherit; }",
      "</style>",
      "<style>@media (max-width:480px) { .col { box-shadow:none !important } }</style>",
      "<!--[if mso]><table><tr><td style=\"box-shadow:none\"><![endif]-->",
    ].join("\n");
    expect(lint(page("<p>x</p>", head))).toEqual([]);
  });

  it("flags unsupported at-rules and selectors in a head style block", () => {
    const ds = lint(page("<p>x</p>", "<style>.cta:hover { color:red } @supports (display:grid) { .a { color:red } }</style>"));
    expect(ds.map((d) => d.message).join("\n")).toMatch(/css-pseudo-class-hover[\s\S]*css-at-supports/);
    expect(ds.every((d) => d.code === "W006")).toBe(true);
  });

  it("passes empty and text-only output", () => {
    expect(lint("")).toEqual([]);
    expect(lint("<p>hi</p>")).toEqual([]);
  });

  it("allows height:Npx next to a height attribute on img, but not on a td", () => {
    const img = '<img src="a.png" width="56" height="56" style="display:block;width:56px;height:56px;border-radius:50%">';
    expect(lint(page(`<table role="presentation"><tr><td>${img}</td></tr></table>`))).toEqual([]);
    expect(lint(page('<table role="presentation"><tr><td style="height:56px">x</td></tr></table>'))).toHaveLength(1);
  });

  it("ignores an author <style> that is not in the head (pass-through content)", () => {
    const raw = "<style>.a:hover { color:red } @supports (display:grid) { .a { color:red } }</style>";
    expect(lint(page(`<table role="presentation"><tr><td>${raw}</td></tr></table>`))).toEqual([]);
  });

  it("ignores an author <table> passed through inside an emitted td", () => {
    const author = '<table><tr><td style="box-shadow:0 1px #000;position:sticky" valign="top">x</td></tr></table>';
    expect(lint(page(`<table role="presentation"><tr><td>${author}</td></tr></table>`))).toEqual([]);
  });

  it("ignores an inline img inside a p, but flags an emitter img (td > img and td > a > img)", () => {
    const img = '<img src="a.png" style="box-shadow:0 1px #000">';
    expect(lint(page(`<table role="presentation"><tr><td><p>x ${img}</p></td></tr></table>`))).toEqual([]);
    expect(lint(page(`<table role="presentation"><tr><td>${img}</td></tr></table>`)).map((d) => d.code)).toEqual(["W006"]);
    expect(lint(page(`<table role="presentation"><tr><td><a href="#">${img}</a></td></tr></table>`)).map((d) => d.code)).toEqual(["W006"]);
  });

  it("checks nested emitted tables inside a td", () => {
    const inner = '<table role="presentation"><tr><td style="box-shadow:0 1px #000">x</td></tr></table>';
    expect(lint(page(`<table role="presentation"><tr><td>${inner}</td></tr></table>`))).toHaveLength(1);
  });

  it("flags calc() and modern colours left in emitted markup or our <style>", () => {
    expect(lint(page('<table role="presentation"><tr><td style="width:calc(100% - 20px)">x</td></tr></table>')).map((d) => d.message)).toEqual([
      expect.stringContaining("calc("),
    ]);
    expect(lint(page("<p>x</p>", "<style>@media (max-width:600px) { .a { color:oklch(0 0 0) } }</style>"))).toHaveLength(1);
  });

  it("leaves leftovers in author pass-through to the input lint", () => {
    expect(lint(page('<table role="presentation"><tr><td><span style="width:calc(100% - 20px)">x</span></td></tr></table>'))).toEqual([]);
  });

  it("doesn't read colour functions inside strings and urls", () => {
    const td = `<td style="font-family:'color(Pro)', Arial;background-image:url(/img/lab(1).png)">x</td>`;
    expect(lint(page(`<table role="presentation"><tr>${td}</tr></table>`))).toEqual([]);
  });
});

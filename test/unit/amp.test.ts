import { describe, expect, test } from "vitest";
import { compile } from "../../src/index.ts";

const build = (html: string) => compile(html, { strict: false });
const amp = (r: ReturnType<typeof build>) => r.diagnostics.filter((d) => d.code === "E008").map((d) => d.message);

describe("AMP for Email input", () => {
  test.each([
    ["<html ⚡4email>", '<!doctype html><html ⚡4email lang="en"><body><p>x</p></body></html>'],
    ["<html amp4email>", '<!doctype html><html amp4email lang="en"><body><p>x</p></body></html>'],
    ["an amp-* element", '<div><amp-img src="a.png" width="10" height="10" alt="a"></amp-img></div>'],
    ["the runtime", '<html lang="en"><head><script async src=" https://cdn.ampproject.org/v0.js"></script></head><body><p>x</p></body></html>'],
  ])("%s is refused with one E008 and the MIME part hint", (_what, html) => {
    const r = build(html);
    expect(amp(r)).toEqual(["AMP for Email input is not compiled"]);
    expect(r.diagnostics.find((d) => d.code === "E008")?.hint).toMatch(/text\/html part.*text\/x-amp-html MIME part/);
  });

  test("the boilerplate's body{visibility:hidden} is ignored; amp-custom styles still apply", () => {
    const r = build(
      '<!doctype html><html ⚡4email lang="en"><head><style amp4email-boilerplate>body{visibility:hidden}</style>' +
        '<style amp-boilerplate>body{visibility:hidden}</style><style amp-custom>p{color:#1f2a44}</style></head><body><p>Hello</p></body></html>',
    );
    expect(r.html).not.toContain("visibility");
    expect(r.html).toMatch(/<p style="[^"]*color:#1f2a44/);
  });

  test("HTML that only mentions AMP is compiled", () => {
    const r = build('<div class="amp-note"><a href="https://cdn.ampproject.org/">AMP</a><p data-amp="1">x</p></div>');
    expect(amp(r)).toEqual([]);
  });
});

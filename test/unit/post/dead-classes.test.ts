import { expect, test } from "vitest";
import { dropDeadClasses } from "../../../src/post/dead-classes.ts";

const page = (css: string, body: string) => `<html><head><style>${css}</style></head><body>${body}</body></html>`;

test("drops classes no output style block selects", () => {
  const out = dropDeadClasses(page(".keep{color:red}", '<p class="avatar status" style="x">a</p><div class="keep">b</div>'));
  expect(out).toContain('<p style="x">a</p>');
  expect(out).toContain('<div class="keep">b</div>');
});

test("keeps only the referenced classes of a list", () => {
  const out = dropDeadClasses(page("@media (max-width:600px){.a{x:y}}", '<td class="a b c">t</td>'));
  expect(out).toContain('<td class="a">t</td>');
});

test("leaves text that merely looks like a class attribute", () => {
  const out = dropDeadClasses(page("", '<p>write class="x" here</p>'));
  expect(out).toContain('class="x" here');
});

test("a button link keeps its attrs through the whole pipeline", async () => {
  const { compile } = await import("../../../src/index.ts");
  const { html } = compile(
    '<a href="https://example.com" id="cta" target="_blank" clicktracking="off" data-x="1" data-email="button" style="display:inline-block;padding:10px 20px;background-color:#00f;color:#fff;text-decoration:none">Go</a>',
  );
  expect(html).toMatch(/<a href="https:\/\/example.com" id="cta" target="_blank" clicktracking="off" data-x="1" style=/);
});

test("class= inside another attribute's value is left alone", () => {
  const out = dropDeadClasses(page(".a{x:y}", `<p title="x class='foo'" class="dead">t</p><p title='y class="a"' class="a">u</p>`));
  expect(out).toContain(`<p title="x class='foo'">t</p>`);
  expect(out).toContain(`<p title='y class="a"' class="a">u</p>`);
});

test("escaped class names and [class~=] selectors count as used", () => {
  const out = dropDeadClasses(page("@media (max-width:600px){.sm\\:p-0{padding:0}[class~=s]{x:y}}", '<td class="sm:p-0 s z">t</td>'));
  expect(out).toContain('<td class="sm:p-0 s">t</td>');
});

test("substring attribute selectors keep every class they could match", () => {
  const out = dropDeadClasses(page('[class*=col-]{x:y}[class^="btn"]{x:y}[class$=-end]{x:y}', '<td class="col-6 btn-lg row-end z">t</td>'));
  expect(out).toContain('<td class="col-6 btn-lg row-end">t</td>');
});

test("hex escapes in a class selector name the real class", () => {
  const out = dropDeadClasses(page(".\\31 0{x:y} .a\\:b{x:y} .\\31 {x:y}", '<p class="10 a:b 1 dead">a</p>'));
  expect(out).toContain('<p class="10 a:b 1">a</p>');
});

test("a hex escape without trailing space ends at the first non-hex character", () => {
  const out = dropDeadClasses(page(".\\31 x{a:b} .\\31g{a:b}", '<p class="1x 1g 11">a</p>'));
  expect(out).toContain('<p class="1x 1g">a</p>');
});

test("[class=x i] and [class='x' s] keep the class; the flag is not a class", () => {
  const out = dropDeadClasses(page('[class="x" i]{a:b} [class=y s]{a:b} [class~="Z" i]{a:b}', '<p class="x y i s dead z">a</p>'));
  expect(out).toContain('<p class="x y z">a</p>');
});

test("a class starting with two hyphens counts as used", () => {
  const out = dropDeadClasses(page("@media (max-width:600px){.--x{padding:0}}", '<td class="--x --y">t</td>'));
  expect(out).toContain('<td class="--x">t</td>');
});

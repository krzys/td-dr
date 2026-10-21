import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { placeAssets, type AssetOptions } from "../../../adapters/vite/assets.ts";
import { field } from "../../../src/template/tokens.ts";

let root: string;
const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de", "hex");

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "tddr-assets-"));
  mkdirSync(join(root, "mail/img"), { recursive: true });
  mkdirSync(join(root, "public/brand"), { recursive: true });
  writeFileSync(join(root, "mail/img/logo.png"), PNG);
  writeFileSync(join(root, "mail/img/big.png"), Buffer.concat([PNG, Buffer.alloc(12 * 1024)]));
  writeFileSync(join(root, "mail/img/huge.jpg"), Buffer.alloc(40 * 1024));
  writeFileSync(join(root, "mail/img/icon.svg"), "<svg xmlns='http://www.w3.org/2000/svg'/>");
  writeFileSync(join(root, "public/brand/mark.png"), PNG);
});

const place = (page: string, o: Partial<AssetOptions> = {}) => placeAssets(page, { root, publicDir: join(root, "public"), ...o });
const codes = (r: ReturnType<typeof place>) => r.diagnostics.map((d) => `${d.code} ${d.severity}`);
const B64 = `data:image/png;base64,${PNG.toString("base64")}`;

describe("placeAssets", () => {
  it("leaves hosted, data, cid, anchor and template URLs alone", () => {
    const page = [
      '<img src="https://cdn.example.com/a.png">',
      '<img src="//cdn.example.com/b.png">',
      `<img src="${B64}">`,
      '<img src="cid:logo@example.com">',
      `<img src="${field("item.image")}">`,
      `<img src="${field("cdn")}/a.png">`,
      "<style>.a{background:url('https://cdn.example.com/c.png')}</style>",
    ].join("\n");
    expect(place(page)).toEqual({ page, diagnostics: [], files: [] });
  });

  it("can't inline for the default targets, so a local image without a base URL is an error", () => {
    const page = '<p>x</p>\n<p><img src="/mail/img/logo.png" alt=""></p>';
    const r = place(page);
    expect(r.page).toBe(page);
    expect(codes(r)).toEqual(["E015 error"]);
    expect(r.diagnostics[0]!.message).toMatch(/^\/mail\/img\/logo\.png needs a hosted URL: Gmail .* don't reliably show data: images/);
    expect(r.diagnostics[0]!.loc).toEqual({ line: 2, col: 14 });
    expect(place(page, { strict: false }).diagnostics[0]!.severity).toBe("warning");
  });

  it("hosts local images and CSS backgrounds under the base URL, one file per image", () => {
    const page = '<img src="/mail/img/logo.png"><style>.h{background:url("/mail/img/logo.png") #c33}</style><img src="/brand/mark.png">';
    const r = place(page, { baseUrl: "https://cdn.example.com/emails/" });
    expect(r.diagnostics).toEqual([]);
    const logo = /logo-[0-9a-f]{8}\.png/.exec(r.page)![0];
    const mark = /mark-[0-9a-f]{8}\.png/.exec(r.page)![0];
    expect(r.page).toBe(
      `<img src="https://cdn.example.com/emails/${logo}"><style>.h{background:url("https://cdn.example.com/emails/${logo}") #c33}</style><img src="https://cdn.example.com/emails/${mark}">`,
    );
    expect(r.files).toEqual([
      { from: join(root, "mail/img/logo.png"), name: logo },
      { from: join(root, "public/brand/mark.png"), name: mark },
    ]);
  });

  it("inlines images when every target shows data: images; CSS backgrounds still need a URL", () => {
    const page = '<img src="/mail/img/logo.png"><style>.h{background:url(/mail/img/logo.png)}</style>';
    const r = place(page, { targets: ["apple-mail"] });
    expect(r.page).toBe(`<img src="${B64}"><style>.h{background:url(/mail/img/logo.png)}</style>`);
    expect(codes(r)).toEqual(["E015 error"]);
    expect(r.diagnostics[0]!.message).toMatch(/background images must be hosted/);
    expect(r.files).toEqual([]);
  });

  it("warns about a large inlined image and hosts one too big to inline", () => {
    const big = place('<img src="/mail/img/big.png">', { targets: ["apple-mail"] });
    expect(big.page).toMatch(/^<img src="data:image\/png;base64,/);
    expect(codes(big)).toEqual(["W008 warning"]);
    expect(big.diagnostics[0]!.message).toMatch(/12\.\d KB/);

    const huge = place('<img src="/mail/img/huge.jpg">', { targets: ["apple-mail"] });
    expect(codes(huge)).toEqual(["E015 error"]);
    expect(huge.diagnostics[0]!.message).toMatch(/41\.0 KB is too big to inline \(over 32,768 bytes\)/);
    const hosted = place('<img src="/mail/img/huge.jpg">', { targets: ["apple-mail"], baseUrl: "https://cdn.example.com" });
    expect(hosted.diagnostics).toEqual([]);
    expect(hosted.page).toMatch(/^<img src="https:\/\/cdn\.example\.com\/huge-[0-9a-f]{8}\.jpg">$/);
  });

  it("only inlines PNG, JPEG and GIF", () => {
    const r = place('<img src="/mail/img/icon.svg">', { targets: ["apple-mail"] });
    expect(codes(r)).toEqual(["E015 error"]);
    expect(r.diagnostics[0]!.message).toMatch(/only PNG, JPEG and GIF are inlined/);
  });

  it("reads /@fs/ URLs, including Windows drive paths", () => {
    expect(place(`<img src="/@fs${root}/mail/img/logo.png">`, { targets: ["apple-mail"] }).page).toBe(`<img src="${B64}">`);
    const r = place('<img src="/@fs/C:/nope/logo.png">', { baseUrl: "https://cdn.example.com" });
    expect(r.diagnostics[0]!.message).toBe(`/@fs/C:/nope/logo.png isn't a file`);
  });

  it("reads a relative path from the project root, like a root-relative one", () => {
    const r = place('<img src="mail/img/logo.png">', { baseUrl: "https://cdn.example.com" });
    expect(r.diagnostics).toEqual([]);
    expect(r.page).toMatch(/^<img src="https:\/\/cdn\.example\.com\/logo-[0-9a-f]{8}\.png">$/);
  });

  it("reports a relative URL that isn't a file, since an email can't load it", () => {
    const r = place('<img src="/mail/img/nope.png?v=2">\n<img src="img/nope.png">');
    expect(r.page).toBe('<img src="/mail/img/nope.png?v=2">\n<img src="img/nope.png">');
    expect(codes(r)).toEqual(["E015 error", "E015 error"]);
    expect(r.diagnostics.map((d) => d.message)).toEqual([
      `/mail/img/nope.png?v=2 isn't a file in ${root} or its public folder, and an email can't load a relative URL`,
      `img/nope.png isn't a file in ${root} or its public folder, and an email can't load a relative URL`,
    ]);
    expect(r.diagnostics[1]!.loc).toEqual({ line: 2, col: 11 });
  });

  it("reports a relative URL built from a field", () => {
    const page = `<img src="/img/${field("item.slug")}.png"><style>.h{background:url(hero/${field("hero")}.jpg)}</style>`;
    const r = place(page);
    expect(r.page).toBe(page);
    expect(r.diagnostics.map((d) => d.message)).toEqual([
      "/img/{{item.slug}}.png is relative, and an email can't load a relative URL",
      "hero/{{hero}}.jpg is relative, and an email can't load a relative URL",
    ]);
  });

  it("with a base URL, reads relative URLs that aren't files as hosted under it", () => {
    const page = `<img src="/img/${field("item.slug")}.png"><img src="./img/nope.png"><style>.h{background:url('hero/${field("hero")}.jpg')}</style>`;
    const r = place(page, { baseUrl: "https://cdn.example.com/emails/" });
    expect(r.diagnostics).toEqual([]);
    expect(r.files).toEqual([]);
    expect(r.page).toBe(
      `<img src="https://cdn.example.com/emails/img/${field("item.slug")}.png"><img src="https://cdn.example.com/emails/img/nope.png"><style>.h{background:url('https://cdn.example.com/emails/hero/${field("hero")}.jpg')}</style>`,
    );
  });
});

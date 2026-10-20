import { describe, expect, it } from "vitest";
import { parseDataText } from "../../adapters/vite/find.ts";
import { run, type CliIO } from "../../src/cli.ts";
import { compile } from "../../src/index.ts";
import { decodeCss, decodeHtml } from "../../src/parse/decode.ts";

const doc = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head><body><div style="max-width:600px;margin:0 auto"><p>after bom</p></div></body></html>';

describe("byte order mark", () => {
  it("is dropped before parsing, not kept as a text row", () => {
    const plain = compile(doc);
    const bom = compile(`﻿${doc}`);
    expect(bom.html).not.toContain("﻿");
    expect(bom.html).toBe(plain.html);
    expect(bom.diagnostics).toEqual(plain.diagnostics);
  });

  it("keeps locations on the line and column an editor shows", () => {
    const bad = '<div style="max-width:600px;margin:0 auto"><p style="position:fixed">x</p></div>';
    const loc = (h: string) => compile(h, { strict: false }).diagnostics.map((d) => d.loc);
    expect(loc(`﻿${bad}`)).toEqual(loc(bad));
  });

  it("doesn't break a data set's JSON", () => {
    expect(parseDataText('﻿{"name":"Ada"}')).toEqual({ name: "Ada" });
  });
});

const bytes = (s: string, enc: "latin1" | "utf16le" | "utf8" = "utf8") => new Uint8Array(Buffer.from(s, enc));
const utf16be = (s: string) => new Uint8Array(Buffer.from(s, "utf16le").swap16());

describe("decodeHtml", () => {
  it("reads UTF-8 by default and drops its mark", () => {
    expect(decodeHtml(bytes("<p>Grüße</p>"))).toBe("<p>Grüße</p>");
    expect(decodeHtml(bytes("﻿<p>Grüße</p>"))).toBe("<p>Grüße</p>");
  });

  it("reads UTF-16 by its mark", () => {
    expect(decodeHtml(bytes("﻿<p>Grüße €</p>", "utf16le"))).toBe("<p>Grüße €</p>");
    expect(decodeHtml(utf16be("﻿<p>Grüße €</p>"))).toBe("<p>Grüße €</p>");
  });

  it("reads the encoding a meta declares", () => {
    const cp1252 = new Uint8Array([...bytes('<meta charset="windows-1252"><p>caf'), 0xe9, 0x20, 0x80, ...bytes("</p>")]);
    expect(decodeHtml(cp1252)).toBe('<meta charset="windows-1252"><p>café €</p>');
    // latin1 is windows-1252 to a browser, 0x80 is €
    const latin1 = new Uint8Array([...bytes("<META CHARSET=latin1><p>"), 0x80, ...bytes("</p>")]);
    expect(decodeHtml(latin1)).toBe("<META CHARSET=latin1><p>€</p>");
    const l2 = new Uint8Array([...bytes('<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-2"><p>'), 0xb3, ...bytes("</p>")]);
    expect(decodeHtml(l2)).toContain("<p>ł</p>");
  });

  it("lets the mark win over the meta", () => {
    expect(decodeHtml(bytes('﻿<meta charset="windows-1252"><p>é</p>'))).toBe('<meta charset="windows-1252"><p>é</p>');
  });

  it("reads a declared UTF-16 or an unknown label as UTF-8", () => {
    expect(decodeHtml(bytes('<meta charset="utf-16"><p>é</p>'))).toBe('<meta charset="utf-16"><p>é</p>');
    expect(decodeHtml(bytes('<meta charset="no-such"><p>é</p>'))).toBe('<meta charset="no-such"><p>é</p>');
  });

  it("reads only what the prescan reads as a declaration", () => {
    const utf8 = (head: string) => decodeHtml(bytes(`${head}<meta charset="utf-8"><p>zażółć</p>`));
    // charset= in another meta's content, an attribute that only ends in charset, a commented-out meta
    expect(utf8('<meta name="description" content="see charset=windows-1252">')).toContain("<p>zażółć</p>");
    expect(utf8('<meta data-charset="latin1">')).toContain("<p>zażółć</p>");
    expect(utf8('<!-- <meta charset="latin1"> -->')).toContain("<p>zażółć</p>");
    expect(utf8('<p title="<meta charset=latin1>">')).toContain("<p>zażółć</p>");
    expect(utf8('<meta content="text/html; charset=windows-1252">')).toContain("<p>zażółć</p>");
    // content only counts beside http-equiv, in either order, and the first charset wins
    const l2 = (head: string) => decodeHtml(new Uint8Array([...bytes(`${head}<p>`), 0xb3, ...bytes("</p>")]));
    expect(l2("<meta content='text/html;charset=\"ISO-8859-2\"' http-equiv=content-type>")).toContain("<p>ł</p>");
    expect(l2('<meta charset=iso-8859-2 charset=utf-8><meta charset="utf-8">')).toContain("<p>ł</p>");
  });

  it("only looks for the meta in the first 1024 bytes", () => {
    const late = new Uint8Array([...bytes(`<!--${" ".repeat(1100)}--><meta charset="windows-1252"><p>`), 0xe9, ...bytes("</p>")]);
    expect(decodeHtml(late)).toContain("<p>�</p>");
  });
});

describe("decodeCss", () => {
  it("reads @charset only as the first bytes", () => {
    expect(decodeCss(new Uint8Array([...bytes('@charset "windows-1252";a::after{content:"'), 0xe9, ...bytes('"}')]))).toContain('"é"');
    expect(decodeCss(bytes('a{} @charset "windows-1252"; b::after{content:"é"}'))).toContain('"é"');
    expect(decodeCss(bytes('﻿a::after{content:"é"}'))).toBe('a::after{content:"é"}');
  });
});

describe("cli", () => {
  const build = async (files: Record<string, Uint8Array>, args: string[] = []) => {
    const out: string[] = [];
    const io: CliIO = { stdout: (s) => void out.push(s), stderr: () => {}, readFile: (p) => files[p]!, writeFile: () => {} };
    expect(await run(["build", "in.html", ...args], io)).toBe(0);
    return out.join("");
  };

  it("decodes the input file by its meta and the css by @charset", async () => {
    const html = new Uint8Array([...bytes('<meta charset="windows-1252"><div style="max-width:600px;margin:0 auto"><p class="x">caf'), 0xe9, 0x20, 0x80, ...bytes("</p></div>")]);
    const css = new Uint8Array([...bytes('@charset "iso-8859-2";.x::after{content:"'), 0xb3, ...bytes('"}')]);
    const out = await build({ "in.html": html, "a.css": css }, ["--css", "a.css"]);
    expect(out).toContain("café €");
    expect(out).toContain("ł");
  });

  it("decodes a UTF-16 file by its mark", async () => {
    expect(await build({ "in.html": bytes('﻿<div style="max-width:600px;margin:0 auto"><p>Grüße</p></div>', "utf16le") })).toContain("Grüße");
  });
});

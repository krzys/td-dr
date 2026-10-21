import { describe, expect, it } from "vitest";
import { shell } from "../../src/shell/shell.ts";
import type { Emitted } from "../../src/emit/types.ts";
import { testCtx } from "../helpers/index.ts";

const emit = (o: Partial<Emitted> = {}): Emitted => ({ html: "<p>hi</p>", headCss: [], ...o });
const count = (s: string, sub: string) => s.split(sub).length - 1;

describe("shell", () => {
  it("starts with the doctype and defaults lang to en", () => {
    const out = shell(emit(), {}, testCtx(), "");
    expect(out.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(out).toContain('<html lang="en" xmlns:v=');
    expect(out).not.toContain(' dir=');
  });

  it("uses lang and dir from meta", () => {
    const out = shell(emit(), { lang: "ar", dir: "rtl" }, testCtx(), "");
    expect(out).toContain('<html lang="ar" dir="rtl"');
  });

  it("states the document's side on the content cell below the centring one", () => {
    expect(shell(emit(), {}, testCtx(), "")).toContain('<tr><td style="text-align:left;"><p>hi</p></td></tr>');
    expect(shell(emit(), { dir: "rtl" }, testCtx(), "")).toContain('<tr><td style="text-align:right;"><p>hi</p></td></tr>');
  });

  it("gives the wrapper a normal line height for text that has none of its own", () => {
    expect(shell(emit(), {}, testCtx(), "")).toContain('width="100%" style="width:100%;line-height:normal;">');
  });

  it("escapes the title", () => {
    const out = shell(emit(), { title: 'A & "B" <c>' }, testCtx(), "");
    expect(out).toContain("<title>A &amp; &quot;B&quot; &lt;c&gt;</title>");
  });

  it("emits an empty title when missing", () => {
    expect(shell(emit(), {}, testCtx(), "")).toContain("<title></title>");
  });

  it("takes the width from ctx", () => {
    const out = shell(emit(), {}, testCtx({ width: 640 }), "");
    expect(out).toContain("max-width:640px");
    expect(out).toContain('width="640"');
  });

  it("paints the background on body and wrapper", () => {
    const out = shell(emit({ background: "#f4f4f4" }), {}, testCtx(), "");
    expect(out).toContain('<body id="body" style="margin:0;padding:0;background-color:#f4f4f4;">');
    expect(out).toContain('bgcolor="#f4f4f4"');
  });

  it("omits background when none is given", () => {
    const out = shell(emit(), {}, testCtx(), "");
    expect(out).not.toContain("bgcolor");
    expect(out).not.toContain("background-color");
  });

  it("adds the headCss style block only when non-empty", () => {
    expect(count(shell(emit(), {}, testCtx(), ""), "<style>")).toBe(1);
    const out = shell(emit({ headCss: ["@media (max-width:600px){.a{x:y}}"] }), {}, testCtx(), "");
    expect(count(out, "<style>")).toBe(2);
    expect(out).toContain("@media (max-width:600px){.a{x:y}}");
  });

  it("keeps MSO conditionals balanced", () => {
    const out = shell(emit(), {}, testCtx(), "");
    expect(count(out, "<!--[if mso]>")).toBe(count(out, "<![endif]-->"));
    expect(count(out, "<!--[if mso]>")).toBe(3);
  });

  it("includes emitted html exactly once", () => {
    const out = shell(emit({ html: "<p>UNIQUE</p>" }), {}, testCtx(), "");
    expect(count(out, "<p>UNIQUE</p>")).toBe(1);
  });
});

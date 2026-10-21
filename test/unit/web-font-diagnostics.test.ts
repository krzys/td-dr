import { describe, expect, test } from "vitest";
import { parse } from "../../src/parse/html.ts";
import { cascade } from "../../src/style/cascade.ts";
import { DESKTOP } from "../../src/style/types.ts";
import { codesOf, testCtx } from "../helpers/index.ts";

const run = (html: string) => {
  const ctx = testCtx();
  cascade(parse(html, ctx), ctx, DESKTOP);
  return ctx;
};

describe("web fonts are collected", () => {
  test("@import and @font-face go to fonts, silently", () => {
    const ctx = testCtx();
    const { fonts } = cascade(parse('<style>@import url("https://fonts.googleapis.com/css2?family=Inter"); @font-face{font-family:X;src:url(x.woff2)}</style><p>x</p>', ctx), ctx, DESKTOP);
    expect(codesOf(ctx)).toEqual([]);
    expect(fonts.imports).toEqual(['@import url("https://fonts.googleapis.com/css2?family=Inter")']);
    expect(fonts.faces).toEqual(["@font-face{font-family:X;src:url(x.woff2)}"]);
  });

  test("@charset stays silent", () => {
    expect(codesOf(run('<style>@charset "utf-8"; p{color:red}</style><p>x</p>'))).toEqual([]);
  });

  test("a font @import after another rule is ignored with a W001", () => {
    const ctx = testCtx();
    const { fonts } = cascade(parse('<style>p{color:red} @import url("https://fonts.googleapis.com/css2?family=Inter");</style><p>x</p>', ctx), ctx, DESKTOP);
    expect(fonts.imports).toEqual([]);
    expect(ctx.diagnostics.list()[0]?.message).toMatch(/comes after other rules/);
  });

  test("a bodiless @layer before a font @import keeps it", () => {
    const ctx = testCtx();
    const { fonts } = cascade(parse('<style>@layer base; @import url("https://fonts.googleapis.com/css2?family=Inter");</style><p>x</p>', ctx), ctx, DESKTOP);
    expect(fonts.imports).toHaveLength(1);
    expect(codesOf(ctx)).toEqual([]);
  });

  test("a font @import inside @layer is invalid, not 'late'", () => {
    const ctx = run('<style>@layer a { @import url("https://fonts.googleapis.com/css2?family=Inter"); }</style><p>x</p>');
    expect(ctx.diagnostics.list()[0]?.message).toMatch(/inside @layer\/@supports is invalid/);
  });

  test("a fonts <link> goes to meta.fontLinks", () => {
    const ctx = testCtx();
    const doc = parse('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter"><p>x</p>', ctx);
    expect(doc.meta.fontLinks).toEqual(["https://fonts.googleapis.com/css2?family=Inter"]);
    expect(codesOf(ctx)).toEqual([]);
  });

  test("a font link with extra attributes names type in the hint", () => {
    const ctx = testCtx();
    parse('<link rel="stylesheet" media="print" href="https://fonts.googleapis.com/css2?family=Inter"><p>x</p>', ctx);
    expect(ctx.diagnostics.list()[0]?.hint).toMatch(/type/);
  });

  test("another <link> stays an external stylesheet", () => {
    const ctx = run('<link rel="stylesheet" href="https://example.com/a.css"><p>x</p>');
    expect(ctx.diagnostics.list()[0]?.message).toMatch(/External stylesheet/);
  });
});

describe("@font-face nesting", () => {
  const faces = (css: string) => {
    const ctx = testCtx();
    return cascade(parse(`<style>${css}</style><p>x</p>`, ctx), ctx, DESKTOP).fonts.faces;
  };

  test("a face inside @media keeps its query", () => {
    expect(faces("@media (min-width:600px){@font-face{font-family:X;src:url(x.woff2)}}")).toEqual(["@media (min-width:600px){@font-face{font-family:X;src:url(x.woff2)}}"]);
  });

  test("nested @media rules wrap in order", () => {
    expect(faces("@media screen{@media (min-width:600px){@font-face{font-family:X;src:url(x.woff2)}}}")).toEqual(["@media screen{@media (min-width:600px){@font-face{font-family:X;src:url(x.woff2)}}}"]);
  });

  test("a face inside a false @supports is not collected", () => {
    expect(faces("@supports (-webkit-appearance:none){@font-face{font-family:X;src:url(x.woff2)}}")).toEqual([]);
  });
});

describe("@import kinds", () => {
  test("a non-font @import is an external stylesheet", () => {
    const m = run('<style>@import url("theme.css");</style><p>x</p>').diagnostics.list()[0]?.message;
    expect(m).toMatch(/External stylesheet theme\.css is not fetched/);
  });
  test("a bare-string fonts @import is a web font", () => {
    expect(codesOf(run('<style>@import "https://fonts.bunny.net/css?family=a";</style><p>x</p>'))).toEqual([]);
  });
});

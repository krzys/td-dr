import { describe, expect, it } from "vitest";
import { compile } from "../../../src/index.ts";

// the author's table is the last one opened before its cell text
const tableTag = (html: string): string => {
  const out = compile(html, { lang: "en" }).html;
  const at = out.lastIndexOf("<table", out.indexOf(">A<"));
  return out.slice(at, out.indexOf(">", at) + 1);
};

// The shell's head reset collapses table borders; a passed-through author table must keep its own model.
describe("author tables keep their border model", () => {
  it("writes separate when the table spaces its cells (the default cellspacing)", () => {
    expect(tableTag(`<table bgcolor="#111111" width="600"><tr><td>A</td></tr></table>`)).toContain("border-collapse:separate");
  });

  it("writes separate for a border attribute", () => {
    expect(tableTag(`<table cellspacing="0" border="1"><tr><td>A</td></tr></table>`)).toContain("border-collapse:separate");
  });

  it("says nothing where both models render alike", () => {
    expect(tableTag(`<table cellspacing="0" cellpadding="0" border="0"><tr><td>A</td></tr></table>`)).not.toContain("border-collapse");
  });

  it("keeps an authored collapse as written", () => {
    expect(tableTag(`<table style="border-collapse:collapse"><tr><td>A</td></tr></table>`)).toContain("border-collapse:collapse");
  });
});

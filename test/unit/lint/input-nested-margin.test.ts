import { describe, expect, it } from "vitest";
import { compile } from "../../../src/index.ts";

describe("negative margins inside pass-through html", () => {
  it("are still reported: nothing lowers them, the author's value ships as written", () => {
    const html = '<div style="padding:24px"><blockquote style="margin:0;padding:24px">quote <em>x</em><div style="margin:0 -24px;background:#eee">band</div></blockquote></div>';
    const { diagnostics } = compile(html, { strict: false });
    expect(diagnostics.some((d) => d.code === "I003" && d.message.startsWith("margin"))).toBe(true);
  });
});

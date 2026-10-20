import { describe, expect, test } from "vitest";
import { compile } from "../../../src/index.ts";

const run = (style: string) => {
  const { html, diagnostics } = compile(`<div style="padding:16px;color:#334155"><h2 style="margin:0;${style}">Velra</h2></div>`, { strict: true });
  return { html, messages: diagnostics.filter((d) => d.code === "W001").map((d) => d.message) };
};

describe("text clipped to its background never ships invisible", () => {
  test("a gradient falls back to its first stop, alpha dropped", () => {
    const { html, messages } = run("background-image:linear-gradient(90deg,#ff0000cc,#00ff00);-webkit-background-clip:text;color:transparent");
    expect(messages).toEqual(["Text clipped to its background becomes solid #ff0000"]);
    expect(html).not.toContain("color:transparent");
    expect(html).not.toContain("linear-gradient");
  });

  test("a url image clipped to text uses the surrounding colour", () => {
    const { html, messages } = run("background-image:url(https://x.test/a.png);-webkit-background-clip:text;color:transparent");
    expect(messages).toEqual(["Text clipped to its background becomes solid #334155"]);
    expect(html).not.toContain("color:transparent");
    expect(html).not.toContain("url(");
  });

  test("a clipped colour is the text colour, never a painted box", () => {
    const { html, messages } = run("background-color:#ff0000;background-clip:text;color:transparent");
    expect(messages).toEqual(["Text clipped to its background becomes solid #ff0000"]);
    expect(html).not.toContain("background-color:#ff0000");
    expect(html).not.toContain('bgcolor="#ff0000"');
  });

  test("an hsl() first stop is lowered to hex first, so it is the fallback", () => {
    const { messages } = run("background-image:linear-gradient(hsl(200 80% 50%),#00ff00);-webkit-background-clip:text;color:transparent");
    expect(messages).toEqual(["Text clipped to its background becomes solid #1aa1e6"]);
  });

  test("a gradient starting at currentColor uses the surrounding colour", () => {
    const { messages } = run("background-image:linear-gradient(currentColor,#00ff00);-webkit-background-clip:text;color:transparent");
    expect(messages).toEqual(["Text clipped to its background becomes solid #334155"]);
  });

  test("opaque text over a clipped background just loses the background", () => {
    const { html, messages } = run("background-image:linear-gradient(red,blue);-webkit-background-clip:text;color:#111111");
    expect(messages).toEqual([]);
    expect(html).toContain("#111111");
    expect(html).not.toContain("linear-gradient");
  });
});

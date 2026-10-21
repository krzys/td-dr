import { describe, expect, it } from "vitest";
import { authorFrame } from "../../../adapters/template/errors.ts";

const stack = (...frames: string[]): string => ["Error: x", ...frames.map((f) => `    at ${f}`)].join("\n");

describe("authorFrame", () => {
  it("finds the component line in Windows stacks too", () => {
    expect(authorFrame(stack("node:internal/x:1:1", "Items (C:\\Users\\me\\emails\\Items.jsx:12:5)"))).toBe("C:/Users/me/emails/Items.jsx:12:5");
    expect(authorFrame(stack("Items (C:/Users/me/emails/Items.jsx:12:5)"))).toBe("C:/Users/me/emails/Items.jsx:12:5");
  });

  it("skips our own frames, node: and node_modules", () => {
    const ours = new URL("../../../adapters/template/runtime.ts", import.meta.url).pathname;
    expect(authorFrame(stack(`f (${ours}:1:1)`, "g (/p/node_modules/react/x.js:1:1)", "h (/p/emails/A.jsx:3:4)"))).toBe("/p/emails/A.jsx:3:4");
    expect(authorFrame(stack("<anonymous>"))).toBeUndefined();
  });
});

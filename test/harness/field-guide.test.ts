import { describe, expect, test } from "vitest";
import { compile } from "../../src/index.ts";
import { byteLength, SMTP_LINE_BYTES } from "../../src/limits.ts";
import { fixtureOptions, loadFixtures } from "./fixture-runner.ts";

// What the real-world field-guide email must keep, beyond its golden (field-guide.visual.test.ts renders it).

const f = loadFixtures().find((x) => `${x.feature}/${x.name}` === "real-world/field-guide");
if (!f) throw new Error("no fixture real-world/field-guide");
const { html } = compile(f.input, fixtureOptions(f));
const head = html.slice(0, html.indexOf("</head>"));

// The body of one `@media` block in the head, braces balanced.
const mediaBlock = (query: RegExp): string | undefined => {
  const m = query.exec(head);
  if (!m) return undefined;
  let depth = 0;
  for (let i = head.indexOf("{", m.index); i < head.length; i++) {
    if (head[i] === "{") depth++;
    else if (head[i] === "}" && --depth === 0) return head.slice(head.indexOf("{", m.index) + 1, i);
  }
  return undefined;
};

describe("real-world/field-guide", () => {
  test("light-dark() is resolved, not shipped", () => {
    expect(html).not.toContain("light-dark(");
  });

  test("the head keeps a width query and a dark block that repaints the page", () => {
    expect(mediaBlock(/@media[^{]*\((?:max|min)-width:\s*\d+px\)/)).toBeDefined();
    const dark = mediaBlock(/@media \(prefers-color-scheme: dark\)/);
    expect(dark, "no prefers-color-scheme: dark block").toBeDefined();
    // --paper is #121417 in the source's dark block
    expect(dark).toMatch(/\bbody \{[^}]*background-color:#121417/);
  });

  test("no line is longer than a mail server allows", () => {
    expect(Math.max(...html.split("\n").map(byteLength))).toBeLessThanOrEqual(SMTP_LINE_BYTES);
  });

  const imgs = html.match(/<img\b[^>]*>/g) ?? [];

  test("every image has a width, and a fixed one a height too", () => {
    expect(imgs.length).toBe(12);
    for (const img of imgs) {
      expect(img, img).toMatch(/\swidth="\d+"/);
      if (!img.includes("width:100%")) expect(img, img).toMatch(/\sheight="\d+"/);
    }
  });

  // A fluid image gets no height attribute yet, though docs/support.md#images says always.
  // When it does, make this a plain test.
  test.fails("every image has a height", () => {
    for (const img of imgs) expect(img, img).toMatch(/\sheight="\d+"/);
  });
});

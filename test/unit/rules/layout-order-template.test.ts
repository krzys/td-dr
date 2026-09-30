import { describe, expect, test } from "vitest";
import { compile } from "../../../src/index.ts";

const hb = (html: string) => compile(html, { template: "handlebars", strict: true });
const col = (kids: string) => `<div style="display:flex;flex-direction:column">${kids}</div>`;
const e007 = (r: ReturnType<typeof compile>) => r.diagnostics.filter((d) => d.code === "E007");

describe("order on the elements inside a template construct", () => {
  test("a data-email-if / else chain whose branches carry an order is E007", () => {
    const r = hb(col(`<div style="order:1">X</div><div data-email-if="a" style="order:2">Y</div><div data-email-else style="order:2">W</div><div>Z</div>`));
    expect(e007(r).length).toBeGreaterThan(0);
  });

  test("a <tddr-if> body with an order is E007", () => {
    const r = hb(col(`<div style="order:1">X</div><tddr-if test="a"><div style="order:2">Y</div></tddr-if><div>Z</div>`));
    expect(e007(r).length).toBeGreaterThan(0);
  });

  test("a <tddr-each> body with several elements and an order is E007", () => {
    const r = hb(col(`<div>Z</div><tddr-each of="xs"><div style="order:1">A</div><div>B</div></tddr-each>`));
    expect(e007(r).length).toBeGreaterThan(0);
  });

  test("constructs without an order in the same column still compile", () => {
    const r = hb(col(`<div style="order:1">X</div><tddr-if test="a"><div>Y</div></tddr-if><div>Z</div>`));
    expect(e007(r)).toEqual([]);
  });
});

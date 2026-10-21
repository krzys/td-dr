import { describe, expect, test } from "vitest";
import { beats, offer, type Candidate, type Props } from "../../src/style/precedence.ts";

const c = (o: Partial<Candidate>): Candidate => ({ value: "x", tier: 1, inline: false, layer: -1, spec: [0, 0, 0], order: 0, ...o });

describe("beats", () => {
  test("importance, then style attribute, then layers, specificity and order", () => {
    expect(beats(c({ tier: 2 }), c({ tier: 1, inline: true, spec: [1, 0, 0] }))).toBe(true);
    expect(beats(c({ inline: true }), c({ spec: [1, 0, 0], order: 9 }))).toBe(true);
    expect(beats(c({ spec: [0, 1, 0] }), c({ spec: [0, 0, 5], order: 9 }))).toBe(true);
    expect(beats(c({ order: 2 }), c({ order: 1 }))).toBe(true);
    expect(beats(c({ order: 1 }), c({ order: 1 }))).toBe(false);
  });

  test("normal: later layers win and unlayered beats them all", () => {
    expect(beats(c({ layer: 1 }), c({ layer: 0, spec: [1, 0, 0] }))).toBe(true);
    expect(beats(c({ layer: -1 }), c({ layer: 5, spec: [1, 0, 0] }))).toBe(true);
    expect(beats(c({ layer: 0, order: 9 }), c({ layer: -1 }))).toBe(false);
  });

  test("important: earlier layers win and unlayered loses to them", () => {
    expect(beats(c({ tier: 2, layer: 0 }), c({ tier: 2, layer: 1, spec: [1, 0, 0] }))).toBe(true);
    expect(beats(c({ tier: 2, layer: 3 }), c({ tier: 2, layer: -1, spec: [1, 0, 0], order: 9 }))).toBe(true);
    expect(beats(c({ tier: 2, layer: -1, order: 9 }), c({ tier: 2, layer: 0 }))).toBe(false);
  });
});

test("offer keeps the winner where the property was first offered", () => {
  const props: Props = new Map();
  offer(props, "color", c({ value: "red", order: 1 }));
  offer(props, "margin-top", c({ value: "0", order: 2 }));
  offer(props, "color", c({ value: "blue", order: 3 }));
  offer(props, "color", c({ value: "green", order: 0 }));
  expect([...props].map(([p, v]) => `${p}:${v.value}`)).toEqual(["color:blue", "margin-top:0"]);
});

import { describe, expect, test } from "vitest";
import { analyze } from "../../../src/analyze/analyze.ts";
import { rules } from "../../../src/analyze/registry.ts";
import type { Rule } from "../../../src/analyze/rule.ts";
import { createCtx } from "../../../src/ctx.ts";
import type { StyledElement } from "../../../src/style/types.ts";
import { loadFixtures } from "../../harness/fixture-runner.ts";
import { styledFrom } from "../../helpers/index.ts";

// Analysis is a query over the styled tree: a frozen tree must give the same IR and diagnostics.
const deepFreeze = <T>(v: T): T => {
  if (v === null || typeof v !== "object" || Object.isFrozen(v)) return v;
  for (const k of Reflect.ownKeys(v)) deepFreeze((v as Record<PropertyKey, unknown>)[k]);
  return Object.freeze(v);
};

// Every node a rule returns is frozen too, so a parent rule can't edit the IR of its children.
const frozenRules: Rule[] = rules.map((r) => ({ ...r, analyze: (n, ctx, recurse) => deepFreeze(r.analyze(n, ctx, recurse)) }));

const run = (html: string, freeze: boolean) => {
  const ctx = createCtx({});
  const body: StyledElement = styledFrom(html, createCtx({}));
  const node = freeze ? analyze(deepFreeze(body), ctx, frozenRules) : analyze(body, ctx);
  return { node, diagnostics: ctx.diagnostics.list() };
};

// rounded cards with edge children, clipped overflow, links around layout, rows, grids, images, buttons, templates
const FEATURES = new Set(["radius", "overflow", "link", "flex-row", "flex-column", "flex-wrap", "grid", "image", "button", "templates", "table-display"]);
const fixtures = loadFixtures();

describe("analysis leaves its input untouched", () => {
  test("the fixtures cover rounded clips, links, rows, grids, images, buttons and templates", () => {
    const features = new Set(fixtures.map((f) => f.feature));
    expect([...FEATURES].filter((f) => !features.has(f))).toEqual([]);
  });

  test.each(fixtures.map((f) => [`${f.feature}/${f.name}`, f.input] as const))("%s", (_, input) => {
    expect(run(input, true)).toEqual(run(input, false));
  });

  test("a rounded card with an edge image", () => {
    const html = `<div style="border-radius:12px;overflow:hidden;background:#fff;border:1px solid #ddd">
      <img src="a.png" alt="" width="600" style="display:block;width:100%">
      <div style="padding:16px">Text</div>
      <div style="background:#eee">Footer</div></div>`;
    expect(run(html, true)).toEqual(run(html, false));
  });
});

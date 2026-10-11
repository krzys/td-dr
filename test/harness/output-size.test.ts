import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Size gains stay (docs/decisions.md §7): a golden may shrink freely, growing past its budget needs a reason.
// After an intended change, rewrite the budget with UPDATE_SIZE_BUDGET=1 pnpm test output-size.
const ROOT = "test/fixtures";
const GROUPS = ["real-world", "frameworks", "complex"];
const BUDGET = "test/harness/size-budget.json";
const SLACK = 1.01;

const goldens = GROUPS.flatMap((g) =>
  readdirSync(join(ROOT, g), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => {
      try {
        return [[`${g}/${d.name}`, Buffer.byteLength(readFileSync(join(ROOT, g, d.name, "expected.html"), "utf8"))] as const];
      } catch {
        return [];
      }
    }),
);

describe("output size", () => {
  if (process.env["UPDATE_SIZE_BUDGET"]) {
    writeFileSync(BUDGET, `${JSON.stringify(Object.fromEntries(goldens), null, 2)}\n`);
  }
  const budget = JSON.parse(readFileSync(BUDGET, "utf8")) as Record<string, number>;

  it.each(goldens)("%s stays within its budget", (name, bytes) => {
    expect(budget[name], `no budget for ${name}; run with UPDATE_SIZE_BUDGET=1`).toBeDefined();
    expect(bytes).toBeLessThanOrEqual(Math.ceil(budget[name]! * SLACK));
  });
});

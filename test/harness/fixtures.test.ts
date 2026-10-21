import { describe, expect, test } from "vitest";
import { compile } from "../../src/index.ts";
import { byteLength, SMTP_LINE_BYTES } from "../../src/limits.ts";
import { fixtureOptions, isActive, loadFixtures } from "./fixture-runner.ts";
import { goldenName, templateDialects, tokenize } from "./template-fixture.ts";

describe("fixtures", () => {
  for (const f of loadFixtures()) {
    const id = `${f.feature}/${f.name}`;
    if (!isActive(f)) {
      test.todo(id);
      continue;
    }
    const dialects = templateDialects(f);
    for (const dialect of dialects ?? [undefined]) {
      test(dialects && dialects.length > 1 ? `${id} [${dialect}]` : id, async () => {
        const { html, diagnostics } = dialect
          ? compile(tokenize(f.input), { ...fixtureOptions(f), template: dialect })
          : compile(f.input, fixtureOptions(f));
        await expect(html).toMatchFileSnapshot(`${f.dir}/${dialect ? goldenName(dialects!, dialect) : "expected.html"}`);
        await expect(JSON.stringify(diagnostics, null, 2) + "\n").toMatchFileSnapshot(`${f.dir}/diagnostics.json`);

        // a mail server breaks a longer line anywhere (docs/support.md#size-limits)
        if (!diagnostics.some((d) => d.code === "W019")) {
          expect(Math.max(...html.split("\n").map(byteLength))).toBeLessThanOrEqual(SMTP_LINE_BYTES);
        }

        const errors = diagnostics.filter((d) => d.severity === "error");
        if (f.intent.expect === "diagnostic") {
          expect(errors.length).toBeGreaterThan(0);
          const got = new Set(diagnostics.map((d) => d.code));
          for (const code of f.intent.codes ?? []) expect(got, `missing ${code}`).toContain(code);
        } else if (f.intent.expect === "compile") {
          expect(errors).toEqual([]);
        }
      });
    }
  }
});

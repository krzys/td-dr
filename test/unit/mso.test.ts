import { expect, test } from "vitest";
import { ifNotMso, msoOnly } from "../../src/emit/mso.ts";

test("inner mso conditionals open up, !mso branches go", () => {
  expect(msoOnly("a<!--[if mso]>b<![endif]--><!--[if !mso]><!-->c<!--<![endif]-->d")).toBe("<!--[if mso]>abd<![endif]-->");
});

test("version-gated branches can't be flattened, so they're reported and dropped", () => {
  const dropped: string[] = [];
  const out = msoOnly("<!--[if lt mso 12]>A<![endif]--><!--[if gte mso 9]>B<![endif]--><!--[if (gte mso 9)|(IE)]>C<![endif]-->", (c) => dropped.push(c));
  expect(out).toBe("<!--[if mso]>BC<![endif]-->");
  expect(dropped).toEqual(["lt mso 12"]);
});

test("ifNotMso drops a whole downlevel-revealed guard inside it", () => {
  expect(ifNotMso("a<!--[if !mso]><!--><span>b</span><!--<![endif]-->c")).toBe("<!--[if !mso]><!-->a<span>b</span>c<!--<![endif]-->");
});

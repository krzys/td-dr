import { describe, expect, it } from "vitest";
import { parseDataText } from "../../adapters/vite/find.ts";
import { compile } from "../../src/index.ts";

const doc = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head><body><div style="max-width:600px;margin:0 auto"><p>after bom</p></div></body></html>';

describe("byte order mark", () => {
  it("is dropped before parsing, not kept as a text row", () => {
    const plain = compile(doc);
    const bom = compile(`﻿${doc}`);
    expect(bom.html).not.toContain("﻿");
    expect(bom.html).toBe(plain.html);
    expect(bom.diagnostics).toEqual(plain.diagnostics);
  });

  it("keeps locations on the line and column an editor shows", () => {
    const bad = '<div style="max-width:600px;margin:0 auto"><p style="position:fixed">x</p></div>';
    const loc = (h: string) => compile(h, { strict: false }).diagnostics.map((d) => d.loc);
    expect(loc(`﻿${bad}`)).toEqual(loc(bad));
  });

  it("doesn't break a data set's JSON", () => {
    expect(parseDataText('﻿{"name":"Ada"}')).toEqual({ name: "Ada" });
  });
});

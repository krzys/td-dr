import { describe, expect, test } from "vitest";
import { collapse, type Diagnostic } from "../../src/diagnostics/diagnostic.ts";
import { compile } from "../../src/index.ts";

const w = (message: string, line?: number, col = 1): Diagnostic => ({ code: "W001", severity: "warning", message, ...(line !== undefined && { loc: { line, col } }) });

describe("repeated diagnostics", () => {
  test("the same one at the same place is said once", () => {
    expect(collapse([w("a", 3), w("a", 3), w("b", 3)])).toEqual([w("a", 3), w("b", 3)]);
  });

  test("the same one at several places is one, at the earliest, counted, with every place kept", () => {
    expect(collapse([w("a", 9), w("b", 2), w("a", 4), w("a", 9)])).toEqual([
      { ...w("a (2 places)", 4), locs: [{ line: 4, col: 1 }, { line: 9, col: 1 }] },
      w("b", 2),
    ]);
  });

  test("a different hint or code keeps them apart, a place-less copy joins its group", () => {
    const hinted = { ...w("a", 1), hint: "h" };
    expect(collapse([w("a", 1), hinted, { ...w("a", 1), code: "W002" }, w("a")])).toEqual([w("a", 1), hinted, { ...w("a", 1), code: "W002" }]);
  });

  test("compile says a property dropped on many elements once", () => {
    const html = ["a", "b", "c"].map((t) => `<div style="scroll-snap-align:start">${t}</div>`).join("\n");
    const ds = compile(html).diagnostics.filter((d) => d.message.startsWith("scroll-snap"));
    expect(ds).toHaveLength(1);
    expect(ds[0]).toMatchObject({ message: "scroll-snap-align: start is dropped (3 places)", loc: { line: 1 } });
    expect(ds[0]!.locs?.map((l) => l.line)).toEqual([1, 2, 3]);
  });
});

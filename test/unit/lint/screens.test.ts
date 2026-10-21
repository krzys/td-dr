import { describe, expect, it } from "vitest";
import { compile } from "../../../src/index.ts";
import { png } from "./run.ts";

const codes = (html: string, code: string) => compile(html).diagnostics.filter((d) => d.code === code);

// copies shown on one screen or scheme only are still in the desktop tree (docs/support.md#screens)
describe("lint across screens", () => {
  it("counts a desktop and a mobile copy of the h1 once", () => {
    const html = `<style>.m{display:none}@media (max-width:480px){.d{display:none}.m{display:block}}</style>
<div><h1 class="d">Spring sale</h1><h1 class="m">Sale</h1><p>x</p></div>`;
    expect(codes(html, "I011")).toEqual([]);
  });
  it("warns about the light logo only in a light/dark swap", () => {
    const html = `<style>.dark{display:none}@media (prefers-color-scheme:dark){.light{display:none}.dark{display:block}}</style>
<div><img class="light" src="${png(6)}" alt="Birch" width="80" height="40"><img class="dark" src="${png(6)}" alt="Birch" width="80" height="40"></div>`;
    const ds = codes(html, "W017");
    expect(ds).toHaveLength(1);
    expect(ds[0]!.loc?.col).toBeLessThan(html.split("\n")[1]!.indexOf('class="dark"'));
  });
  it("notes a dark design without a dark-mode rule", () => {
    const dark = '<div style="background-color:#0b1220;color:#fff"><p>x</p></div>';
    expect(codes(dark, "I014")).toHaveLength(1);
    expect(codes(`<style>@media (prefers-color-scheme:dark){p{color:#fff}}</style>${dark}`, "I014")).toEqual([]);
  });
});

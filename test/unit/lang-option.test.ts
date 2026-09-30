import { describe, expect, it } from "vitest";
import { compile } from "../../src/index.ts";

const langs = (html: string) => [...html.matchAll(/<(?:html|div role="article")[^>]* lang="([^"]*)"/g)].map((m) => m[1]);
const i009 = (r: ReturnType<typeof compile>) => r.diagnostics.filter((d) => d.code === "I009");

describe("lang", () => {
  it("comes from the option when the source sets none", () => {
    const r = compile("<p>Hallo</p>", { lang: "de" });
    expect(langs(r.html)).toEqual(["de", "de"]);
    expect(i009(r)).toEqual([]);
  });
  it("comes from <html lang> before the option", () => {
    expect(langs(compile('<!doctype html><html lang="fr"><body><p>x</p></body></html>', { lang: "de" }).html)).toEqual(["fr", "fr"]);
  });
  it("defaults to en with an I009, for a component as much as a whole document", () => {
    for (const input of ["<p>x</p>", "<!doctype html><html><body><p>x</p></body></html>"]) {
      const r = compile(input);
      expect(langs(r.html)).toEqual(["en", "en"]);
      expect(i009(r)).toHaveLength(1);
    }
  });
});

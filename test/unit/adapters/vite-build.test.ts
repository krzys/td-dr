import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildEmails } from "../../../adapters/vite/index.ts";

const dir = resolve(import.meta.dirname, "../../vite-build");
const out = () => mkdtempSync(join(tmpdir(), "tddr-build-"));
const BASE = "https://cdn.example.com/emails";

describe("buildEmails", () => {
  it("writes each template email once per dialect, with its images under the base URL", async () => {
    const to = out();
    const results = await buildEmails({ dir, root: dir, out: to, baseUrl: BASE });
    expect(results.map((r) => [r.email, r.dialect, r.skipped !== undefined, r.diagnostics.filter((d) => d.severity === "error")])).toEqual([
      ["badge", "handlebars", false, []],
      ["badge", "liquid", false, []],
      ["plain", undefined, true, []],
    ]);
    expect(readdirSync(to).sort()).toEqual(["assets", "badge.handlebars.html", "badge.liquid.html"]);
    const assets = readdirSync(join(to, "assets")).sort();
    expect(assets).toEqual([expect.stringMatching(/^logo-[0-9a-f]{8}\.png$/), expect.stringMatching(/^mark-[0-9a-f]{8}\.png$/)]);
    expect(readFileSync(join(to, "assets", assets[0]!))).toEqual(readFileSync(join(dir, "badge/logo.png")));

    const hbs = readFileSync(join(to, "badge.handlebars.html"), "utf8");
    expect(hbs).toContain("{{user.name}}");
    expect(hbs).toContain(`src="${BASE}/${assets[0]}"`);
    expect(hbs).toContain(`src="${BASE}/${assets[1]}"`);
    // the VML background in Outlook needs the same hosted image
    expect(hbs).toContain(`src="${BASE}/${assets[0]}" color="#cc3333"`);
    expect(hbs).not.toMatch(/src="\/(?:badge|brand)\//);
    expect(readFileSync(join(to, "badge.liquid.html"), "utf8")).toContain("{{ user.name | escape }}");
    expect(results[2]!.skipped).toMatch(/not a template/);
  });

  it("reports images it can't place, and still writes the templates", async () => {
    const to = out();
    const results = await buildEmails({ dir, root: dir, out: to });
    const errors = results[0]!.diagnostics.filter((d) => d.code === "E015").map((d) => d.message.split(":")[0]);
    expect(errors).toEqual(["/badge/logo.png needs a hosted URL", "/badge/logo.png needs a hosted URL", "/brand/mark.png needs a hosted URL"]);
    expect(existsSync(join(to, "badge.handlebars.html"))).toBe(true);
    expect(existsSync(join(to, "assets"))).toBe(false);
  });

  it("names files from a pattern", async () => {
    const to = out();
    const results = await buildEmails({ dir, root: dir, out: to, baseUrl: BASE, fileName: "[dialect]/[name].html" });
    expect(results.filter((r) => r.file).map((r) => r.file)).toEqual([join(to, "handlebars/badge.html"), join(to, "liquid/badge.html")]);
    expect(readFileSync(join(to, "handlebars/badge.html"), "utf8")).toContain("{{user.name}}");
    // assets stay in one folder next to the pattern's output
    expect(readdirSync(to).sort()).toEqual(["assets", "handlebars", "liquid"]);
  });

  it("refuses a pattern that writes two outputs to one file, or outside the folder, before writing anything", async () => {
    const to = out();
    await expect(buildEmails({ dir, root: dir, out: to, fileName: "[name].html" })).rejects.toThrow(
      'file name "[name].html" gives badge.html for both badge (handlebars) and badge (liquid); add [dialect] or [name]',
    );
    await expect(buildEmails({ dir, root: dir, out: to, fileName: "../[name].[dialect].html" })).rejects.toThrow(
      'file name "../[name].[dialect].html" writes outside the output folder',
    );
    await expect(buildEmails({ dir, root: dir, out: to, fileName: "[email].html" })).rejects.toThrow(
      'file name "[email].html": unknown [email]; use [name] and [dialect]',
    );
    expect(readdirSync(to)).toEqual([]);
  });

  it("records a render failure for that email and goes on with the others", async () => {
    const to = out();
    const fail = resolve(import.meta.dirname, "../../vite-build-fail");
    const results = await buildEmails({ dir: fail, root: fail, out: to });
    expect(results.map((r) => [r.email, r.error?.split("\n")[0]])).toEqual([
      ["boom", "boom: rendering with react failed: nope"],
      ["fine", undefined],
    ]);
    expect(readdirSync(to)).toEqual(["fine.handlebars.html"]);
  });

  it("says when an email has no <title>, and not when a component writes one", async () => {
    const results = await buildEmails({ dir, root: dir, out: out(), baseUrl: BASE });
    expect(results[0]!.diagnostics.filter((d) => d.code === "I015")).toEqual([expect.objectContaining({ severity: "info", message: "Email has no title" })]);
    const fail = resolve(import.meta.dirname, "../../vite-build-fail");
    const fine = (await buildEmails({ dir: fail, root: fail, out: out() })).find((r) => r.email === "fine")!;
    expect(fine.diagnostics.map((d) => d.code)).not.toContain("I015");
    expect(readFileSync(fine.file!, "utf8")).toContain("<title>Welcome</title>");
  });
});

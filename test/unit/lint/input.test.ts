import { describe, expect, it, vi } from "vitest";
import type { Ctx } from "../../../src/ctx.ts";
import type { Capabilities, Resolution } from "../../../src/targets/capabilities.ts";
import { lintInput } from "../../../src/lint/input.ts";
import { el, styledFrom, testCtx } from "../../helpers/index.ts";

// css-<prop> for every property, so tests control the outcome through caps alone
vi.mock("../../../src/targets/features.ts", () => ({
  featuresFor: (prop: string) => [/^border-.*-radius$/.test(prop) ? "css-border-radius" : `css-${prop}`],
  featuresForAtRule: () => [],
  featuresForSelector: () => [],
  featuresForImage: () => [],
  featuresForTag: () => [],
}));

const ctxWith = (table: Record<string, Partial<Resolution>>): Ctx => {
  const caps: Capabilities = {
    targets: ["x"],
    check: (slug) => ({ status: "y", clients: [], unsupported: [], notes: [], ...table[slug] }),
  };
  return { ...testCtx(), caps };
};

const run = (body: ReturnType<typeof el>, table: Record<string, Partial<Resolution>>) => {
  const ctx = ctxWith(table);
  lintInput(body, ctx);
  return ctx.diagnostics.list();
};

const N: Partial<Resolution> = { status: "n", clients: ["Outlook"], unsupported: ["Outlook"], notes: ["Not supported."] };

describe("lintInput", () => {
  it("n becomes W005 with the client and the first note as hint", () => {
    const [d, ...rest] = run(el("div", { "box-shadow": "0 1px #000" }, [], { line: 4 }), { "css-box-shadow": N });
    expect(rest).toEqual([]);
    expect(d).toMatchObject({ code: "W005", severity: "warning", message: "box-shadow isn't supported in Outlook", hint: "Not supported.", loc: { line: 4 } });
  });

  it("uses a generic hint when caniemail has no note", () => {
    const [d] = run(el("div", { "box-shadow": "x" }), { "css-box-shadow": { status: "n", clients: ["Gmail", "Yahoo"], unsupported: ["Gmail", "Yahoo"] } });
    expect(d?.message).toBe("box-shadow isn't supported in Gmail, Yahoo");
    expect(d?.hint).toMatch(/narrow --targets/);
  });

  it("visibility gets its own hint: what it hides shows where it's ignored", () => {
    const [d] = run(el("p", { visibility: "hidden" }), { "css-visibility": { ...N, notes: ["Buggy. `visibility:collapse` on a `<tr>`."] } });
    expect(d).toMatchObject({ code: "W005", message: "visibility isn't supported in Outlook" });
    expect(d?.hint).toMatch(/^Those clients show what it hides.*display:none.*I002/);
  });

  it("color-scheme on text says its light-dark() arms are already taken, not to drop it", () => {
    const [d] = run(el("p", { "color-scheme": "only light" }), { "css-color-scheme": N });
    expect(d).toMatchObject({ code: "W005", message: "color-scheme isn't supported in Outlook" });
    expect(d?.hint).toMatch(/light-dark\(\) arms/);
    expect(d?.hint).not.toMatch(/drop the property/);
  });

  it("a becomes I003 with the note", () => {
    const [d] = run(el("div", { opacity: "0.5" }), { "css-opacity": { status: "a", clients: ["Gmail"], notes: ["Partial."] } });
    expect(d).toMatchObject({ code: "I003", severity: "info", hint: "Partial." });
  });

  it("y and u report nothing", () => {
    expect(run(el("div", { opacity: "1", filter: "x" }), { "css-filter": { status: "u", clients: ["Gmail"] } })).toEqual([]);
  });

  it("dedupes per slug: first loc, counted places, once per element", () => {
    const body = el("div", {}, [
      el("p", { "box-shadow": "a" }, [], { line: 2 }),
      el("p", { "box-shadow": "b" }, [], { line: 3 }),
      el("p", { "box-shadow": "c" }, [], { line: 4 }),
    ]);
    const ds = run(body, { "css-box-shadow": N });
    expect(ds).toHaveLength(1);
    expect(ds[0]).toMatchObject({ message: "box-shadow isn't supported in Outlook (3 places)", loc: { line: 2 } });
  });

  it("four corner longhands on one element are one place named border-radius", () => {
    const radius = Object.fromEntries(["top-left", "top-right", "bottom-right", "bottom-left"].map((c) => [`border-${c}-radius`, "8px"]));
    const ds = run(el("img", radius), { "css-border-radius": N });
    expect(ds.map((d) => d.message)).toEqual(["border-radius isn't supported in Outlook"]);
  });

  it("skips what the compiler lowers", () => {
    const lowered = {
      display: "flex", "flex-direction": "row", "flex-grow": "1", gap: "8px", "row-gap": "8px", "column-gap": "8px",
      "margin-top": "4px", "padding-left": "4px", width: "50%", "max-width": "600px", "align-items": "center",
      "justify-content": "center", "box-sizing": "border-box", position: "relative",
    };
    const all = Object.fromEntries(Object.keys(lowered).map((k) => [`css-${k}`, N]));
    expect(run(el("div", lowered), all)).toEqual([]);
  });

  it("still checks display values that pass through, and visits nested elements", () => {
    const body = el("div", {}, [el("span", { display: "inline-block" }, [], { line: 7 })]);
    const [d] = run(body, { "css-display": N });
    expect(d).toMatchObject({ code: "W005", loc: { line: 7 } });
  });

  const ALL = new Proxy({} as Record<string, Partial<Resolution>>, { get: () => N });
  const box = (declared: Record<string, string>, children: ReturnType<typeof el>[] = []) =>
    el("div", { display: "block", ...declared }, children, { declared });
  const msgs = (body: ReturnType<typeof el>) => run(body, ALL).map((d) => `${d.code} ${d.message}`);

  it("top/right/bottom/left are never reported (E002 or a no-op already)", () => {
    expect(run(el("span", { position: "relative", top: "-6px", right: "1px", bottom: "2px", left: "3px" }), ALL)).toEqual([]);
  });

  it("container: background-image reset and dropped box-shadow are not W005; emitted props are", () => {
    const d = box({ "background-color": "#fff", "background-image": "none", "border-top-left-radius": "8px", "box-shadow": "0 1px #000" });
    expect(msgs(d)).toEqual(["W005 background-color isn't supported in Outlook", "W005 border-radius isn't supported in Outlook"]);
  });

  it("container: padding, margin and width are lowered; nested pass-through text keeps them", () => {
    const decl = { "padding-left": "4px", "margin-top": "4px", width: "50%" };
    expect(run(box(decl), ALL)).toEqual([]);
    const nested = el("span", {}, [], { declared: decl });
    expect(run(el("p", { display: "block" }, [nested]), ALL).map((d) => d.message.split(" ")[0]).sort()).toEqual(["margin", "padding", "width"]);
  });

  it("box-shadow on a span is W005, on a div container it is left to W001", () => {
    expect(msgs(el("span", { "box-shadow": "x" }))).toEqual(["W005 box-shadow isn't supported in Outlook"]);
    expect(msgs(box({ "box-shadow": "x" }))).toEqual([]);
  });

  it("skips initial values and does not descend into hidden elements", () => {
    expect(run(el("span", { "font-weight": "400" }), ALL)).toEqual([]);
    const hidden = el("div", { display: "none" }, [el("span", { "box-shadow": "x" })], { declared: { display: "none" } });
    expect(run(box({}, [hidden]), ALL)).toEqual([]);
  });

  it("img width and height become attributes, other img styles still count", () => {
    const img = el("img", {}, [], { declared: { width: "56px", height: "56px", "border-top-left-radius": "50%" } });
    expect(msgs(img)).toEqual(["W005 border-radius isn't supported in Outlook"]);
  });

  it("px and unitless line-height are already handled; other values still count", () => {
    expect(run(el("p", {}, [], { declared: { "line-height": "24px" } }), ALL)).toEqual([]);
    expect(run(el("p", {}, [], { declared: { "line-height": "1.5" } }), ALL)).toEqual([]);
    expect(msgs(el("p", {}, [], { declared: { "line-height": "150%" } }))).toHaveLength(1);
  });

  describe("with the real analyzer", () => {
    const real = (html: string) => {
      const ctx = ctxWith(ALL);
      lintInput(styledFrom(html, ctx), ctx);
      return ctx.diagnostics.list().filter((d) => d.code === "W005" || d.code === "I003").map((d) => d.message.split(" ")[0]);
    };

    it("margins, lifted box properties and hr are lowered", () => {
      expect(real('<p style="margin:0 0 16px">x</p>')).toEqual([]);
      expect(real('<h2 style="padding:0 0 8px;border-bottom:1px solid #000">x</h2>')).toEqual([]);
      expect(real('<hr style="height:0">')).toEqual([]);
    });

    it("a no-wrap text block's overflow is its cell's clip (W003); text-overflow still counts", () => {
      expect(real('<p style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">x</p>')).toEqual(["white-space", "text-overflow"]);
      expect(real('<p style="overflow:hidden">x</p>')).toEqual(["overflow"]);
    });

    it("a margin nested in pass-through HTML does reach the output", () => {
      expect(real('<p>a <span style="margin-left:4px">b</span></p>')).toEqual(["margin"]);
    });

    it("a flex-item img keeps W001 for box-shadow and gets no W005 for it", () => {
      const ctx = ctxWith(ALL);
      const html = '<div style="display:flex"><img src="a.png" alt="" width="40" style="box-shadow:0 1px #000"><p>x</p></div>';
      lintInput(styledFrom(html, ctx), ctx);
      expect(ctx.diagnostics.list().filter((d) => d.code === "W005")).toEqual([]);
    });
  });
});

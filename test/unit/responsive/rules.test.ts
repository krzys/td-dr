import { describe, expect, it } from "vitest";
import { tokenize } from "../../../src/responsive/diff.ts";
import { addClasses, buildHead, className, type Found } from "../../../src/responsive/rules.ts";
import { resetFor } from "../../../src/responsive/reset.ts";
import { variantsOf } from "../../../src/responsive/variants.ts";
import { DESKTOP } from "../../../src/style/types.ts";

const [wide, narrow, dark, hover] = variantsOf({ ranges: [{ min: 481, max: 600 }, { min: 0, max: 480 }], dark: true, hover: true });
const HTML = '<td class="mine" style="padding:24px">a</td><td>b</td><a href="#">c</a>';

describe("variants", () => {
  it("writes the media text, dropping min-width 0", () => {
    expect(wide!.media).toBe("@media screen and (min-width:481px) and (max-width:600px)");
    expect(narrow!.media).toBe("@media screen and (max-width:480px)");
    expect(dark!.media).toBe("@media (prefers-color-scheme: dark)");
    expect(hover!.media).toBeUndefined();
  });

  it("evaluates each width range at its widest viewport, dark and hover at the desktop width", () => {
    expect(narrow!.env).toEqual({ ...DESKTOP, viewport: 480 });
    expect(dark!.env).toEqual({ ...DESKTOP, dark: true });
    expect(hover!.env).toEqual({ ...DESKTOP, hover: true });
  });

  it("has none for plain css", () => {
    expect(variantsOf({ ranges: [], dark: false, hover: false })).toEqual([]);
  });
});

describe("className", () => {
  it("counts in base 36", () => {
    expect([0, 9, 10, 35, 36, 37].map(className)).toEqual(["t-0", "t-9", "t-a", "t-z", "t-10", "t-11"]);
  });
});

describe("addClasses", () => {
  const tags = tokenize(HTML);
  it("merges into an existing class attribute and adds one where there is none", () => {
    const out = addClasses(HTML, tags, new Map([[0, ["t-0"]], [4, ["t-1", "t-2"]]]));
    expect(out).toBe('<td class="mine t-0" style="padding:24px">a</td><td>b</td><a class="t-1 t-2" href="#">c</a>');
  });
});

describe("buildHead", () => {
  const found: Found[] = [
    { variant: wide!, overrides: [{ index: 0, decls: [["padding", "20px"]] }] },
    { variant: narrow!, overrides: [{ index: 0, decls: [["padding", "12px"]] }, { index: 2, decls: [["padding", "12px"]] }] },
    { variant: dark!, overrides: [{ index: 0, decls: [["background-color", "#111111"], ["color", "#eeeeee"]] }] },
    { variant: hover!, overrides: [{ index: 4, decls: [["color", "#00aa44"]] }] },
  ];
  const head = buildHead(HTML, tokenize(HTML), found)!;

  it("gives one class to each distinct (variant, declarations), numbered as the elements come", () => {
    expect(head.html).toBe('<td class="mine t-0 t-1 t-2" style="padding:24px">a</td><td class="t-1">b</td><a class="t-3" href="#">c</a>');
    expect(head.css).toContain(".t-0 { padding:20px !important; }");
    expect(head.css).toContain(".t-1 { padding:12px !important; }");
  });

  it("orders the rules: widths as given (widest first), then dark with its mirrors, then hover", () => {
    const at = (s: string) => head.css.indexOf(s);
    expect(at(":root")).toBe(0);
    expect(at("@media screen and (min-width:481px)")).toBeLessThan(at("@media screen and (max-width:480px)"));
    expect(at("@media screen and (max-width:480px)")).toBeLessThan(at("@media (prefers-color-scheme: dark)"));
    expect(at("@media (prefers-color-scheme: dark)")).toBeLessThan(at("[data-ogsc]"));
    expect(at("[data-ogsb]")).toBeLessThan(at(":hover"));
  });

  it("writes every declaration with a lowercase ` !important`", () => {
    const decls = head.css.match(/[a-z-]+:[^;{}]+;/g)!.filter((d) => !d.includes("light dark"));
    expect(decls.length).toBeGreaterThan(0);
    for (const d of decls) expect(d).toMatch(/ !important;$/);
  });

  it("mirrors dark colours for Outlook.com: colour on data-ogsc, background on data-ogsb", () => {
    expect(head.css).toContain("[data-ogsc] .t-2 { color:#eeeeee !important; }");
    expect(head.css).toContain("[data-ogsb] .t-2 { background-color:#111111 !important; }");
    expect(head.dark).toBe(true);
  });

  it("hover rules have no media query", () => {
    expect(head.css).toMatch(/^\.t-3:hover \{ color:#00aa44 !important; \}$/m);
  });

  it("is deterministic", () => {
    expect(buildHead(HTML, tokenize(HTML), found)).toEqual(head);
  });

  it("has no dark meta, :root or mirrors without dark rules", () => {
    const plain = buildHead(HTML, tokenize(HTML), [found[0]!])!;
    expect(plain.dark).toBe(false);
    expect(plain.css).not.toMatch(/:root|data-og/);
  });

  it("shares a class between elements with the same declarations in one variant", () => {
    const same = buildHead(HTML, tokenize(HTML), [{ variant: narrow!, overrides: [{ index: 0, decls: [["padding", "8px"]] }, { index: 2, decls: [["padding", "8px"]] }] }])!;
    expect(same.html.match(/class="[^"]*t-0/g)).toHaveLength(2);
    expect(same.css.match(/\.t-/g)).toHaveLength(1);
  });

  it("is nothing when no screen changes anything", () => {
    expect(buildHead(HTML, tokenize(HTML), [{ variant: narrow!, overrides: [] }])).toBeUndefined();
  });
});

describe("resetFor", () => {
  it("has initial values for plain properties and none for the rest", () => {
    expect(resetFor("td", "padding")).toBe("0");
    expect(resetFor("div", "max-height")).toBe("none");
    expect(resetFor("div", "overflow")).toBe("visible");
    expect(resetFor("td", "display")).toBe("table-cell");
    expect(resetFor("tr", "display")).toBe("table-row");
    expect(resetFor("p", "display")).toBe("block");
    expect(resetFor("a", "display")).toBe("inline");
    expect(resetFor("td", "text-align")).toBeUndefined();
    expect(resetFor("td", "vertical-align")).toBeUndefined();
  });
});

describe("declarations in the head", () => {
  it("never write a < that could close the style element", () => {
    const tags = tokenize(HTML);
    const head = buildHead(HTML, tags, [{ variant: narrow!, overrides: [{ index: 0, decls: [["background-image", "url('a.png?</style>')"]] }] }])!;
    expect(head.css).toContain("url('a.png?\\3c /style>') !important;");
    expect(head.css).not.toContain("</style");
  });
});

import { describe, expect, it } from "vitest";
import { compile } from "../../../src/index.ts";
import { layoutNotes, stackedElsewhere, stackNotes } from "../../../src/responsive/stack.ts";
import { elementKey } from "../../../src/style/computed.ts";
import { styledDocFrom } from "../../helpers/index.ts";
import { DESKTOP, type StyledElement, type Unstack } from "../../../src/style/types.ts";
import { computeStyles } from "../../../src/style/computed.ts";
import { testCtx } from "../../helpers/index.ts";
import { parse } from "../../../src/parse/html.ts";
import { sanitize } from "../../../src/sanitize/sanitize.ts";

const NARROW = { ...DESKTOP, viewport: 480 };
const stackedDoc = (html: string, env: typeof DESKTOP, map: ReadonlyMap<string, Unstack>): StyledElement => {
  const ctx = testCtx();
  return computeStyles(sanitize(parse(html, ctx), ctx), ctx, env, undefined, map).body;
};
const page = (css: string, body: string): string => `<style>.wrap{max-width:600px}${css}</style><div class="wrap">${body}</div>`;
const ROW = '<div class="row"><div class="col">a</div><div class="col">b</div></div>';
const bodiesOf = (html: string): StyledElement[] => [DESKTOP, NARROW].map((env) => styledDocFrom(html, undefined, env).body);
// the desktop body and the other screens', as stackedElsewhere and stackNotes take them
const apart = (bodies: readonly StyledElement[]): [StyledElement, StyledElement[]] => [bodies[0]!, bodies.slice(1)];
const find = (el: StyledElement, cls: string): StyledElement | undefined => {
  if (el.attrs["class"] === cls) return el;
  for (const c of el.children) if (c.type === "element") { const f = find(c, cls); if (f) return f; }
  return undefined;
};

describe("stackedElsewhere", () => {
  const base = ".row{display:flex;gap:16px} .col{flex:1}";

  it("finds a row that turns into a column", () => {
    const bodies = bodiesOf(page(`${base} @media (max-width:480px){.row{flex-direction:column}}`, ROW));
    const map = stackedElsewhere(...apart(bodies));
    const row = find(bodies[0]!, "row")!;
    expect([...map.keys()]).toEqual([elementKey(row.loc)]);
  });

  it("restores the row's layout where the screen stacks it, and only there", () => {
    const html = page(`${base} @media (max-width:480px){.row{flex-direction:column}}`, ROW);
    const bodies = bodiesOf(html);
    const map = stackedElsewhere(...apart(bodies));
    const narrow = stackedDoc(html, NARROW, map);
    const row = find(narrow, "row")!;
    expect(row.stacked).toBeTruthy();
    expect(row.style["flex-direction"]).toBeUndefined();
    expect(row.style["row-gap"]).toBe("16px");
    expect(find(stackedDoc(html, DESKTOP, map), "row")!.stacked).toBeUndefined();
  });

  it("finds display:block over display:flex, with no gap", () => {
    const html = page(`${base} @media (max-width:480px){.row{display:block}}`, ROW);
    const map = stackedElsewhere(...apart(bodiesOf(html)));
    expect(map.size).toBe(1);
    const row = find(stackedDoc(html, NARROW, map), "row")!;
    expect(row.stacked).toBeTruthy();
    expect(row.style["display"]).toBe("flex");
    expect(row.style["row-gap"]).toBe("0px");
  });

  it("finds a grid that gets a single track", () => {
    const map = stackedElsewhere(...apart(bodiesOf(page(".g{display:grid;grid-template-columns:1fr 1fr} @media (max-width:480px){.g{grid-template-columns:1fr}}", '<div class="g"><div>a</div><div>b</div></div>'))));
    expect(map.size).toBe(1);
  });

  it("finds the mobile-first form", () => {
    const html = page(".row{display:flex;flex-direction:column} @media (min-width:768px){.row{flex-direction:row}}", ROW);
    const bodies = [DESKTOP, { ...DESKTOP, viewport: 767 }].map((env) => styledDocFrom(html, undefined, env).body);
    expect(stackedElsewhere(...apart(bodies)).size).toBe(1);
  });

  it("leaves out rows that never stack, column-reverse, and wrapping rows", () => {
    expect(stackedElsewhere(...apart(bodiesOf(page(`${base} @media (max-width:480px){.row{padding:4px}}`, ROW)))).size).toBe(0);
    expect(stackedElsewhere(...apart(bodiesOf(page(`${base} @media (max-width:480px){.row{flex-direction:column-reverse}}`, ROW)))).size).toBe(0);
    expect(stackedElsewhere(...apart(bodiesOf(page(`${base} .row{flex-wrap:wrap} @media (max-width:480px){.row{flex-direction:column}}`, ROW)))).size).toBe(0);
  });

  it("leaves out a column in the base", () => {
    const bodies = bodiesOf(page(".row{display:flex;flex-direction:column} @media (max-width:480px){.row{flex-direction:row}}", ROW));
    expect(stackedElsewhere(...apart(bodies)).size).toBe(0);
  });
});

describe("layoutNotes", () => {
  it("names column-reverse", () => {
    const [base, narrow] = bodiesOf(page(".row{display:flex} @media (max-width:480px){.row{flex-direction:column-reverse}}", ROW));
    expect(layoutNotes(base!, narrow!).join()).toContain("column-reverse can't be stacked");
  });

  it("names a column that becomes a row", () => {
    const [base, narrow] = bodiesOf(page(".row{display:flex;flex-direction:column} @media (max-width:480px){.row{flex-direction:row}}", ROW));
    expect(layoutNotes(base!, narrow!).join()).toContain("a column in the base and a row here");
  });

  it("is silent when nothing changes", () => {
    const [base, narrow] = bodiesOf(page(".row{display:flex}", ROW));
    expect(layoutNotes(base!, narrow!)).toEqual([]);
  });
});

describe("a stacked row, compiled", () => {
  const css = ".row{display:flex;gap:16px} .col{flex:1} @media (max-width:480px){.row{flex-direction:column}}";
  const rule = (html: string, n: number): string => new RegExp(`\\.t-${n} \\{([^}]*)\\}`).exec(html)![1]!;

  it("makes each column a block, drops the side gutter and puts the gap above the later ones", () => {
    const out = compile(page(css, ROW), { lang: "en" });
    expect(out.diagnostics).toEqual([]);
    expect(rule(out.html, 0)).toContain("display:block");
    expect(rule(out.html, 0)).toContain("width:100%");
    expect(rule(out.html, 0)).toContain("padding:0");
    expect(rule(out.html, 1)).toContain("padding:16px 0 0 0");
  });

  it("keeps the desktop row in the inline styles", () => {
    const out = compile(page(css, ROW));
    expect(out.html).toMatch(/<td class="t-0" width="\d+" valign="top" style="width:50%;padding:0 8px 0 0;">/);
  });

  it("caps a column with its own px width and places it with align-items", () => {
    const out = compile(page(".row{display:flex;align-items:center} .pic{width:200px;display:block} .col{flex:1} @media (max-width:480px){.row{flex-direction:column}}", '<div class="row"><img class="pic" src="https://example.com/a.jpg" width="200" height="100" alt=""><div class="col">b</div></div>'));
    expect(out.html).toMatch(/max-width:200px !important/);
    expect(out.html).toMatch(/margin:0 auto 0 !important/);
  });

  it("hides the spacer cells of painted cards and puts the gap above as a margin", () => {
    const out = compile(page(".row{display:flex;gap:16px} .card{flex:1;padding:16px;background-color:#eeeeee} @media (max-width:480px){.row{flex-direction:column}}", '<div class="row"><div class="card">a</div><div class="card">b</div></div>'));
    expect(out.html).toContain("display:none !important");
    expect(out.html).toContain("margin:16px 0 0 !important");
    expect(out.html).not.toMatch(/padding:16px 0 0 0 !important/);
  });

  it("gives display:block no gap", () => {
    const out = compile(page(".row{display:flex;gap:16px} .col{flex:1} @media (max-width:480px){.row{display:block}}", ROW));
    expect(out.html).not.toMatch(/padding:16px 0 0 0 !important/);
    expect(out.html).toContain("display:block !important");
  });

  it("stacks a mobile-first row below the breakpoint", () => {
    const out = compile(page(".row{display:flex;flex-direction:column;gap:12px} .col{flex:1} @media (min-width:768px){.row{flex-direction:row}}", ROW), { lang: "en" });
    expect(out.diagnostics).toEqual([]);
    expect(out.html).toContain("@media screen and (max-width:767px)");
    expect(out.html).toContain("padding:12px 0 0 0");
  });

  it("is E017 for column-reverse, naming it", () => {
    const out = compile(page(".row{display:flex} @media (max-width:480px){.row{flex-direction:column-reverse}}", ROW), { strict: false });
    expect(out.diagnostics.find((d) => d.code === "E017")?.message).toContain("column-reverse can't be stacked");
    expect(out.html).not.toContain("@media");
  });

  it("is E017 for a column that becomes a row, naming it", () => {
    const out = compile(page(".row{display:flex;flex-direction:column} @media (max-width:480px){.row{flex-direction:row}}", ROW), { strict: false });
    expect(out.diagnostics.find((d) => d.code === "E017")?.message).toContain("a column in the base and a row here");
  });

  const IMG = '<img class="pic" src="https://example.com/a.jpg" width="200" height="100" alt="">';
  const stack = "@media (max-width:480px){.row{flex-direction:column}}";

  it("caps nothing for a flex-basis or a grid track", () => {
    const basis = compile(page(`.row{display:flex} .pic{flex:0 0 200px;display:block} .col{flex:1} ${stack}`, `<div class="row">${IMG}<div class="col">b</div></div>`));
    expect(basis.html).not.toContain("max-width:200px");
    const grid = compile(page(".g{display:grid;grid-template-columns:200px 1fr} @media (max-width:480px){.g{grid-template-columns:1fr}}", '<div class="g"><div>a</div><div>b</div></div>'));
    expect(grid.html).not.toContain("max-width:200px");
  });

  it("does not place a column in block layout", () => {
    const out = compile(page(".row{display:flex;align-items:center} .pic{width:200px;display:block} .col{flex:1} @media (max-width:480px){.row{display:block}}", `<div class="row">${IMG}<div class="col">b</div></div>`));
    expect(out.html).toContain("max-width:200px !important");
    expect(out.html).not.toContain("auto");
  });

  it("takes space-between's alignment back and fills the line", () => {
    const out = compile(page(`.row{display:flex;justify-content:space-between} ${stack}`, ROW));
    expect(out.html).toMatch(/\.t-1 \{[^}]*text-align:left/);
  });

  it("keeps item side margins and % widths", () => {
    const m = compile(page(`.row{display:flex} .col{flex:1;margin:0 8px} ${stack}`, ROW));
    expect(m.html).toMatch(/\.t-0 \{[^}]*box-sizing:border-box/);
    expect(m.html).not.toMatch(/padding:0 !important/);
    const pct = compile(page(`.row{display:flex} .col{width:50%} ${stack}`, ROW));
    expect(/\.t-0 \{([^}]*)\}/.exec(pct.html)![1]).not.toContain("width");
  });

  it("says what a stacked row can't place or undo (W003)", () => {
    const bodies = bodiesOf(page(`.row{display:flex;justify-content:center} ${stack}`, ROW));
    expect(stackNotes(...apart(bodies)).map((n) => n.message).join()).toContain("justify-content: center");
    const centered = bodiesOf(page(`.row{display:flex;align-items:center} .col{} ${stack}`, ROW));
    expect(stackNotes(...apart(centered)).length).toBeGreaterThan(0);
    const quiet = bodiesOf(page(`.row{display:flex;justify-content:space-between} ${stack}`, ROW));
    expect(stackNotes(...apart(quiet))).toEqual([]);
  });

  it("says what stacking drops: min-height, auto margins, inline children and collapsing margins in block flow", () => {
    const col = "@media (max-width:480px){.row{flex-direction:column}}";
    const block = "@media (max-width:480px){.row{display:block}}";
    const msgs = (css: string, body = ROW) => stackNotes(...apart(bodiesOf(page(css, body)))).map((n) => n.message).join(" | ");
    expect(msgs(`.row{display:flex} .col{flex:1;min-height:200px;background:#eee} ${col}`)).toContain("min-height");
    expect(msgs(`.row{display:flex} .col:last-child{margin-left:auto} ${col}`)).toContain("auto margin");
    expect(msgs(`.row{display:flex} ${block}`, '<div class="row"><span>a</span><span>b</span></div>')).toContain("inline");
    expect(msgs(`.row{display:flex} .col{margin:8px 0} ${block}`)).toContain("collapse");
    expect(msgs(`.row{display:flex} .col{margin:8px 0} ${col}`)).not.toContain("collapse");
  });

  it("leaves a row inside a wrapping row alone", () => {
    const html = page(".w{display:flex;flex-wrap:wrap} .row{display:flex} @media (max-width:480px){.row{flex-direction:column}}", `<div class="w"><div>${ROW}</div></div>`);
    expect(stackedElsewhere(...apart(bodiesOf(html))).size).toBe(0);
  });
});

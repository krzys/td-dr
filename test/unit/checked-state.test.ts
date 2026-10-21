import { describe, expect, test } from "vitest";
import { compile } from "../../src/index.ts";
import { styledDocFrom, testCtx } from "../helpers/index.ts";
import type { StyledElement } from "../../src/style/types.ts";

const all = (n: StyledElement): StyledElement[] => [n, ...n.children.flatMap((c) => (c.type === "element" ? all(c) : []))];

const TABS_CSS =
  ".tabs input{display:none} .panel{display:none} #a:checked~.pa,#b:checked~.pb,#c:checked~.pc{display:block} #a:checked~label[for=a]{color:#c00}";
const tabs = (extra = "") =>
  `<style>${TABS_CSS}</style><div class="tabs"><input type="radio" name="t" id="a" checked><input type="radio" name="t" id="b"><input type="radio" name="t" id="c">` +
  `<label for="a">One</label><label for="b">Two</label><label for="c">Three</label>${extra}<div class="panel pa">A</div><div class="panel pb">B</div><div class="panel pc">C</div></div>`;

const run = (html: string) => {
  const ctx = testCtx();
  const body = styledDocFrom(html, ctx).body;
  const w001 = ctx.diagnostics.list().filter((d) => d.code === "W001");
  const display = (pred: (e: StyledElement) => boolean) => all(body).filter(pred).map((e) => e.style["display"] ?? "inline");
  return { w001, display };
};

describe(":checked tabs collapse to the initial state", () => {
  test("one W001 counts the panels only another state shows", () => {
    const { w001, display } = run(tabs());
    expect(w001).toHaveLength(1);
    expect(w001[0]).toMatchObject({ message: "Interactive :checked rules collapse to the initial state; 2 blocks and 3 labels dropped", loc: { line: 1 } });
    expect(w001[0]!.hint).toMatch(/labels/);
    expect(display((e) => e.attrs["class"]?.startsWith("panel") ?? false)).toEqual(["block", "none", "none"]);
  });

  test("labels for the hidden radios are hidden too, other labels stay", () => {
    const { display } = run(tabs('<label for="elsewhere">Kept</label>'));
    expect(display((e) => e.tag === "label")).toEqual(["none", "none", "none", "inline"]);
  });

  test("the compile drops the labels and the other panels with I002", () => {
    const { html, diagnostics } = compile(tabs());
    expect(html).not.toMatch(/<label/);
    expect(html).toContain(">A<");
    expect(html).not.toMatch(/>[BC]</);
    expect(diagnostics.filter((d) => d.code === "I002").map((d) => [d.message, d.locs?.length])).toEqual([
      ["Hidden <input> dropped (3 places)", 3],
      ["Hidden <label> dropped (3 places)", 3],
      ["Hidden <div> dropped (2 places)", 2],
    ]);
  });

  test("an accordion's label holding a heading stays; only the answer is dropped", () => {
    const css = ".ans{display:none} #q:checked~.ans{display:block}";
    const { w001, display } = run(`<style>${css}</style><input type="checkbox" id="q" style="display:none"><label for="q"><h3>Refunds?</h3></label><div class="ans">30 days.</div>`);
    expect(w001.map((d) => d.message)).toEqual(["Interactive :checked rules collapse to the initial state; 1 block dropped"]);
    expect(display((e) => e.tag === "label")).toEqual(["inline"]);
  });

  test("a style-only :checked rule still warns, with no count when nothing is dropped", () => {
    const { w001 } = run('<style>input:checked+span{text-decoration:line-through}</style><input type="checkbox" id="x"><span>Milk</span>');
    expect(w001.map((d) => d.message)).toEqual(["Interactive :checked rules collapse to the initial state"]);
  });

  test("silent when no :checked rule could land; labels of plain hidden inputs stay", () => {
    const { w001, display } = run('<style>#z:checked~p{display:block} input{display:none}</style><input type="checkbox" id="x"><label for="x">L</label><p>t</p>');
    expect(w001).toEqual([]);
    expect(display((e) => e.tag === "label")).toEqual(["inline"]);
  });
});

import { serialize } from "parse5";
import { adapter } from "parse5-htmlparser2-tree-adapter";
import { describe, expect, test } from "vitest";
import { analyze } from "../../src/analyze/analyze.ts";
import { findElement } from "../../src/parse/dom.ts";
import { parse, type ParsedDoc } from "../../src/parse/html.ts";
import { sanitize } from "../../src/sanitize/sanitize.ts";
import { cascade } from "../../src/style/cascade.ts";
import { computeStyles } from "../../src/style/computed.ts";
import { materialize, type CascadedElement } from "../../src/style/materialize.ts";
import { DESKTOP, type Env, type StyledDoc } from "../../src/style/types.ts";
import { testCtx } from "../helpers/index.ts";

const INPUT = `<html dir="ltr"><head><style>
  @property --gap { syntax: "<length>"; inherits: false; initial-value: 4px; }
  .price::before { content: "$"; color: #6b7280; padding-inline-start: 2px; }
  .price::after { content: " / month"; font-size: 12px; }
  .tag::before { content: "New"; display: block; color: #b91c1c; }
  .row { display: flex; } .row > div { width: 50%; }
  .x:hover { color: red; }
  @media (max-width: 480px) { .row { display: block; } h1 { font-size: 5vw; } .tag::before { content: "Hot"; } }
  @media (prefers-color-scheme: dark) { body { background: #000; color: #fff; } }
</style></head><body>
  <!--[if mso]><p>mso</p><![endif]-->
  <h1 class="x">Title</h1>
  <p class="price" style="margin: 0 0 1em">49</p>
  <div class="tag">Tagged</div>
  <div class="row"><div>a</div><div>b</div></div>
  <span data-email="preheader">Preview</span>
  <a href="javascript:alert(1)" onclick="x()">link</a>
</body></html>`;

const ENVS: Env[] = [DESKTOP, { viewport: 375, dark: false, hover: false }, { viewport: Infinity, dark: true, hover: false }, { viewport: Infinity, dark: false, hover: true }];

const html = (doc: ParsedDoc): string => serialize(doc.document, { treeAdapter: adapter });
const plain = (d: StyledDoc): unknown => JSON.parse(JSON.stringify(d, (_k, v: unknown) => (v instanceof Set ? [...v] : v)));

const deepFreeze = <T>(o: T): T => {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
};

// every object reachable from `o`, Sets included
const objectsOf = (o: unknown, out = new Set<object>()): Set<object> => {
  if (!o || typeof o !== "object" || out.has(o)) return out;
  out.add(o);
  for (const v of o instanceof Set ? [...o] : Object.values(o)) objectsOf(v, out);
  return out;
};

describe("style stage leaves its input alone", () => {
  test("sanitize does not change the parsed document", () => {
    const ctx = testCtx();
    const parsed = parse(INPUT, ctx);
    const before = { dom: html(parsed), styles: JSON.stringify(parsed.styles), meta: JSON.stringify(parsed.meta) };
    const clean = sanitize(parsed, ctx);
    expect({ dom: html(parsed), styles: JSON.stringify(parsed.styles), meta: JSON.stringify(parsed.meta) }).toEqual(before);
    expect(clean.document).not.toBe(parsed.document);
    expect(html(clean)).not.toContain("onclick");
  });

  test("computeStyles does not change the document, in any environment", () => {
    const ctx = testCtx();
    const doc = sanitize(parse(INPUT, ctx), ctx);
    const before = html(doc);
    for (const env of ENVS) computeStyles(doc, testCtx(), env);
    expect(html(doc)).toBe(before);
    expect(serialize(doc.body, { treeAdapter: adapter })).not.toContain("month");
  });

  test("one doc cascaded for several environments gives what fresh parses give", () => {
    const shared = (() => {
      const ctx = testCtx();
      return sanitize(parse(INPUT, ctx), ctx);
    })();
    for (const env of [...ENVS, ...ENVS]) {
      const reused = testCtx();
      const got = computeStyles(shared, reused, env);
      const fresh = testCtx();
      const want = computeStyles(sanitize(parse(INPUT, testCtx()), testCtx()), fresh, env);
      expect(plain(got)).toEqual(plain(want));
      expect(reused.diagnostics.list()).toEqual(fresh.diagnostics.list());
    }
  });

  test("styled docs share no objects with each other or with the DOM", () => {
    const ctx = testCtx();
    const doc = sanitize(parse(INPUT, ctx), ctx);
    const a = objectsOf(computeStyles(doc, ctx));
    const b = objectsOf(computeStyles(doc, ctx));
    expect([...a].filter((o) => b.has(o))).toEqual([]);
    const p = findElement(doc.body, (e) => e.attribs["class"] === "price")!;
    expect(a.has(p.attribs)).toBe(false);
  });

  test("analyze runs on a frozen styled tree", () => {
    const ctx = testCtx();
    const doc = sanitize(parse(INPUT, ctx), ctx);
    const styled = deepFreeze(computeStyles(doc, ctx));
    expect(() => analyze(styled.body, ctx)).not.toThrow();
  });
});

describe("materialize", () => {
  const tree = (input: string): { root: CascadedElement; before: string; after: string } => {
    const ctx = testCtx();
    const doc = parse(input, ctx);
    const before = html(doc);
    const root = materialize(doc.body, cascade(doc, ctx, DESKTOP));
    return { root, before, after: html(doc) };
  };
  const elements = (n: CascadedElement): CascadedElement[] => n.children.filter((c): c is CascadedElement => c.type === "element");

  test("::before and ::after become new first and last children", () => {
    const { root, before, after } = tree('<style>p::before{content:"a";color:red} p::after{content:"z"}</style><p>m<b>n</b></p>');
    expect(after).toBe(before);
    const p = elements(root)[0]!;
    expect(p.children.map((c) => (c.type === "element" ? `<${c.tag}>` : c.type === "text" ? c.text : ""))).toEqual(["<span>", "m", "<b>", "<span>"]);
    const [b, , z] = elements(p);
    expect(b!.children).toEqual([{ type: "text", text: "a" }]);
    expect(b!.cascaded.values["color"]).toBe("red");
    expect(b!.cascaded.values["content"]).toBeUndefined();
    expect(z!.children).toEqual([{ type: "text", text: "z" }]);
    expect(b!.loc).toEqual(p.loc);
    expect(b!.attrs).toEqual({});
  });

  test("a block pseudo-element in a flow host is a div", () => {
    const { root } = tree('<style>div::before{content:"x";display:block}</style><div>y</div>');
    expect(elements(elements(root)[0]!)[0]!.tag).toBe("div");
  });

  test("a pseudo-element takes its host's direction for flow-relative props", () => {
    const { root } = tree('<style>p::before{content:"x";padding-inline-start:3px}</style><p dir="rtl">y</p>');
    expect(elements(elements(root)[0]!)[0]!.cascaded.values["padding-right"]).toBe("3px");
  });

  test("selectors are matched before pseudo-elements exist, however often the doc is cascaded", () => {
    const ctx = testCtx();
    const doc = parse('<style>p::before{content:"x"} span{color:red}</style><p>y</p>', ctx);
    for (let i = 0; i < 3; i++) {
      const p = elements(materialize(doc.body, cascade(doc, ctx, DESKTOP)))[0]!;
      expect(elements(p)).toHaveLength(1);
      expect(elements(p)[0]!.cascaded.values["color"]).toBeUndefined();
    }
  });
});

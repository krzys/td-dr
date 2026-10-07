import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as T from "../../../adapters/template/index.ts";
import { createEmailServer, findEmails, renderEmail, type EmailEntry } from "../../../adapters/vite/index.ts";
import { loadEmail, templateMarkup } from "../../../adapters/vite/render.ts";
import { FIELD_CLOSE, FIELD_OPEN } from "../../../src/template/tokens.ts";

const repo = resolve(import.meta.dirname, "../../..");

// Reading a property off a branch value gives a branch of the arms' properties; anything else
// done to one is a TemplateError. Filled by the real engines, compared with the html render.
const EMAILS: Record<string, string> = {
  "cfg.jsx": `
export default function Cfg({ order }) {
  let cfg = { color: "gray", label: "Due" };
  if (order.paid) cfg = { color: "green", label: "Paid" };
  return <p className={cfg.color}>{cfg.label}</p>;
}`,
  "fields.jsx": `
export default function Fields({ order }) {
  const cfg = order.paid ? { who: order.payer, tone: "ok", n: { deep: order.receipt } } : { who: order.owner, tone: "ok", n: { deep: "none" } };
  return <p className={cfg.tone}>{cfg.who} {cfg.n.deep}</p>;
}`,
  "Vcfg.vue": `
<script>
export const template = ["handlebars", "liquid"];
</script>
<script setup>
defineProps({ order: Object });
</script>
<template>
  <p>{{ (order.paid ? { label: "Paid", who: order.payer } : { label: "Due", who: order.owner }).label }} / {{ (order.paid ? { who: order.payer } : { who: order.owner }).who }}</p>
</template>`,
  "tone.jsx": `
export default function Tone({ order }) {
  let tone = "ok";
  if (order.paid) tone = "ok";
  return <p>{tone.toUpperCase()}</p>;
}`,
  "chain.jsx": `
export default function Chain({ order }) {
  const cfg = order.paid ? (order.vip ? { c: "gold" } : { c: "green" }) : { c: "gray" };
  return <p className={cfg.c}>x</p>;
}`,
  "arrs.jsx": `
export default function Arrs({ order }) {
  const cfg = order.paid ? { items: ["a", "b"] } : { items: ["c"] };
  return <p>{cfg.items[0]} {cfg.items.length}</p>;
}`,
  "badge.jsx": `
function Badge({ cfg }) {
  return <b className={cfg.color}>{cfg.label}</b>;
}
export default function Page({ order }) {
  const cfg = order.paid ? { color: "green", label: "Paid" } : { color: "gray", label: "Due" };
  return <p><Badge cfg={cfg} /></p>;
}`,
  "Vcomputed.vue": `
<script>
export const template = ["handlebars", "liquid"];
</script>
<script setup>
import { computed } from "vue";
const props = defineProps({ order: Object });
const cfg = computed(() => (props.order.paid ? { label: "Paid", color: "green" } : { label: "Due", color: "gray" }));
</script>
<template>
  <p>{{ cfg.label }} {{ cfg.color }}</p>
</template>`,
  "Vref.vue": `
<script>
export const template = ["handlebars", "liquid"];
</script>
<script setup>
import { reactive, ref } from "vue";
const props = defineProps({ order: Object });
const cfg = ref(props.order.paid ? { label: "Paid" } : { label: "Due" });
const box = reactive({ tone: props.order.paid ? { color: "green" } : { color: "gray" } });
</script>
<template>
  <p>{{ cfg.label }} {{ box.tone.color }}</p>
</template>`,
  "Vdata.vue": `
<script>
export const template = ["handlebars", "liquid"];
export default {
  props: { order: Object },
  data() {
    return { cfg: this.order.paid ? { label: "Paid" } : { label: "Due" } };
  },
};
</script>
<template>
  <p>{{ cfg.label }}</p>
</template>`,
  "truth.jsx": `
export default function Truth({ order }) {
  let cfg = { show: true };
  if (order.paid) cfg = { show: false };
  return <p>{cfg.show ? "S" : "H"}{cfg.show && <b>B</b>}</p>;
}`,
  "Vtruth.vue": `
<script>
export const template = ["handlebars", "liquid"];
</script>
<script setup>
import { computed } from "vue";
const props = defineProps({ order: Object });
const cfg = computed(() => (props.order.paid ? { show: false } : { show: true }));
</script>
<template>
  <div><p v-if="cfg.show">S</p><p v-else>H</p></div>
</template>`,
  "fieldarm.jsx": `
export default function FieldArm({ order }) {
  const cfg = order.paid ? { who: order.payer } : { who: "" };
  return <p>{cfg.who ? "Y" : "N"} {cfg.who ? <i>{cfg.who}</i> : "none"} {cfg.who && "&"}</p>;
}`,
  "dollar.jsx": `
export default function Dollar({ order }) {
  const cfg = order.paid ? { $label: "A", constructor: "X" } : { $label: "B", constructor: "Y" };
  return <p>{cfg.$label}{cfg.constructor}</p>;
}`,
  "consttruth.jsx": `
export default function ConstTruth({ order }) {
  let label = "Due";
  if (order.paid) label = "Paid";
  const cfg = order.paid ? { label: "Paid" } : { label: "Due" };
  return <p>{label.length ? <b>x</b> : "none"} {cfg.label && <i>y</i>} {cfg.label || "z"}</p>;
}`,
  "nullarm.jsx": `
export default function NullArm({ order }) {
  let cfg = null;
  if (order.paid) cfg = { color: "green" };
  return <p className={cfg?.color}>x {cfg?.color ? "c" : "n"}</p>;
}`,
  "nestedarm.jsx": `
export default function NestedArm({ order }) {
  let cfg = { c: "gray" };
  if (order.paid) cfg = { c: order.vip ? "gold" : "green" };
  return <p className={cfg.c}>x</p>;
}`,
  "e-vtagconst.vue": `
<script setup>
import { defineComponent, h } from "vue";
const props = defineProps({ order: Object });
const A = defineComponent(() => () => h("b", "a"));
const B = defineComponent(() => () => h("i", "b"));
const Tag = props.order.paid ? A : B;
</script>
<template><div><Tag /></div></template>`,
  "e-vtagslot.vue": `
<script setup>
import { defineComponent, h } from "vue";
const props = defineProps({ order: Object });
const A = defineComponent(() => () => h("b", "a"));
const B = defineComponent(() => () => h("i", "b"));
const Box = defineComponent((_, { slots }) => () => h("section", slots.default?.()));
const Tag = props.order.paid ? A : B;
</script>
<template><Box><Tag /></Box></template>`,
  "e-vtagblock.vue": `
<script setup>
import { defineComponent, h } from "vue";
const props = defineProps({ order: Object });
const show = true;
const A = defineComponent(() => () => h("b", "a"));
const B = defineComponent(() => () => h("i", "b"));
const Box = defineComponent((_, { slots }) => () => h("section", slots.default?.()));
const Tag = props.order.paid ? A : B;
</script>
<template><Box><Tag v-if="show" /></Box></template>`,
  "e-vtagfor.vue": `
<script setup>
import { defineComponent, h } from "vue";
const props = defineProps({ order: Object });
const A = defineComponent(() => () => h("b", "a"));
const B = defineComponent(() => () => h("i", "b"));
const Box = defineComponent((_, { slots }) => () => h("section", slots.default?.()));
const Tag = props.order.paid ? A : B;
</script>
<template><Box><Tag v-for="i in [1, 2]" :key="i" /></Box></template>`,
  "e-vtagh.vue": `
<script>
import { defineComponent, h } from "vue";
const A = defineComponent(() => () => h("b", "a"));
const B = defineComponent(() => () => h("i", "b"));
export default defineComponent({
  props: { order: Object },
  setup(props) {
    const Tag = props.order.paid ? A : B;
    return () => h("div", [h(Tag)]);
  },
});
</script>`,
  "e-tagstr.jsx": `
export default function TagStr({ order }) {
  let Tag = "p";
  if (order.paid) Tag = "b";
  return <div><Tag>x</Tag></div>;
}`,
  "e-join.jsx": `
export default function Join({ order }) {
  let list = ["a", "b"];
  if (order.paid) list = ["c", "d"];
  return <p>{list.join(",")}</p>;
}`,
  "e-fields.jsx": `
export default function EFields({ order }) {
  const who = order.paid ? order.payer : order.owner;
  return <p>{who.toUpperCase()}</p>;
}`,
  "e-fields2.jsx": `
export default function EFields2({ order }) {
  let name = order.payer;
  if (order.gift) name = order.recipient;
  return <p>{name.trim()}</p>;
}`,
  "e-vtag.vue": `
<script setup>
import { defineComponent, h } from "vue";
defineProps({ order: Object });
const A = defineComponent(() => () => h("b", "a"));
const B = defineComponent(() => () => h("i", "b"));
</script>
<template><div><component :is="order.paid ? A : B" /></div></template>`,
  "e-in.jsx": `
export default function EIn({ order }) {
  let cfg = { color: "gray" };
  if (order.paid) cfg = { color: "green" };
  return <p>{"discount" in cfg ? "d" : "n"}</p>;
}`,
  "e-hasown.jsx": `
export default function EHasOwn({ order }) {
  let cfg = { color: "gray" };
  if (order.paid) cfg = { color: "green" };
  return <p>{Object.hasOwn(cfg, "discount") ? "d" : "n"}</p>;
}`,
  "e-call.jsx": `
const a = (n) => "A" + n;
const b = (n) => "B" + n;
export default function ECall({ order }) {
  const fmt = order.paid ? a : b;
  return <p>{fmt(order.total)}</p>;
}`,
  "e-vmap.vue": `
<script setup>
defineProps({ order: Object });
</script>
<template><ul><li v-for="i in (order.paid ? order.a : order.b).map((x) => x)">{{ i }}</li></ul></template>`,
  "e-map.jsx": `
export default function EMap({ order }) {
  let items = order.items;
  if (order.paid) items = [];
  return <ul>{items.map((i) => <li key={i}>{i.name}</li>)}</ul>;
}`,
  "e-string.jsx": `
export default function EString({ order }) {
  let label = "Due";
  if (order.paid) label = "Paid";
  return <p>{label.toUpperCase()}</p>;
}`,
  "e-number.jsx": `
export default function ENumber({ order }) {
  let n = 1;
  if (order.paid) n = 2;
  return <p>{n * 2}</p>;
}`,
  "e-iterate.jsx": `
export default function EIterate({ order }) {
  let items = ["a"];
  if (order.paid) items = ["b"];
  return <p>{[...items]}</p>;
}`,
  "e-json.jsx": `
export default function EJson({ order }) {
  let cfg = { a: 1 };
  if (order.paid) cfg = { a: 2 };
  return <p>{JSON.stringify(cfg)}</p>;
}`,
  "e-tag.jsx": `
const A = () => <b>a</b>;
const B = () => <i>b</i>;
export default function ETag({ order }) {
  const Tag = order.paid ? A : B;
  return <Tag />;
}`,
};
const dialects = ["handlebars", "liquid"] as const;
const order = { payer: "Pat", owner: "Olly", receipt: "R-1", items: [{ name: "Tea" }], total: "9" };
const DATA: Array<[string, Record<string, object>]> = [
  ["unpaid", { order: { ...order, paid: false, vip: false } }],
  ["paid", { order: { ...order, paid: true, vip: false } }],
  ["paid vip", { order: { ...order, paid: true, vip: true } }],
  ["unpaid vip", { order: { ...order, paid: false, vip: true } }],
];

let dir: string;
let vite: ViteDevServer;
let emails: EmailEntry[];
beforeAll(async () => {
  mkdirSync(join(repo, "test/.tmp"), { recursive: true });
  dir = mkdtempSync(join(repo, "test/.tmp/branch-values-"));
  for (const [f, src] of Object.entries(EMAILS)) writeFileSync(join(dir, f), src.trimStart() + (f.startsWith("e-") || f.endsWith(".vue") ? "" : '\nexport const template = ["handlebars", "liquid"];\n'));
  vite = await createEmailServer({ root: dir });
  emails = findEmails(dir);
});
afterAll(async () => {
  await vite.close();
  rmSync(dir, { recursive: true, force: true });
});

const email = (name: string) => emails.find((e) => e.name === name)!;
const readable = (s: string) => s.replaceAll(FIELD_OPEN, "{{").replaceAll(FIELD_CLOSE, "}}").replaceAll("&#x27;", "'");
const template = async (name: string) => readable(await templateMarkup(email(name), (await loadEmail(vite, email(name))).component));
const failure = async (name: string): Promise<string> => (await template(name).then(() => "did not throw", (e: Error) => e.message)) as string;
const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("property access on a branch value", () => {
  it("a let assigned in a branch: each property is its own branch", async () => {
    const t = await template("cfg");
    expect(t).toContain('<tddr-if test="order.paid"><p class="green">');
    expect(t).toContain('<tddr-else><p class="gray">');
    expect(t).toContain('<tddr-if test="order.paid">Paid</tddr-if><tddr-else>Due</tddr-else>');
  });
  it("a field inside an arm stays a field, nested properties recurse", async () => {
    const t = await template("fields");
    expect(t).toContain('class="ok"');
    expect(t).toContain('<tddr-if test="order.paid">{{order.payer}}</tddr-if>');
    expect(t).toContain("{{order.owner}}");
    expect(t).toContain("{{order.receipt}}");
  });
  it("Vue: a property of a ternary object", async () => {
    const t = await template("Vcfg");
    expect(t).toContain('<tddr-if test="order.paid">Paid</tddr-if><tddr-else>Due</tddr-else>');
    expect(t).toContain("{{order.payer}}");
  });
});

const names = ["cfg", "fields", "Vcfg", "tone", "chain", "arrs", "badge", "Vcomputed", "Vref", "Vdata", "truth", "Vtruth", "fieldarm", "dollar", "consttruth", "nullarm", "nestedarm"];
const cases = names.flatMap((n) => DATA.flatMap(([set, data]) => dialects.map((d) => [`${n} [${d}, ${set}]`, n, data, d] as const)));
describe("more shapes", () => {
  it("equal arms with no property read are the plain value", async () => {
    const t = await template("tone");
    expect(t).not.toContain("tddr-if");
    expect(t).toContain("OK");
  });
  it("a nested chain reads as one if / else-if / else", async () => {
    const t = await template("chain");
    expect(t).toContain('class="gold"');
    expect(t).toContain('class="green"');
    expect(t).toContain('class="gray"');
  });
  it("a property's truthiness comes from its own arms", async () => {
    const t = await template("truth");
    expect(t).toContain('<tddr-if test="!order.paid">S</tddr-if>');
    expect(t).not.toContain("order.paid || !order.paid");
  });
  it("a $-prefixed and a constructor key that every arm has are read", async () => {
    const t = await template("dollar");
    expect(t).toContain('<tddr-if test="order.paid">A</tddr-if><tddr-else>B</tddr-else>');
    expect(t).toContain('<tddr-if test="order.paid">X</tddr-if><tddr-else>Y</tddr-else>');
  });
  it("arrays: index and length", async () => {
    const t = await template("arrs");
    expect(t).toMatch(/tddr-if test="order\.paid">a<\/tddr-if><tddr-else>c/);
    expect(t).toMatch(/tddr-if test="order\.paid">2<\/tddr-if><tddr-else>1/);
  });
  it("a child component reads a property of a branch prop", async () => {
    expect(await template("badge")).toContain('<tddr-if test="order.paid">Paid</tddr-if><tddr-else>Due</tddr-else>');
  });
  it("Vue: ref, reactive and data() don't wrap a branch", async () => {
    const t = await template("Vref");
    expect(t).toContain('<tddr-if test="order.paid">Paid</tddr-if><tddr-else>Due</tddr-else>');
    expect(t).toContain('<tddr-if test="order.paid">green</tddr-if><tddr-else>gray</tddr-else>');
    expect(await template("Vdata")).toContain('<tddr-if test="order.paid">Paid</tddr-if><tddr-else>Due</tddr-else>');
  });
  it("a property that tests the same in every arm is no condition", async () => {
    const t = await template("consttruth");
    expect(t).toContain("<b>x</b> <i>y</i> ");
    expect(t).not.toContain("||");
    expect(t).not.toContain("none");
  });
  it("a nullish arm reads as undefined", async () => {
    const t = await template("nullarm");
    expect(t).toContain('<tddr-if test="order.paid"><p class="green">');
  });
  it("a branch inside an arm is one chain", async () => {
    const t = await template("nestedarm");
    for (const c of ["gold", "green", "gray"]) expect(t).toContain(`class="${c}"`);
  });
  it("Vue: a computed object in the template", async () => {
    expect(await template("Vcomputed")).toContain('<tddr-if test="order.paid">Paid</tddr-if><tddr-else>Due</tddr-else>');
  });
});

describe("the real engines fill it like the html render", () => {
  it.each(cases)("%s", async (_, name, data, dialect) => {
    const filled = await renderEmail(vite, email(name), { data, mode: dialect });
    const plain = await renderEmail(vite, email(name), { data, mode: "html" });
    expect(filled.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(filled.filled).toBe("engine");
    expect(text(filled.html)).toBe(text(plain.html));
    for (const c of ["green", "gray", "gold"]) expect(filled.html.includes(`class="${c}"`)).toBe(plain.html.includes(`class="${c}"`));
  });
});

describe("anything else on a branch value is a TemplateError", () => {
  const AT = (f: string) => new RegExp(`\\n {4}at .*/${f}:\\d+:\\d+$`);
  it("a method on a branch of two fields", async () => {
    const m = await failure("e-fields");
    expect(m).toMatch(/a value that depends on order\.paid: has \.toUpperCase\(\) called on it.*\nHint: .*\n {4}at .*e-fields\.jsx/s);
    expect(m).not.toContain("TypeError");
  });
  it("a method on a let assigned a field in a branch", async () => {
    const m = await failure("e-fields2");
    expect(m).toMatch(/a value that depends on order\.gift: has \.trim\(\) called on it/);
    expect(m).not.toContain("TypeError");
  });
  it("Vue: <component :is> with a branch", async () => {
    const m = await failure("e-vtag");
    expect(m).toMatch(/a value that depends on order\.paid: is used as an element type.*\nHint: /s);
    expect(m).toMatch(AT("e-vtag.vue"));
    expect(m).not.toContain("setup()");
  });
  it("Vue: a script-setup const used as a tag", async () => {
    const m = await failure("e-vtagconst");
    expect(m).toMatch(/a value that depends on order\.paid: is used as an element type.*\nHint: /s);
    expect(m).toMatch(AT("e-vtagconst.vue"));
    expect(m).not.toContain("setup()");
  });
  it("Vue: <Tag/> inside a render-function component's slot", async () => {
    const m = await failure("e-vtagslot");
    expect(m).toMatch(/a value that depends on order\.paid: is used as an element type.*\nHint: /s);
    expect(m).toMatch(AT("e-vtagslot.vue"));
    expect(m).not.toContain("setup()");
  });
  it("Vue: <Tag v-if/> inside a render-function component's slot", async () => {
    const m = await failure("e-vtagblock");
    expect(m).toMatch(/a value that depends on order\.paid: is used as an element type.*\nHint: /s);
    expect(m).toMatch(AT("e-vtagblock.vue"));
    expect(m).not.toContain("setup()");
  });
  it("Vue: <Tag v-for/> inside a render-function component's slot", async () => {
    const m = await failure("e-vtagfor");
    expect(m).toMatch(/a value that depends on order\.paid: is used as an element type.*\nHint: /s);
    expect(m).toMatch(AT("e-vtagfor.vue"));
    expect(m).not.toContain("setup()");
  });
  it("Vue: h(Tag) in a render function", async () => {
    const m = await failure("e-vtagh");
    expect(m).toMatch(/a value that depends on order\.paid: is used as an element type.*\nHint: /s);
    expect(m).toMatch(AT("e-vtagh.vue"));
    expect(m).not.toContain("setup()");
  });
  it("a method call (.map)", async () => {
    const m = await failure("e-map");
    expect(m).toMatch(/a value that depends on order\.paid: has \.map\(\) called on it/);
    expect(m).toContain("Hint: branch in the markup instead: cond ? <A/> : <B/>");
    expect(m).toMatch(AT("e-map.jsx"));
  });
  it("Vue: a method call", async () => {
    expect(await failure("e-vmap")).toMatch(/a value that depends on order\.paid: has \.map\(\) called on it.*\nHint: branch in the markup instead.*\n {4}at .*e-vmap\.vue/s);
  });
  it("a string method", async () => {
    expect(await failure("e-string")).toMatch(/a value that depends on order\.paid: has \.toUpperCase\(\) called on it.*\nHint: .*\n {4}at .*e-string\.jsx/s);
  });
  it("arithmetic", async () => {
    expect(await failure("e-number")).toMatch(/a value that depends on order\.paid: is used as a number.*\nHint: .*\n {4}at .*e-number\.jsx/s);
  });
  it("iteration", async () => {
    expect(await failure("e-iterate")).toMatch(/a value that depends on order\.paid: is iterated.*\nHint: .*\n {4}at .*e-iterate\.jsx/s);
  });
  it("JSON", async () => {
    expect(await failure("e-json")).toMatch(/a value that depends on order\.paid: is spread, serialized \(JSON\).*\nHint: .*\n {4}at .*e-json\.jsx:\d+:\d+$/s);
  });
  it("`in` on a branch", async () => {
    expect(await failure("e-in")).toMatch(/a value that depends on order\.paid: is tested for a key \(in \/ hasOwn\).*\nHint: .*\n {4}at .*e-in\.jsx:\d+:\d+$/s);
  });
  it("Object.hasOwn on a branch", async () => {
    expect(await failure("e-hasown")).toMatch(/a value that depends on order\.paid: is tested for a key \(in \/ hasOwn\).*\nHint: .*\n {4}at .*e-hasown\.jsx:\d+:\d+$/s);
  });
  it("calling a branch of functions is not a TypeError", async () => {
    const m = await failure("e-call");
    expect(m).toMatch(/a value that depends on order\.paid: is called as a function.*\nHint: /s);
    expect(m).toMatch(AT("e-call.jsx"));
    expect(m).not.toContain("TypeError");
  });
  it(".join on a branch-assigned array", async () => {
    expect(await failure("e-join")).toMatch(/a value that depends on order\.paid: has \.join\(\) called on it.*\nHint: branch in the markup instead.*\n {4}at .*e-join\.jsx/s);
  });
  it("a string element type from a branch-assigned let", async () => {
    expect(await failure("e-tagstr")).toMatch(/a value that depends on order\.paid: is used as an element type.*\nHint: .*\n {4}at .*e-tagstr\.jsx:\d+:\d+$/s);
  });
  it("an element type", async () => {
    expect(await failure("e-tag")).toMatch(/a value that depends on order\.paid: is used as an element type.*\nHint: branch in the markup instead: cond \? <A\/> : <B\/>.*\n {4}at .*e-tag\.jsx:\d+:\d+$/s);
  });
});

describe("a key the branch's arms own, named like an internal probe", () => {
  const r = { roots: new Set<string>(), aliases: new Set<string>(), reserved: new Set<string>() };
  const p = T.rootProps(r).props as Record<string, any>;
  const cfg = T.cond(p.order.paid, () => ({ $label: "A" }), () => ({ $label: "B" })) as Record<string, unknown>;

  it("is read, so `in` must not claim it is missing", () => {
    expect(T.isBranch(cfg.$label)).toBe(true);
    expect(() => "$label" in cfg).toThrow(/in \/ hasOwn/);
    expect(() => Object.hasOwn(cfg, "$label")).toThrow(/in \/ hasOwn/);
  });

  it("is absent when no arm has it", () => {
    expect("$other" in cfg).toBe(false);
    expect(Object.hasOwn(cfg, "$other")).toBe(false);
  });
});

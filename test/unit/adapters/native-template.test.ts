import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createEmailServer, findEmails, renderEmail, type EmailEntry } from "../../../adapters/vite/index.ts";
import { loadEmail, templateMarkup } from "../../../adapters/vite/render.ts";
import { FIELD_CLOSE, FIELD_OPEN } from "../../../src/template/tokens.ts";

const repo = resolve(import.meta.dirname, "../../..");

// written into a folder inside the repo, so they resolve react, vue and the adapters
const EMAILS: Record<string, string> = {
  "fields.jsx": `
export default function Fields({ order }) {
  return <a href={order.url} title={\`Order \${order.id}\`} style={{ color: order.color }}>{order.name} #{order.id}</a>;
}`,
  "branches.jsx": `
export default function Branches({ order, note }) {
  return (
    <div>
      {order.paid ? <b>Paid</b> : <i>Due</i>}
      {order.gift && <p>Gift</p>}
      <p>{note || "No note"}</p>
      {order.status === "shipped" ? <p>Shipped</p> : order.status === "ready" ? <p>Ready</p> : null}
      {!order.paid && order.items.length > 0 ? <p>Pay now</p> : null}
    </div>
  );
}`,
  "loops.jsx": `
export default function Loops({ order }) {
  return (
    <ul>
      {order.items.map((line, i) => (
        <li key={line.sku}>
          {line.name}
          {line.options.map((option) => <span key={option.code}>{option.label}</span>)}
        </li>
      ))}
      {order.items.filter((line) => line.backordered).map((line) => <li key={line.sku}>Later: {line.name}</li>)}
    </ul>
  );
}`,
  "attrs.jsx": `
export default function Attrs({ order }) {
  return <p className={order.paid ? "badge paid" : "badge"} style={{ color: order.vip ? "gold" : "gray" }}>{order.id}</p>;
}`,
  "math.jsx": `
export default function Math({ order }) {
  const tax = order.total * 0.2;
  return <p>{tax}</p>;
}`,
  "statement.jsx": `
export default function Statement({ order }) {
  if (order.paid) return <p>Thanks</p>;
  return <p>Please pay</p>;
}`,
  "effects.jsx": `
export default function Effects({ order }) {
  const out = [];
  if (order.paid) out.push(<p key="a">Thanks</p>);
  return <div>{out}</div>;
}`,
  "spread.jsx": `
export default function Spread(props) {
  return <p {...props} />;
}`,
  "hatch.jsx": `
import { Each, Else, ElseIf, If } from "../../../adapters/react/index.ts";

export default function Hatch({ order }) {
  return (
    <div>
      <If when={order.paid}>
        <b>Paid</b>
      </If>
      <ElseIf when={order.status === "open"}>
        <i>Open</i>
      </ElseIf>
      <Else>
        <u>Due</u>
      </Else>
      <Each of={order.items}>{(line) => <p key={line.sku}>{line.name}</p>}</Each>
      <If when={order.note}>{order.note}</If>
    </div>
  );
}`,
  "returned.jsx": `
const Gift = ({ order }) => order.gift && <p>Gift</p>;
const Badge = ({ order }) => (order.paid ? <b>Paid</b> : <i>Due</i>);
export default function Returned({ order }) {
  return <div><Gift order={order} /><Badge order={order} /></div>;
}`,
  "consts.jsx": `
const OFFICES = { us: "Ohio", ie: "Dublin" };
export default function Consts({ shop }) {
  return (
    <p>
      {Object.entries(OFFICES).map(([code, city]) => shop.code === code && <span key={code}>{city}</span>)}
      {["a", "b"].map((c) => <i key={c} className={shop.vip ? "v" : "n"}>{c}</i>)}
    </p>
  );
}`,
  "orphan.jsx": `
import { Else } from "../../../adapters/react/index.ts";
export default function Orphan() {
  return <div><p>x</p><Else>y</Else></div>;
}`,
  "Vfields.vue": `
<script setup>
import Line from "./Line.vue";
defineProps({ order: Object, note: String });
</script>
<template>
  <div :class="order.tone" :title="'Order ' + order.id">
    <p v-if="order.paid">Paid {{ order.total }}</p>
    <p v-else-if="order.status === 'open' && !order.held">Open</p>
    <p v-else>Due</p>
    <a :href="order.url">{{ order.paid ? "Receipt" : "Invoice" }}</a>
    <p>{{ note || "No note" }}</p>
    <Line v-for="line in order.items" :key="line.sku" :line="line" />
  </div>
</template>`,
  "Line.vue": `
<script setup>
defineProps({ line: { type: Object, required: true } });
</script>
<template>
  <div class="line"><span>{{ line.name }}</span><em v-if="line.discount">-{{ line.discount }}</em></div>
</template>`,
  "Vclass.vue": `
<script setup>
defineProps({ order: Object });
</script>
<template><p :class="{ paid: order.paid }">x</p></template>`,
  "Vtag.vue": `
<script setup>
defineProps({ flag: Boolean });
</script>

<template>
  <div class="wrap">
    <p>Status: <span class="tag" :class="{ on: flag }">tag</span></p>
  </div>
</template>`,
  "Vmath.vue": `
<script setup>
defineProps({ order: Object });
</script>
<template><p>{{ order.total.toFixed(2) }}</p></template>`,
  "Vhatch.vue": `
<script setup>
import { Each, Else, ElseIf, If } from "../../../adapters/vue/index.ts";
defineProps({ order: Object });
</script>
<template>
  <div>
    <If :when="order.paid"><b>Paid</b></If>
    <ElseIf :when="order.status === 'open'"><i>Open</i></ElseIf>
    <Else><u>Due</u></Else>
    <Each :of="order.items" v-slot="{ item }"><p>{{ item.name }}</p></Each>
  </div>
</template>`,
};

let dir: string;
let vite: ViteDevServer;
let emails: EmailEntry[];
beforeAll(async () => {
  mkdirSync(join(repo, "test/.tmp"), { recursive: true });
  dir = mkdtempSync(join(repo, "test/.tmp/native-"));
  for (const [f, src] of Object.entries(EMAILS)) writeFileSync(join(dir, f), src.trimStart());
  vite = await createEmailServer({ root: dir });
  emails = findEmails(dir);
});
afterAll(async () => {
  await vite.close();
  rmSync(dir, { recursive: true, force: true });
});

const email = (name: string) => emails.find((e) => e.name === name)!;
const readable = (s: string) => s.replaceAll(FIELD_OPEN, "{{").replaceAll(FIELD_CLOSE, "}}").replaceAll("&#x27;", "'");
const template = async (name: string) => readable(await templateMarkup(email(name), (await loadEmail(vite, email(name))).component, vite));
const html = async (name: string, data: unknown) => {
  const source = (await renderEmail(vite, email(name), { data, mode: "html" })).source;
  return source.slice(source.indexOf("</style>\n") + "</style>\n".length).trim();
};
const failure = async (name: string): Promise<string> => (await template(name).catch((e: Error) => e.message)) as string;

describe("React, template mode", () => {
  it("prints fields in text, attributes, template strings and styles", async () => {
    expect(await template("fields")).toBe('<a href="{{order.url}}" title="Order {{order.id}}" style="color:{{order.color}}">{{order.name}} #{{order.id}}</a>');
  });

  it("renders every branch: ?: as if / else, a chain as else-if, && as an if alone", async () => {
    expect(await template("branches")).toBe(
      [
        "<div>",
        '<tddr-if test="order.paid"><b>Paid</b></tddr-if><tddr-else><i>Due</i></tddr-else>',
        '<tddr-if test="order.gift" prints-zero="order.gift"><p>Gift</p></tddr-if>',
        '<p><tddr-if test="note">{{note}}</tddr-if><tddr-else>No note</tddr-else></p>',
        "<tddr-if test=\"order.status == 'shipped'\"><p>Shipped</p></tddr-if><tddr-else-if test=\"order.status == 'ready'\"><p>Ready</p></tddr-else-if>",
        '<tddr-if test="!order.paid &amp;&amp; order.items.length != 0"><p>Pay now</p></tddr-if>',
        "</div>",
      ].join(""),
    );
  });

  it("renders .map as an each, named after the callback's parameter, without key warnings", async () => {
    const error = vi.spyOn(console, "error");
    expect(await template("loops")).toBe(
      [
        "<ul>",
        '<tddr-each of="order.items" as="line"><li>{{line.name}}<tddr-each of="line.options" as="option"><span>{{option.label}}</span></tddr-each></li></tddr-each>',
        '<tddr-each of="order.items" as="line"><tddr-if test="line.backordered"><li>Later: {{line.name}}</li></tddr-if></tddr-each>',
        "</ul>",
      ].join(""),
    );
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("renders an if that returns as an if / else", async () => {
    expect(await template("statement")).toBe('<tddr-if test="order.paid"><p>Thanks</p></tddr-if><tddr-else><p>Please pay</p></tddr-else>');
  });

  it("renders a branch a component returns", async () => {
    expect(await template("returned")).toBe(
      '<div><tddr-if test="order.gift" prints-zero="order.gift"><p>Gift</p></tddr-if><tddr-if test="order.paid"><b>Paid</b></tddr-if><tddr-else><i>Due</i></tddr-else></div>',
    );
  });

  it("keeps keys when a list of constants maps to branches", async () => {
    const error = vi.spyOn(console, "error");
    expect(await template("consts")).toBe(
      [
        "<p>",
        "<tddr-if test=\"shop.code == 'us'\"><span>Ohio</span></tddr-if><tddr-if test=\"shop.code == 'ie'\"><span>Dublin</span></tddr-if>",
        '<tddr-if test="shop.vip"><i class="v">a</i></tddr-if><tddr-else><i class="n">a</i></tddr-else>',
        '<tddr-if test="shop.vip"><i class="v">b</i></tddr-if><tddr-else><i class="n">b</i></tddr-else>',
        "</p>",
      ].join(""),
    );
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("writes an element once per arm when an attribute depends on a condition", async () => {
    expect(await template("attrs")).toBe(
      [
        '<tddr-if test="order.paid">',
        '<tddr-if test="order.vip"><p class="badge paid" style="color:gold">{{order.id}}</p></tddr-if><tddr-else><p class="badge paid" style="color:gray">{{order.id}}</p></tddr-else>',
        "</tddr-if><tddr-else>",
        '<tddr-if test="order.vip"><p class="badge" style="color:gold">{{order.id}}</p></tddr-if><tddr-else><p class="badge" style="color:gray">{{order.id}}</p></tddr-else>',
        "</tddr-else>",
      ].join(""),
    );
  });

  it("names the field, the reason and the component line when a template can't do it", async () => {
    expect(await failure("math")).toMatch(/failed: order\.total: is used as a number.*\nHint: .*\n {4}at .*\/math\.jsx:2:\d+$/s);
    expect(await failure("effects")).toMatch(/failed: order\.paid: decides a branch that does more than return or assign.*\n {4}at .*\/effects\.jsx:3:\d+$/s);
    expect(await failure("spread")).toMatch(/failed: the email's props: are spread/);
  });

  it("If / ElseIf / Else and Each record the same blocks", async () => {
    expect(await template("hatch")).toBe(
      [
        "<div>",
        "<tddr-if test=\"order.paid\"><b>Paid</b></tddr-if><tddr-else-if test=\"order.status == 'open'\"><i>Open</i></tddr-else-if><tddr-else><u>Due</u></tddr-else>",
        '<tddr-each of="order.items" as="line"><p>{{line.name}}</p></tddr-each>',
        '<tddr-if test="order.note">{{order.note}}</tddr-if>',
        "</div>",
      ].join(""),
    );
    await expect(template("orphan")).rejects.toThrow(/failed: <Else>: isn't right after an <If>/);
  });
});

describe("React, html mode", () => {
  it("renders the same modules with real data", async () => {
    const order = { paid: false, gift: true, status: "ready", items: [{ sku: "a", name: "Tea", options: [{ code: "l", label: "Large" }], backordered: true }] };
    expect(await html("branches", { order, note: "" })).toBe("<div><i>Due</i><p>Gift</p><p>No note</p><p>Ready</p><p>Pay now</p></div>");
    expect(await html("loops", { order })).toBe("<ul><li>Tea<span>Large</span></li><li>Later: Tea</li></ul>");
    expect(await html("attrs", { order: { paid: true, vip: false, id: 7 } })).toBe('<p class="badge paid" style="color:gray">7</p>');
    expect(await html("math", { order: { total: 10 } })).toBe("<p>2</p>");
    expect(await html("statement", { order: { paid: true } })).toBe("<p>Thanks</p>");
    expect(await html("returned", { order: { gift: false, paid: true } })).toBe("<div><b>Paid</b></div>");
  });

  it("If / ElseIf / Else and Each behave like the native forms", async () => {
    const out = (order: object) => html("hatch", { order: { items: [{ sku: "a", name: "Tea" }], ...order } });
    expect(await out({ paid: true })).toBe("<div><b>Paid</b><p>Tea</p></div>");
    expect(await out({ status: "open", note: "Hi" })).toBe("<div><i>Open</i><p>Tea</p>Hi</div>");
    expect(await out({})).toBe("<div><u>Due</u><p>Tea</p></div>");
  });
});

describe("Vue, template mode", () => {
  it("renders v-if / v-else-if / v-else, v-for, {{ }} and :attr natively", async () => {
    expect(await template("Vfields")).toBe(
      [
        '<div class="{{order.tone}}" title="Order {{order.id}}">',
        '<tddr-if test="order.paid"><p>Paid {{order.total}}</p></tddr-if>',
        "<tddr-else-if test=\"order.status == 'open' &amp;&amp; !order.held\"><p>Open</p></tddr-else-if>",
        "<tddr-else><p>Due</p></tddr-else>",
        '<a href="{{order.url}}"><tddr-if test="order.paid">Receipt</tddr-if><tddr-else>Invoice</tddr-else></a>',
        '<p><tddr-if test="note">{{note}}</tddr-if><tddr-else>No note</tddr-else></p>',
        '<!--[--><tddr-each of="order.items" as="line"><div class="line"><span>{{line.name}}</span><tddr-if test="line.discount"><em>-{{line.discount}}</em></tddr-if></div></tddr-each><!--]-->',
        "</div>",
      ].join(""),
    );
  });

  it("refuses what an attribute or a field can't hold", async () => {
    // the file alone where the render mapped nothing on the line it ran, rather than a line not in it
    expect(await failure("Vclass")).toMatch(/failed: :class="\{ paid: … \}": a field switches the class on.*\n {4}at .*\/Vclass\.vue$/s);
    // the line of the :class, though Vue's server render maps only parts of it
    expect(await failure("Vtag")).toMatch(/failed: :class="\{ on: … \}": a field switches the class on.*\n {4}at .*\/Vtag\.vue:7:\d+$/s);
    expect(await failure("Vmath")).toMatch(/failed: order\.total\.toFixed\(\): calls a method.*\n {4}at .*\/Vmath\.vue:\d+:\d+$/s);
  });

  it("If / ElseIf / Else and Each record the same blocks", async () => {
    expect(await template("Vhatch")).toBe(
      [
        "<div>",
        '<tddr-if test="order.paid"><!--[--><b>Paid</b><!--]--></tddr-if>',
        "<tddr-else-if test=\"order.status == 'open'\"><!--[--><i>Open</i><!--]--></tddr-else-if>",
        "<tddr-else><!--[--><u>Due</u><!--]--></tddr-else>",
        '<tddr-each of="order.items" as="item"><!--[--><p>{{item.name}}</p><!--]--></tddr-each>',
        "</div>",
      ].join(""),
    );
  });
});

describe("Vue, html mode", () => {
  it("renders the same modules with real data", async () => {
    const order = { tone: "warm", id: 3, paid: false, status: "open", held: false, url: "u", items: [{ sku: "a", name: "Tea", discount: "1" }] };
    expect(await html("Vfields", { order, note: "" })).toBe(
      '<div class="warm" title="Order 3"><p>Open</p><a href="u">Invoice</a><p>No note</p><!--[--><div class="line"><span>Tea</span><em>-1</em></div><!--]--></div>',
    );
    expect(await html("Vclass", { order: { paid: true } })).toBe('<p class="paid">x</p>');
  });

  it("If / ElseIf / Else and Each behave like v-if and v-for", async () => {
    const out = (order: object) => html("Vhatch", { order: { items: [{ name: "Tea" }, { name: "Cake" }], ...order } });
    expect(await out({ paid: true })).toBe("<div><!--[--><b>Paid</b><!--]--><!--[--><p>Tea</p><!--]--><!--[--><p>Cake</p><!--]--></div>");
    expect(await out({ status: "open" })).toBe("<div><!--[--><i>Open</i><!--]--><!--[--><p>Tea</p><!--]--><!--[--><p>Cake</p><!--]--></div>");
    expect(await out({})).toBe("<div><!--[--><u>Due</u><!--]--><!--[--><p>Tea</p><!--]--><!--[--><p>Cake</p><!--]--></div>");
  });
});

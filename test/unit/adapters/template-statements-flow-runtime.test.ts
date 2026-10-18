import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEmailServer, findEmails, renderEmail, type EmailEntry } from "../../../adapters/vite/index.ts";
import { loadEmail, templateMarkup } from "../../../adapters/vite/render.ts";
import { FIELD_CLOSE, FIELD_OPEN } from "../../../src/template/tokens.ts";

const repo = resolve(import.meta.dirname, "../../..");

// Fixes to statement control flow (docs/templates.md#native-component-code): each email is filled by the real Handlebars and Liquid
// engines and must read like the html render of the same data.
const EMAILS: Record<string, string> = {
  "braced.jsx": `
export default function Braced({ order }) {
  switch (order.status) {
    case "shipped": {
      if (order.gift) return <p>gift on its way</p>;
      return <p>on its way</p>;
    }
    default:
      return <p>open</p>;
  }
}`,
  "bracedrest.jsx": `
export default function BracedRest({ order }) {
  switch (order.status) {
    case "shipped": {
      if (order.gift) return <p>gift on its way</p>;
      return <p>on its way</p>;
    }
  }
  return <p>Plain {order.id}</p>;
}`,
  "bracedbreak.jsx": `
export default function BracedBreak({ order }) {
  switch (order.status) {
    case "shipped": {
      if (order.gift) return <p>gift</p>;
      return <p>on way</p>;
    }
    break;
    default:
      return <p>open</p>;
  }
}`,
  "returnbreak.jsx": `
export default function ReturnBreak({ order }) {
  switch (order.status) {
    case "shipped":
      return <p>Shipped</p>;
      break;
    case "ready": {
      return <p>Ready</p>;
      break;
    }
    default:
      return <p>Open</p>;
  }
}`,
  "guardlet.jsx": `
export default function GuardLet({ order }) {
  if (!order.id) return null;
  let tone = "gray";
  if (order.paid) tone = "green";
  return <p className={tone}>Order {order.id}</p>;
}`,
  "armlet.jsx": `
export default function ArmLet({ order }) {
  if (order.paid) {
    let tone = "green";
    if (order.gift) tone = "gold";
    return <p className={tone}>Paid</p>;
  }
  return <p>Due</p>;
}`,
  "scopedcb.jsx": `
export default function ScopedCb({ order }) {
  if (order.paid) {
    return <p>Paid {["a", "b"].map((x) => {
      if (x) {
        let q = [];
        q.push(x);
        for (const y of [1]) {
          let t = 0;
          t++;
        }
      }
      return x;
    }).join("")}</p>;
  }
  return <p>Due</p>;
}`,
  "innerlet.jsx": `
export default function InnerLet({ order }) {
  let tone = "gray";
  if (order.paid) {
    let t = "green";
    if (order.gift) t = "gold";
    tone = t;
  }
  return <p className={tone}>Order {order.id}</p>;
}`,
  "e-callback.jsx": `
export default function Callback({ order }) {
  const rows = [];
  if (order.paid) return <p>{[1, 2].forEach((x) => rows.push(x))}</p>;
  return <p>{rows.length}</p>;
}`,
  "e-tryassign.jsx": `
export default function TryAssign({ order }) {
  let a = "a", b = "b";
  try {
    if (order.paid) { a = "A"; const t = order.id; b = t; }
  } catch {}
  return <p>{a}{b}</p>;
}`,
  "e-grouped.jsx": `
const OPEN = "open";
export default function Grouped({ order }) {
  switch (order.status) {
    case OPEN:
    default:
      return <p>open</p>;
    case "shipped":
      return <p>shipped</p>;
  }
}`,
  "e-shadow.jsx": `
export default function Shadow({ order }) {
  let v = "a";
  if (order.paid) { const v = "b"; } else v = "c";
  return <p>{v}</p>;
}`,
  "e-switchtrue.jsx": `
export default function SwitchTrue({ order }) {
  switch (true) {
    case order.paid:
      return <p>Paid</p>;
    case order.held:
      return <p>Held</p>;
    default:
      return <p>Due</p>;
  }
}`,
  "e-switchbreak.jsx": `
export default function SwitchBreak({ order }) {
  let label = "Due";
  switch (true) {
    case order.paid:
      label = "Paid";
      break;
    default:
      label = "Open";
  }
  return <p>{label}</p>;
}`,
  "e-switchand.jsx": `
export default function SwitchAnd({ order }) {
  let label = "Due";
  switch (true) {
    case order.paid && order.held:
      label = "Both";
      break;
    default:
      label = "Open";
  }
  return <p>{label}</p>;
}`,
  "e-switchname.jsx": `
export default function SwitchName({ order }) {
  const yes = true;
  let label = "Due";
  switch (yes) {
    case order.paid:
      label = "Paid";
      break;
    default:
      label = "Open";
  }
  return <p>{label}</p>;
}`,
  "grpneg.jsx": `
export default function GrpNeg({ order }) {
  switch (order.n) {
    case -1:
    default:
      return <p>a</p>;
    case 2:
      return <p>b</p>;
  }
}`,
  "e-nested.jsx": `
export default function Nested({ order }) {
  let v = "v0", w = "w0";
  if (order.paid) v = w = "w1";
  return <p>{v}-{w}</p>;
}`,
  "e-count.jsx": `
export default function Count({ order }) {
  const rows = [];
  if (order.paid) return <p>{rows.push(1)}</p>;
  return <p>{rows.length}</p>;
}`,
  "e-ternary.jsx": `
export default function Ternary({ order }) {
  const rows = [];
  return <p>{order.paid ? rows.push(1) : rows.length}</p>;
}`,
  "e-closure.jsx": `
export default function Closure({ order }) {
  let a = "a", b = "b";
  const show = () => <b>{a}{b}</b>;
  if (order.paid) { a = "A"; b = "B"; }
  return <p>{show()}</p>;
}`,
  "e-hoist.jsx": `
export default function Hoist({ order }) {
  if (order.cancelled) return <p>{why()}</p>;
  return <p>ok</p>;
  function why() { return "Cancelled"; }
}`,
  "Vmixed.vue": `
<script>
export const template = ["handlebars", "liquid"];
</script>
<script setup>
defineProps({ order: Object });
function badge(order) {
  if (order.paid) return "Paid";
  if (order.held) return "Held";
  return "Due";
}
</script>
<template>
  <div>
    <p v-if="order.held">Held {{ badge(order) }}</p>
    <p v-else>{{ badge(order) }}</p>
  </div>
</template>`,
};

const ORDER = { id: 7, status: "open" };
const DATA: Array<[string, Record<string, object>]> = [
  ["open", { order: ORDER }],
  ["shipped", { order: { ...ORDER, status: "shipped" } }],
  ["gift", { order: { ...ORDER, status: "shipped", gift: true } }],
  ["ready", { order: { ...ORDER, status: "ready" } }],
  ["no id", { order: { status: "open" } }],
  ["paid", { order: { ...ORDER, paid: true } }],
  ["paid gift", { order: { ...ORDER, paid: true, gift: true } }],
  ["held", { order: { ...ORDER, held: true } }],
  ["n -1", { order: { ...ORDER, n: -1 } }],
  ["n 2", { order: { ...ORDER, n: 2 } }],
  ["n 5", { order: { ...ORDER, n: 5 } }],
];

let dir: string;
let vite: ViteDevServer;
let emails: EmailEntry[];
beforeAll(async () => {
  mkdirSync(join(repo, "test/.tmp"), { recursive: true });
  dir = mkdtempSync(join(repo, "test/.tmp/flow-"));
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
const failure = async (name: string): Promise<string> => (await template(name).catch((e: Error) => e.message)) as string;

const ENTITIES: Record<string, string> = { "&amp;": "&", "&#x27;": "'", "&#39;": "'", "&quot;": '"', "&nbsp;": " " };
const text = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[#\w]+;/g, (e) => ENTITIES[e] ?? e)
    .replace(/\s+/g, " ")
    .trim();

describe("the template for the fixed shapes", () => {
  it("a braced case is the unbraced one", async () => {
    expect(await template("braced")).toBe("<tddr-if test=\"order.status == 'shipped'\"><tddr-if test=\"order.gift\"><p>gift on its way</p></tddr-if><tddr-else><p>on its way</p></tddr-else></tddr-if><tddr-else><p>open</p></tddr-else>");
  });

  it("a braced case followed by a break", async () => {
    expect(await template("bracedbreak")).toBe((await template("braced")).replace("gift on its way", "gift").replace("on its way", "on way"));
  });

  it("a braced case with code after the switch", async () => {
    expect(await template("bracedrest")).toBe(
      "<tddr-if test=\"order.status == 'shipped'\"><tddr-if test=\"order.gift\"><p>gift on its way</p></tddr-if><tddr-else><p>on its way</p></tddr-else></tddr-if><tddr-else><p>Plain {{order.id}}</p></tddr-else>",
    );
  });

  it("a guard clause, then a branch-assigned let", async () => {
    expect(await template("guardlet")).toBe('<tddr-if test="order.id"><tddr-if test="order.paid"><p class="green">Order {{order.id}}</p></tddr-if><tddr-else><p class="gray">Order {{order.id}}</p></tddr-else></tddr-if>');
  });

  it("Vue: a helper with an early return next to v-if", async () => {
    const markup = await template("Vmixed");
    expect(markup).toContain('<tddr-if test="order.held">');
    expect(markup).toContain('<tddr-if test="order.paid">Paid</tddr-if>');
  });
});

const dialects = ["handlebars", "liquid"] as const;
const names = ["braced", "bracedbreak", "bracedrest", "returnbreak", "guardlet", "armlet", "scopedcb", "innerlet", "Vmixed", "grpneg"];
const cases = names.flatMap((name) => DATA.flatMap(([set, data]) => dialects.map((d) => [`${name} [${d}, ${set}]`, name, data, d] as const)));

describe("the real engines fill it like the html render", () => {
  it.each(cases)("%s", async (_, name, data, dialect) => {
    const filled = await renderEmail(vite, email(name), { data, mode: dialect });
    const plain = await renderEmail(vite, email(name), { data, mode: "html" });
    expect(filled.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(filled.filled).toBe("engine");
    expect(text(filled.html)).toBe(text(plain.html));
  });
});

describe("what stays an error, with its own reason", () => {
  it("a nested assignment in an assigned value", async () => {
    expect(await failure("e-nested")).toMatch(/order\.paid: decides a branch whose value changes something.*\nHint: compute the value without changing anything.*\n {4}at .*\/e-nested\.jsx:3:\d+$/s);
  });
  it("a push in an early-return arm", async () => {
    expect(await failure("e-count")).toMatch(/order\.paid: decides a branch whose value changes something.*\n {4}at .*\/e-count\.jsx:3:\d+$/s);
  });
  it("a push in a ternary arm", async () => {
    expect(await failure("e-ternary")).toMatch(/order\.paid: decides a branch whose value changes something.*\n {4}at .*\/e-ternary\.jsx:3:\d+$/s);
  });
  it("a callback that pushes to an outer list", async () => {
    expect(await failure("e-callback")).toMatch(/order\.paid: decides a branch whose value changes something.*\n {4}at .*\/e-callback\.jsx:3:\d+$/s);
  });
  it("several variables assigned in try", async () => {
    expect(await failure("e-tryassign")).toMatch(/order\.paid: assigns several variables in a branch decided by a field inside try.*\nHint: decide before the try.*\n {4}at .*\/e-tryassign\.jsx:4:\d+$/s);
  });
  it("a case grouped with default", async () => {
    expect(await failure("e-grouped")).toMatch(/order\.status: decides a switch with a case grouped with default.*\nHint: use a literal.*\n {4}at .*\/e-grouped\.jsx:3:\d+$/s);
  });
  it("a branch that declares the assigned variable again", async () => {
    expect(await failure("e-shadow")).toMatch(/order\.paid: assigns a variable that a branch declares again.*\nHint: rename the variable.*\n {4}at .*\/e-shadow\.jsx:3:\d+$/s);
  });
  it("switch (true) with a return in every case", async () => {
    expect(await failure("e-switchtrue")).toMatch(/order\.paid: is compared with true on the left.*\nHint: branch with if \(order\.paid\) … else if.*\n {4}at .*\/e-switchtrue\.jsx:3:\d+$/s);
  });
  it("a switch on a constant name, with a field as the case", async () => {
    expect(await failure("e-switchname")).toMatch(/order\.paid: is compared with true on the left.*\nHint: branch with if \(order\.paid\).*\n {4}at .*\/e-switchname\.jsx:5:10$/s);
  });
  it("switch (true) with break cases", async () => {
    expect(await failure("e-switchbreak")).toMatch(/order\.paid: is compared with true on the left.*\nHint: branch with if \(order\.paid\).*\n {4}at .*\/e-switchbreak\.jsx:4:\d+$/s);
  });
  it("switch (true) on a condition made of fields", async () => {
    expect(await failure("e-switchand")).toMatch(/a value that depends on order\.paid: is a case of a switch on true.*\nHint: branch with if.*\n {4}at .*\/e-switchand\.jsx:4:\d+$/s);
  });
  it("a closure that reads the assigned variables", async () => {
    expect(await failure("e-closure")).toMatch(/order\.paid: assigns several variables in a branch decided by a field while a function in this component also reads them.*\nHint: assign one variable per if.*\n {4}at .*\/e-closure\.jsx:4:\d+$/s);
  });
  it("a declaration after the if that the if also uses", async () => {
    expect(await failure("e-hoist")).toMatch(/order\.cancelled: decides a return, but a name declared after it.*\nHint: rename the later declaration.*\n {4}at .*\/e-hoist\.jsx:2:\d+$/s);
  });
});

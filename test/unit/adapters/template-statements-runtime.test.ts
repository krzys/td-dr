import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEmailServer, findEmails, renderEmail, type EmailEntry } from "../../../adapters/vite/index.ts";
import { compileTemplate, loadEmail, templateMarkup } from "../../../adapters/vite/render.ts";
import { FIELD_CLOSE, FIELD_OPEN } from "../../../src/template/tokens.ts";

const repo = resolve(import.meta.dirname, "../../..");

// Statement control flow in components (docs/decisions.md §11): each email is filled by the real Handlebars and
// Liquid engines and must read like the html render of the same data.
const EMAILS: Record<string, string> = {
  "guard.jsx": `
export default function Guard({ order, note }) {
  if (order.cancelled) return <p>Cancelled</p>;
  if (order.status === "shipped") return <p>Shipped {order.id}</p>;
  if (order.status === "ready" || order.pickup) return <p>Ready</p>;
  return <p>Open {note}</p>;
}`,
  "chain.jsx": `
export default function Chain({ order }) {
  if (order.paid) {
    return <b>Paid</b>;
  } else if (order.held) {
    return <i>Held</i>;
  } else {
    return <u>Due</u>;
  }
}`,
  "nullcheck.jsx": `
export default function NullCheck({ order }) {
  if (!order.note) return null;
  const note = order.note;
  return <p>{note}</p>;
}`,
  "switch.jsx": `
export default function Switch({ order }) {
  switch (order.status) {
    case "shipped":
    case "delivered":
      return <b>On its way</b>;
    case "ready": {
      const label = "Pick up";
      return <i>{label}</i>;
    }
    default:
      return <u>Open</u>;
  }
}`,
  "switch-rest.jsx": `
export default function SwitchRest({ order }) {
  switch (order.kind) {
    case "gift":
      return <p>Gift</p>;
    case "sub":
      return <p>Subscription</p>;
  }
  return <p>Plain {order.id}</p>;
}`,
  "assigned.jsx": `
export default function Assigned({ order }) {
  let badge;
  let tone = "gray";
  if (order.paid) {
    badge = <b>Paid</b>;
    tone = "green";
  } else if (order.held) badge = <i>Held</i>;
  else badge = <u>Due</u>;
  let label = "Standard";
  if (order.express) label = "Express";
  return <p className={tone}>{badge} {label}</p>;
}`,
  "constants.jsx": `
export default function Constants({ order }) {
  let line;
  if (order.gift) {
    const text = "Gift for " + order.to;
    line = <em>{text}</em>;
  } else {
    line = <span>{order.to}</span>;
  }
  return <div>{line}</div>;
}`,
  "mapped.jsx": `
export default function Mapped({ order }) {
  return (
    <ul>
      {order.items.map((line) => {
        if (line.hidden) return null;
        if (line.gift) return <li key={line.sku}>Gift {line.name}</li>;
        return <li key={line.sku}>{line.name}</li>;
      })}
    </ul>
  );
}`,
  "helper.jsx": `
function describe(order) {
  if (order.paid) return "Paid";
  if (order.held) return "Held";
  return "Due";
}
export default function Helper({ order }) {
  return <p>Status: {describe(order)} for {order.id}</p>;
}`,
  "nested.jsx": `
export default function Nested({ order }) {
  if (order.paid) {
    if (order.gift) return <p>Paid gift</p>;
    return <p>Paid</p>;
  }
  return <p>Due</p>;
}`,
  // the errors
  "e-push.jsx": `
export default function Push({ order }) {
  const rows = [];
  if (order.paid) rows.push(<p key="a">Paid</p>);
  return <div>{rows}</div>;
}`,
  "e-loop.jsx": `
export default function Loop({ order }) {
  while (order.more) {}
  return <p>x</p>;
}`,
  "e-return-in-loop.jsx": `
export default function ReturnInLoop({ order }) {
  for (const line of [1, 2]) {
    if (order.paid) return <p>{line}</p>;
  }
  return <p>none</p>;
}`,
  "e-try.jsx": `
export default function Try({ order }) {
  try {
    if (order.paid) return <p>Paid</p>;
  } catch (e) {}
  return <p>Due</p>;
}`,
  "e-break.jsx": `
export default function Break({ order }) {
  switch (order.status) {
    case "a":
      return <p>A</p>;
    case "b":
      break;
    default:
      return <p>D</p>;
  }
  return <p>after</p>;
}`,
  "e-fall.jsx": `
export default function Fall({ order }) {
  let n = 0;
  switch (order.status) {
    case "a":
      n++;
    case "b":
      return <p>{n}</p>;
    default:
      return <p>D</p>;
  }
}`,
  "e-compound.jsx": `
export default function Compound({ order }) {
  let n = 0;
  if (order.paid) n += 1;
  return <p>{n}</p>;
}`,
  "e-assign.jsx": `
export default function AssignParam({ order }) {
  if (order.paid) order = { id: 1 };
  return <p>{order.id}</p>;
}`,
  "e-catch.jsx": `
export default function CatchDestructured({ order }) {
  try {
    if (order.paid) return <p>Paid</p>;
  } catch ({ message }) {
    return <p>{message}</p>;
  }
  return <p>Due</p>;
}`,
  "showcase.jsx": `
export default function Showcase({ order }) {
  let tone = "gray";
  if (order.paid) tone = "green";
  else if (order.held) tone = "amber";
  switch (order.status) {
    case "shipped":
    case "delivered":
      return <p className={tone}>On its way</p>;
    default:
      if (!order.note) return <p className={tone}>Open</p>;
      return <p className={tone}>Open: {order.note}</p>;
  }
}`,
  "e-continue.jsx": `
export default function Continue({ order }) {
  const out = [];
  for (const line of [1, 2]) {
    if (order.paid) continue;
    out.push(<i key={line}>{line}</i>);
  }
  return <div>{out}</div>;
}`,
};

const ORDER = { id: 7, to: "Sam", status: "open", items: [{ sku: "a", name: "Tea" }, { sku: "b", name: "Cake", gift: true }, { sku: "c", name: "Jam", hidden: true }] };
const DATA: Array<[string, Record<string, object>]> = [
  ["open", { order: ORDER }],
  ["cancelled", { order: { ...ORDER, cancelled: true } }],
  ["shipped", { order: { ...ORDER, status: "shipped" } }],
  ["ready", { order: { ...ORDER, status: "ready" } }],
  ["pickup", { order: { ...ORDER, pickup: true } }],
  ["delivered", { order: { ...ORDER, status: "delivered" } }],
  ["paid gift", { order: { ...ORDER, paid: true, gift: true, express: true, note: "Hi" } }],
  ["held", { order: { ...ORDER, held: true, kind: "gift" } }],
  ["sub", { order: { ...ORDER, kind: "sub", note: "" } }],
];
const WITH_NOTE: Record<string, unknown> = { note: "Hello" };

let dir: string;
let vite: ViteDevServer;
let emails: EmailEntry[];
beforeAll(async () => {
  mkdirSync(join(repo, "test/.tmp"), { recursive: true });
  dir = mkdtempSync(join(repo, "test/.tmp/statements-"));
  for (const [f, src] of Object.entries(EMAILS)) writeFileSync(join(dir, f), src.trimStart() + (f.startsWith("e-") ? "" : '\nexport const template = ["handlebars", "liquid"];\n'));
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

describe("the template a component with statements gives", () => {
  it("guard clauses are one if / else-if / else", async () => {
    expect(await template("guard")).toBe(
      [
        '<tddr-if test="order.cancelled"><p>Cancelled</p></tddr-if>',
        "<tddr-else-if test=\"order.status == 'shipped'\"><p>Shipped {{order.id}}</p></tddr-else-if>",
        "<tddr-else-if test=\"order.status == 'ready' || order.pickup\"><p>Ready</p></tddr-else-if>",
        "<tddr-else><p>Open {{note}}</p></tddr-else>",
      ].join(""),
    );
  });

  it("an if / else-if / else that returns in every arm", async () => {
    expect(await template("chain")).toBe('<tddr-if test="order.paid"><b>Paid</b></tddr-if><tddr-else-if test="order.held"><i>Held</i></tddr-else-if><tddr-else><u>Due</u></tddr-else>');
  });

  it("if (!x) return null leaves the rest to x", async () => {
    expect(await template("nullcheck")).toBe('<tddr-if test="order.note"><p>{{order.note}}</p></tddr-if>');
  });

  it("a switch: grouped cases are an or, default the else", async () => {
    expect(await template("switch")).toBe(
      "<tddr-if test=\"order.status == 'shipped' || order.status == 'delivered'\"><b>On its way</b></tddr-if><tddr-else-if test=\"order.status == 'ready'\"><i>Pick up</i></tddr-else-if><tddr-else><u>Open</u></tddr-else>",
    );
  });

  it("a switch without default leaves the code after it as the else", async () => {
    expect(await template("switch-rest")).toBe(
      "<tddr-if test=\"order.kind == 'gift'\"><p>Gift</p></tddr-if><tddr-else-if test=\"order.kind == 'sub'\"><p>Subscription</p></tddr-else-if><tddr-else><p>Plain {{order.id}}</p></tddr-else>",
    );
  });

  it("variables assigned in branches are branch values", async () => {
    const markup = await template("assigned");
    expect(markup).toContain('<tddr-if test="order.paid"><p class="green">');
    expect(markup).toContain('<tddr-else><p class="gray">');
    expect(markup).toContain("<b>Paid</b></tddr-if><tddr-else-if test=\"order.held\"><i>Held</i>");
  });

  it("a const in an arm feeds the assignment", async () => {
    expect(await template("constants")).toBe('<div><tddr-if test="order.gift"><em>Gift for {{order.to}}</em></tddr-if><tddr-else><span>{{order.to}}</span></tddr-else></div>');
  });

  it("works in .map callbacks and plain helpers", async () => {
    expect(await template("mapped")).toBe(
      '<ul><tddr-each of="order.items" as="line"><tddr-if test="!line.hidden &amp;&amp; line.gift"><li>Gift {{line.name}}</li></tddr-if><tddr-else-if test="!line.hidden"><li>{{line.name}}</li></tddr-else-if></tddr-each></ul>',
    );
    expect(await template("helper")).toContain('<tddr-if test="order.paid">Paid</tddr-if><tddr-else-if test="order.held">Held</tddr-else-if><tddr-else>Due</tddr-else>');
  });
});

// the control tags of the compiled template, as a reader of the ESP template would see them
const controlTags = async (name: string, dialect: "handlebars" | "liquid") => {
  const { template } = await compileTemplate(vite, email(name), dialect);
  return template.match(/\{\{[#/]?(?:if|equals|else)[^}]*\}\}|\{%-?\s*(?:if|elsif|else|endif)[^%]*%\}/g);
};

describe("the compiled templates for guard + switch + assigned variable", () => {
  it("handlebars", async () => {
    expect(await controlTags("showcase", "handlebars")).toMatchInlineSnapshot(`
      [
        "{{#equals order.status "shipped"}}",
        "{{#if order.paid}}",
        "{{else if order.held}}",
        "{{else}}",
        "{{/if}}",
        "{{else}}",
        "{{#equals order.status "delivered"}}",
        "{{#if order.paid}}",
        "{{else if order.held}}",
        "{{else}}",
        "{{/if}}",
        "{{else}}",
        "{{#if order.paid}}",
        "{{else if order.held}}",
        "{{else}}",
        "{{/if}}",
        "{{else}}",
        "{{#if order.paid}}",
        "{{else if order.held}}",
        "{{else}}",
        "{{/if}}",
        "{{/equals}}",
        "{{/equals}}",
      ]
    `);
  });
  it("liquid", async () => {
    expect(await controlTags("showcase", "liquid")).toMatchInlineSnapshot(`
      [
        "{% if order.status == "shipped" or order.status == "delivered" %}",
        "{% if order.paid and order.paid != 0 and order.paid != \"\" %}",
        "{% elsif order.held and order.held != 0 and order.held != \"\" %}",
        "{% else %}",
        "{% endif %}",
        "{% elsif tddr-1 %}",
        "{% if order.paid and order.paid != 0 and order.paid != \"\" %}",
        "{% elsif order.held and order.held != 0 and order.held != \"\" %}",
        "{% else %}",
        "{% endif %}",
        "{% else %}",
        "{% if order.paid and order.paid != 0 and order.paid != \"\" %}",
        "{% elsif order.held and order.held != 0 and order.held != \"\" %}",
        "{% else %}",
        "{% endif %}",
        "{% endif %}",
      ]
    `);
  });
});

const dialects = ["handlebars", "liquid"] as const;
const names = ["guard", "chain", "nullcheck", "switch", "switch-rest", "assigned", "constants", "mapped", "helper", "nested", "showcase"];
const cases = names.flatMap((name) => DATA.flatMap(([set, data]) => dialects.map((d) => [`${name} [${d}, ${set}]`, name, data, d] as const)));

describe("the real engines fill it like the html render", () => {
  it.each(cases)("%s", async (_, name, data, dialect) => {
    const props = { ...WITH_NOTE, ...data };
    const filled = await renderEmail(vite, email(name), { data: props, mode: dialect });
    const plain = await renderEmail(vite, email(name), { data: props, mode: "html" });
    expect(filled.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(filled.filled).toBe("engine");
    expect(text(filled.html)).toBe(text(plain.html));
    expect(text(filled.source)).toBe(text(plain.source));
  });
});

describe("what stays an error, at the statement", () => {
  it("a branch that pushes", async () => {
    expect(await failure("e-push")).toMatch(/order\.paid: decides a branch that does more than return or assign a variable.*\nHint: return the value from each branch.*\n {4}at .*\/e-push\.jsx:3:\d+$/s);
  });
  it("a loop with a field test", async () => {
    expect(await failure("e-loop")).toMatch(/order\.more: is the test of a loop.*\n {4}at .*\/e-loop\.jsx:2:\d+$/s);
  });
  it("a return in a loop that depends on a field", async () => {
    expect(await failure("e-return-in-loop")).toMatch(/order\.paid: decides a return inside a loop.*\nHint: \.map over the list.*\n {4}at .*\/e-return-in-loop\.jsx:3:\d+$/s);
  });
  it("a field-decided return in try / catch", async () => {
    expect(await failure("e-try")).toMatch(/order\.paid: decides a return inside try \/ catch.*\n {4}at .*\/e-try\.jsx:3:\d+$/s);
  });
  it("a break-terminated case", async () => {
    expect(await failure("e-break")).toMatch(/order\.status: decides a switch whose case ends in break.*\nHint: end every case with return.*\n {4}at .*\/e-break\.jsx:2:\d+$/s);
  });
  it("a case that falls through into code", async () => {
    expect(await failure("e-fall")).toMatch(/order\.status: decides a switch where a case falls through.*\n {4}at .*\/e-fall\.jsx:3:\d+$/s);
  });
  it("+= in a branch", async () => {
    expect(await failure("e-compound")).toMatch(/order\.paid: decides a branch that does more than return or assign a variable.*\n {4}at .*\/e-compound\.jsx:3:\d+$/s);
  });
  it("an assignment to a parameter or outer variable gets its own reason", async () => {
    expect(await failure("e-assign")).toMatch(/order\.paid: assigns something that is not a let declared earlier in this function.*\nHint: declare a let in this function before the if.*\n {4}at .*\/e-assign\.jsx:2:\d+$/s);
  });
  it("a destructured catch still lets the template error through", async () => {
    expect(await failure("e-catch")).toMatch(/order\.paid: decides a return inside try \/ catch.*\n {4}at .*\/e-catch\.jsx:3:\d+$/s);
  });
  it("continue out of a branch", async () => {
    expect(await failure("e-continue")).toMatch(/order\.paid: decides a break or continue.*\n {4}at .*\/e-continue\.jsx:4:\d+$/s);
  });
});

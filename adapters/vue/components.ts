import { defineComponent, type ComponentInternalInstance, type SlotsType } from "vue";
import { ssrRenderSlot } from "vue/server-renderer";
import { attrText, condOf, condText, isSymbolic, templateError } from "../template/index.ts";
import { pushEach, type Push } from "./blocks.ts";

// An If / ElseIf / Else run in one component's markup is one chain: `done` once a plain-true
// arm rendered, `open` once a block was written (so later arms are else-if / else).
type Chain = { done: boolean; open: boolean };
const chains = new WeakMap<object, Chain>();

type Ctx = { when?: unknown; of?: unknown; $slots: Record<string, unknown> };
const owner = (i: ComponentInternalInstance): object => i.parent ?? i;

const arm = (chain: Chain, when: unknown, otherwise: boolean, push: Push, body: () => void): void => {
  if (chain.done) return;
  const c = otherwise ? ({ t: "const", v: true } as const) : condOf(when);
  if (c.t === "const") {
    if (!c.v) return;
    chain.done = true;
    if (!chain.open) return body();
    push("<tddr-else>");
    body();
    push("</tddr-else>");
    return;
  }
  const tag = chain.open ? "tddr-else-if" : "tddr-if";
  push(`<${tag}${attrText({ test: condText(c) })}>`);
  body();
  push(`</${tag}>`);
  chain.open = true;
};

const slot = (ctx: Ctx, push: Push, i: ComponentInternalInstance, props: Record<string, unknown> = {}) => () =>
  ssrRenderSlot(ctx.$slots as never, "default", props, null, push as never, i);

const continued = (name: string, i: ComponentInternalInstance): Chain => {
  const chain = chains.get(owner(i));
  if (!chain) throw templateError(`<${name}>`, "has no <If> before it in the same markup.", "put it right after the <If> (or <ElseIf>) it continues");
  return chain;
};

// The escape hatch (docs/templates.md): `when` is a native expression, a boolean on real data and a
// recorded condition in a template; rendered on the server only, as emails are.
export const If = defineComponent({
  name: "If",
  props: ["when"],
  slots: Object as SlotsType<{ default: unknown }>,
  ssrRender(ctx: Ctx, push: Push, i: ComponentInternalInstance) {
    const chain = { done: false, open: false };
    chains.set(owner(i), chain);
    arm(chain, ctx.when, false, push, slot(ctx, push, i));
  },
});

export const ElseIf = defineComponent({
  name: "ElseIf",
  props: ["when"],
  slots: Object as SlotsType<{ default: unknown }>,
  ssrRender(ctx: Ctx, push: Push, i: ComponentInternalInstance) {
    arm(continued("ElseIf", i), ctx.when, false, push, slot(ctx, push, i));
  },
});

export const Else = defineComponent({
  name: "Else",
  slots: Object as SlotsType<{ default: unknown }>,
  ssrRender(ctx: Ctx, push: Push, i: ComponentInternalInstance) {
    arm(continued("Else", i), undefined, true, push, slot(ctx, push, i));
  },
});

// <Each :of="list" v-slot="{ item, index }">, like v-for
export const Each = defineComponent({
  name: "Each",
  props: ["of"],
  slots: Object as SlotsType<{ default: { item: unknown; index: unknown } }>,
  ssrRender(ctx: Ctx, push: Push, i: ComponentInternalInstance) {
    const run = (item: unknown, index: unknown) => slot(ctx, push, i, { item, index })();
    if (isSymbolic(ctx.of)) return pushEach(push, ctx.of, undefined, run);
    (ctx.of as unknown[] | null | undefined)?.forEach(run);
  },
});

import { get } from "../style/props.ts";
import type { StyledElement } from "../style/types.ts";
import type { ConditionalNode, Node } from "../ir/index.ts";
import { CHAIN_TAG, GROUP_TAG } from "../template/chain.ts";

export type Item = { node: Node; el?: StyledElement; hide?: "hidden" | "shown" };

// `order` reorders the items before anything else looks at them (stable, default 0). An
// Outlook-only item travels with the visible item before it. Loops and conditionals can't be
// placed at compile time, and neither can an order that isn't a plain number.
const flexElements = (el: StyledElement): StyledElement[] =>
  el.tag === GROUP_TAG || el.tag === CHAIN_TAG ? el.children.flatMap((c) => (c.type === "element" ? flexElements(c) : [])) : [el];

export const reorder = (items: Item[], fail: (el: StyledElement, value: string, why?: string) => void): Item[] => {
  const orderOf = (it: Item): number => {
    const v = it.el ? get(it.el.style, "order") : undefined;
    if (v === undefined) return 0;
    const n = Number(v);
    if (Number.isInteger(n) && v.trim() !== "") return n;
    fail(it.el!, v, "order takes a whole number");
    return Number.NaN;
  };
  const orders = items.map(orderOf);
  // a construct's order lives on the elements inside it (group / chain wrappers carry none)
  const inner = items.flatMap((it) => (it.node.kind === "template" && it.el ? flexElements(it.el).filter((e) => e !== it.el && Number(get(e.style, "order") ?? 0) !== 0) : []));
  if (inner.length > 0) {
    for (const e of inner) fail(e, get(e.style, "order")!, "a repeated or conditional item can't be placed at compile time");
    return items;
  }
  if (orders.every((o) => o === 0 || Number.isNaN(o))) return items;
  const looped = items.findIndex((it, i) => it.node.kind === "template" && orders[i] !== 0 && !Number.isNaN(orders[i]!));
  if (looped >= 0) {
    fail(items[looped]!.el!, get(items[looped]!.el!.style, "order")!, "a repeated or conditional item can't be placed at compile time");
    return items;
  }
  if (orders.some(Number.isNaN)) return items;
  const lead: Item[] = [];
  const groups: Array<{ order: number; items: Item[] }> = [];
  items.forEach((it, i) => {
    if (msoItem(it)) (groups.at(-1)?.items ?? lead).push(it);
    else groups.push({ order: orders[i]!, items: [it] });
  });
  return [...lead, ...groups.sort((a, b) => a.order - b.order).flatMap((g) => g.items)];
};

// data-email="outlook-only" on an item: other clients get no cell for it at all
export const msoItem = (it: Item): it is Item & { node: ConditionalNode } => it.node.kind === "conditional" && it.node.target === "mso";

import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { isValidElement, type Key, type ReactElement } from "react";
import { branch, branchError, isBranch, type Branch } from "../template/branch.ts";
import { blockParts, chain, infoOf, isEach, templateError, textOf } from "../template/index.ts";

type Props = Record<string, unknown>;
export type Make = (type: unknown, props: Props, key?: unknown) => ReactElement;

// what React renders as nothing
const empty = (v: unknown): boolean => v === null || v === undefined || typeof v === "boolean" || v === "";

// marks If / ElseIf / Else, so a run of them in children is read as one chain
export const BLOCK_KIND = Symbol.for("tddr.react.block");
const kindOf = (v: unknown): string | undefined =>
  isValidElement(v) && typeof v.type === "function" ? (v.type as unknown as Record<symbol, string>)[BLOCK_KIND] : undefined;

const foldChains = (list: readonly unknown[]): unknown[] => {
  const out: unknown[] = [];
  for (let i = 0; i < list.length; i++) {
    const head = list[i];
    if (kindOf(head) !== "if") {
      out.push(head);
      continue;
    }
    const props = (el: unknown) => (el as ReactElement<Props>).props;
    const arms: Array<[unknown, () => unknown]> = [[props(head).when, () => props(head).children]];
    let otherwise: (() => unknown) | undefined;
    for (let k = kindOf(list[i + 1]); k === "else-if" || k === "else"; k = kindOf(list[i + 1])) {
      const el = list[++i];
      if (k === "else") {
        otherwise = () => props(el).children;
        break;
      }
      arms.push([props(el).when, () => props(el).children]);
    }
    out.push(arms.length === 1 && !otherwise ? head : chain(arms, otherwise));
  }
  return out;
};

// A child as React can render it: a field is its placeholder, a branch or a loop its <tddr-*> elements.
// In a list, a branch stands where its element was, so it takes a key like one.
export const toNode = (v: unknown, key?: unknown): unknown => {
  const info = infoOf(v);
  if (info) return textOf(info);
  const parts = blockParts(v, empty);
  if (parts) return jsxs(Fragment, { children: parts.map((p) => jsx(p.tag as never, { ...p.attrs, children: toNode(p.value) })) }, key as Key | undefined);
  if (!Array.isArray(v)) return v;
  const out = foldChains(v).map((c, i) => toNode(c, i));
  return out.length === v.length && out.every((c, i) => c === v[i]) ? v : out;
};

const mapArms = (b: Branch, f: (v: unknown) => unknown): Branch =>
  branch(
    b.$arms.map((a) => ({ when: a.when, value: f(a.value) })),
    // an attribute with no else is left off the element, not the element itself
    f(b.$otherwise),
    b.$test,
  );

// An attribute that depends on a condition: the element once per arm, inside the blocks.
const split = (make: Make, type: string, config: Props, key: unknown): ReactElement | undefined => {
  for (const [k, v] of Object.entries(config)) {
    if (k === "children") continue;
    if (isBranch(v)) return toNode(mapArms(v, (x) => prepare(make, type, { ...config, [k]: x }, key)), keyOf(key)) as ReactElement;
    if (k !== "style" || !v || typeof v !== "object") continue;
    for (const [s, sv] of Object.entries(v)) {
      if (isBranch(sv)) return toNode(mapArms(sv, (x) => prepare(make, type, { ...config, style: { ...v, [s]: x } }, key)), keyOf(key)) as ReactElement;
    }
  }
  return undefined;
};

const hostValue = (k: string, v: unknown): unknown => {
  if (isEach(v)) throw templateError(`the ${k} attribute`, "is a loop; an attribute holds text.", "loop around elements, not inside an attribute");
  const info = infoOf(v);
  if (info) return textOf(info);
  if (k === "style" && v && typeof v === "object" && Object.values(v).some((s) => infoOf(s)))
    return Object.fromEntries(Object.entries(v).map(([s, sv]) => [s, infoOf(sv) ? textOf(infoOf(sv)!) : sv]));
  return v;
};

const keyOf = (key: unknown): unknown => {
  const info = infoOf(key);
  // a loop's own index can't be a key in a template, and only one copy of the body renders
  return info ? (info.kind === "field" ? textOf(info) : undefined) : key;
};

// A component may return `cond && <p/>` itself; React never sees that as a child, so read it here.
const wrapped = new WeakMap<object, unknown>();
const component = (type: unknown): unknown => {
  if (typeof type !== "function" || BLOCK_KIND in type || type.prototype?.isReactComponent) return type;
  let w = wrapped.get(type);
  if (!w) {
    const render = type as (props: Props) => unknown;
    w = Object.defineProperty((props: Props) => toNode(render(props)), "name", { value: render.name });
    wrapped.set(type, w);
  }
  return w;
};

export const prepare = (make: Make, rawType: unknown, config: Props | null | undefined, key: unknown): ReactElement => {
  if (isBranch(rawType)) throw branchError(rawType, "is used as an element type (<Tag/>); a component can't be picked when the ESP fills the data.", "branch in the markup instead: cond ? <A/> : <B/>");
  const type = component(rawType);
  if (!config) return make(type, config ?? {}, keyOf(key));
  if (typeof type === "string") {
    const copies = split(make, type, config, key);
    if (copies) return copies;
  }
  let props: Props | undefined;
  for (const [k, v] of Object.entries(config)) {
    const next = k === "children" ? toNode(v) : typeof type === "string" ? hostValue(k, v) : v;
    if (next !== v) (props ??= { ...config })[k] = next;
  }
  return make(type, props ?? config, keyOf(key));
};

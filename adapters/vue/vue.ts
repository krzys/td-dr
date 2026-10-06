// vue for email modules in the email environment (docs/decisions.md §11): class and style bindings take
// template values before Vue normalizes them (it would drop a field, or keep a class a field
// switches as if it were on). Everything else is Vue's own.
import * as vue from "vue";
import { classValue, noBranch, styleValue } from "./blocks.ts";

export * from "vue";

export const normalizeClass = (v: unknown): string => vue.normalizeClass(classValue(v));
export const normalizeStyle = (v: unknown) => vue.normalizeStyle(styleValue(v));
// only class and style: other props may be a component's, and stay symbolic
const bindings = (a: Record<string, unknown>) => ({ ...a, ...("class" in a ? { class: classValue(a.class) } : {}), ...("style" in a ? { style: styleValue(a.style) } : {}) });
export const mergeProps = (...args: Array<Record<string, unknown> | null | undefined>) =>
  vue.mergeProps(...(args.map((a) => (a ? bindings(a) : a)) as Parameters<typeof vue.mergeProps>));

export const resolveDynamicComponent = (c: unknown) => {
  noBranch(c, "<component :is>");
  return vue.resolveDynamicComponent(c as never);
};

// the vnode path of <Tag/>: a render function or a slot makes the vnode instead of calling ssrRenderComponent
export const createVNode = ((type: unknown, ...rest: unknown[]) => {
  noBranch(type, "<Tag/>");
  return (vue.createVNode as (...a: unknown[]) => unknown)(type, ...rest);
}) as typeof vue.createVNode;
export const h = ((type: unknown, ...rest: unknown[]) => {
  noBranch(type, "h(Tag)");
  return (vue.h as (...a: unknown[]) => unknown)(type, ...rest);
}) as typeof vue.h;
// the same under v-if/v-for: the compiler opens a block around the component
export const createBlock = ((type: unknown, ...rest: unknown[]) => {
  noBranch(type, "<Tag/>");
  return (vue.createBlock as (...a: unknown[]) => unknown)(type, ...rest);
}) as typeof vue.createBlock;

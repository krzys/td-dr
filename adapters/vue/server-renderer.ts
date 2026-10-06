// vue/server-renderer for email modules in the email environment (docs/decisions.md §11): the helpers Vue's
// SSR templates call, taking template values. Everything else is Vue's own.
import * as vue from "vue/server-renderer";
import { isSymbolic, isTemplateValue, templateError } from "../template/index.ts";
import { attrValue, attrsValue, classValue, markup, noBranch, pushEach, styleValue, type Push } from "./blocks.ts";

export * from "vue/server-renderer";

export const ssrInterpolate = (v: unknown): string => markup(v);
export const ssrRenderAttr = (key: string, value: unknown): string => vue.ssrRenderAttr(key, attrValue(key, value));
export const ssrRenderDynamicAttr = (key: string, value: unknown, tag?: string): string => vue.ssrRenderDynamicAttr(key, attrValue(key, value), tag);
export const ssrRenderAttrs = (props: Record<string, unknown>, tag?: string): string => vue.ssrRenderAttrs(attrsValue(props), tag);
export const ssrRenderClass = (v: unknown): string => vue.ssrRenderClass(classValue(v));
export const ssrRenderStyle = (v: unknown): string => vue.ssrRenderStyle(styleValue(v) as Parameters<typeof vue.ssrRenderStyle>[0]);
export const ssrIncludeBooleanAttr = (v: unknown): boolean => {
  if (isTemplateValue(v)) throw templateError("a boolean attribute", "is set by a field; the dialects can't add or drop an attribute.", "put v-if / v-else on two copies of the element");
  return vue.ssrIncludeBooleanAttr(v);
};

// the tddr() transform passes the render's stream as a third argument
type RenderItem = Parameters<typeof vue.ssrRenderList>[1];
export const ssrRenderList = (source: unknown, render: RenderItem, push?: Push): void => {
  if (isSymbolic(source)) return pushEach(push, source, render, render as (item: unknown, index: unknown) => void);
  return vue.ssrRenderList(source, render);
};

// a script-setup const that picked its component by a field (<Tag/>) would have .setup called on it
export const ssrRenderComponent = ((type: unknown, ...rest: unknown[]) => {
  noBranch(type, "<Tag/>");
  return (vue.ssrRenderComponent as (...a: unknown[]) => unknown)(type, ...rest);
}) as typeof vue.ssrRenderComponent;

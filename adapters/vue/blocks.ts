import { ssrInterpolate as vueInterpolate } from "vue/server-renderer";
import { branchError } from "../template/branch.ts";
import { attrText, blockParts, condOf, condText, infoOf, isBranch, isEach, isSymbolic, isTemplateValue, loopOver, templateError, textOf } from "../template/index.ts";

export type Push = (s: string) => void;

// what Vue's text interpolation renders as nothing ({{ false }} prints "false")
const empty = (v: unknown): boolean => v === null || v === undefined || v === "";

// {{ }} of a field, a branch or a loop, as markup
export const markup = (v: unknown): string => {
  const info = infoOf(v);
  if (info) return vueInterpolate(textOf(info));
  const parts = blockParts(v, empty);
  if (!parts) return vueInterpolate(v);
  return parts.map((p) => `<${p.tag}${attrText(p.attrs)}>${markup(p.value)}</${p.tag}>`).join("");
};

// v-for (or <Each>) over a field: the body once, inside an each block
export const pushEach = (push: Push | undefined, list: unknown, fn: unknown, run: (item: unknown, index: unknown) => void): void => {
  if (!isSymbolic(list)) throw new Error("tddr: pushEach on a plain list");
  if (!push) throw templateError(textOf(infoOf(list)!), "is looped over where the render can't write blocks.", "loop with v-for in a template, or with <Each>");
  const loop = loopOver(list, fn);
  push(`<tddr-each${attrText({ of: loop.of, as: loop.as })}>`);
  if (!loop.keep) run(loop.item, loop.index);
  else {
    const c = condOf(loop.keep(loop.item));
    if (c.t !== "const") {
      push(`<tddr-if${attrText({ test: condText(c) })}>`);
      run(loop.item, loop.index);
      push("</tddr-if>");
    } else if (c.v) run(loop.item, loop.index);
  }
  push("</tddr-each>");
};

const attrError = (name: string): Error =>
  templateError(`the ${name} attribute`, "depends on a condition or a loop; an attribute holds text.", "put v-if / v-else on two copies of the element");

// a field as its placeholder text; a branch or a loop can't be an attribute
export const attrValue = (name: string, v: unknown): unknown => {
  if (isBranch(v) || isEach(v)) throw attrError(name);
  const info = infoOf(v);
  return info ? textOf(info) : v;
};

export const classValue = (v: unknown): unknown => {
  const plain = attrValue("class", v);
  if (Array.isArray(plain)) return plain.map(classValue);
  if (plain && typeof plain === "object") {
    for (const [name, on] of Object.entries(plain)) {
      if (isTemplateValue(on)) {
        throw templateError(
          `:class="{ ${name}: … }"`,
          "a field switches the class on, and td;dr inlines the stylesheet when it builds, so no rule could follow it.",
          "put v-if / v-else on two copies of the element, each with its own fixed class",
        );
      }
    }
  }
  return plain;
};

export const styleValue = (v: unknown): unknown => {
  const plain = attrValue("style", v);
  if (Array.isArray(plain)) return plain.map(styleValue);
  if (plain && typeof plain === "object") return Object.fromEntries(Object.entries(plain).map(([k, x]) => [k, attrValue(`style ${k}`, x)]));
  return plain;
};

export const attrsValue = (attrs: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, k === "class" ? classValue(v) : k === "style" ? styleValue(v) : attrValue(k, v)]));

// <component :is="cond ? A : B" /> or a const picked that way used as <Tag />: the component
// can't be picked when the ESP fills the data
export const noBranch = (c: unknown, what: string): void => {
  if (isBranch(c)) throw branchError(c, `is used as an element type (${what}); a component can't be picked when the ESP fills the data.`, "branch in the markup instead: v-if / v-else, or <If :when> / <Else>");
};

// @property: registered custom properties and their initial values.
import type { AtRule } from "postcss";
import type { Ctx } from "../ctx.ts";
import type { SrcLoc } from "../loc.ts";
import type { DomElement } from "../parse/dom.ts";
import { offer, offerTo, type Candidate, type Props, type Store } from "./precedence.ts";
import { unsafeDecl } from "./unsafe.ts";

export type Registered = { inherits: boolean; initial: string | undefined };
export type Registry = ReadonlyMap<string, Registered>;

// @property --x { syntax; inherits; initial-value }, or undefined (and a W002) when invalid
export const propertyRule = (node: AtRule, loc: SrcLoc | undefined, ctx: Ctx): [string, Registered] | undefined => {
  const name = node.params.trim();
  const desc = new Map<string, string>();
  node.each((n) => {
    if (n.type === "decl") desc.set(n.prop.toLowerCase(), n.value.trim());
  });
  const syntax = desc.get("syntax")?.replace(/^(["'])(.*)\1$/, "$2").trim();
  const inherits = desc.get("inherits")?.toLowerCase();
  const initial = desc.get("initial-value");
  if (!name.startsWith("--") || !syntax || (inherits !== "true" && inherits !== "false") || (syntax !== "*" && initial === undefined)) {
    ctx.diagnostics.report("W002", {
      message: `@property ${name} is invalid and was ignored`,
      hint: 'It needs syntax and inherits, and an initial-value unless syntax is "*".',
      loc,
    });
    return undefined;
  }
  const unsafe = initial === undefined ? undefined : unsafeDecl(name, initial);
  if (unsafe) {
    ctx.diagnostics.report("I001", { message: `${unsafe.message} in @property; the rule was ignored`, hint: unsafe.hint, loc });
    return undefined;
  }
  return [name, { inherits: inherits === "true", initial }];
};

// Registered properties start at their initial-value, below even the UA sheet so anything
// that sets them wins. A non-inherited one is reset on every element (`everyone`, and the
// pseudo-elements' `extra`); an inherited one is set on the root and inherits from there.
export const offerInitials = (registry: Registry, store: Store, root: DomElement, everyone: () => readonly DomElement[], extra: readonly Props[]): void => {
  const all = [...registry.values()].some((r) => !r.inherits) ? everyone() : [];
  for (const [name, r] of registry) {
    const c: Candidate = { value: r.initial ?? "initial", tier: -1, inline: false, layer: -1, spec: [0, 0, 0], order: -1 };
    if (!r.inherits) {
      for (const el of all) offerTo(store, el, name, c);
      for (const props of extra) offer(props, name, c);
    } else if (r.initial !== undefined) offerTo(store, root, name, c);
  }
};

// `initial` on a registered property means its initial-value, not "unset"
export const registeredKeyword = (registry: Registry, prop: string, value: string): string | undefined => {
  const r = registry.get(prop);
  const kw = value.trim().toLowerCase();
  return r?.initial !== undefined && (kw === "initial" || (kw === "unset" && !r.inherits)) ? r.initial : undefined;
};

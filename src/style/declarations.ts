// One CSS declaration as the cascade offers it: expanded to longhands, viewport units resolved.
import type { Declaration } from "postcss";
import type { Ctx } from "../ctx.ts";
import type { SrcLoc } from "../loc.ts";
import { expandDeclaration } from "./shorthands.ts";
import { hasViewport, liveValue, resolveViewport } from "./units.ts";
import { unsafeDecl } from "./unsafe.ts";

export type Decl = {
  prop: string;
  value: string;
  important: boolean;
  vw: Array<[string, string]>; // viewport tokens and the px they resolved to
  usesVw: boolean;
  textVw: boolean; // a text size written in vw: it can stay vw on phones (docs/support.md#design-width)
};

// vw on these stays live on phones (docs/support.md#design-width)
const TEXT_PROPS = new Set(["font-size", "line-height", "letter-spacing", "word-spacing", "text-indent"]);

// `width`: the design width vw resolves against. `narrow`: the env is below it, where text
// sizes keep the authored vw/clamp() so a media query can carry it.
export type Declare = (n: Declaration, loc: () => SrcLoc | undefined) => Decl[];

export const declarations = (width: number, narrow: boolean, ctx: Ctx): Declare => (n, loc) => {
  // IE hacks (*zoom, _height): postcss moves the prefix into raws, browsers ignore the decl
  if (/[*_#]$/.test(n.raws.before?.trim() ?? "")) return [];
  if (!n.prop.startsWith("--") && !/^-?[a-z][a-z0-9-]*$/i.test(n.prop)) return [];
  let written = n.value.trim();
  if (!written) return [];
  // script and unsafe URLs go in every mode (docs/support.md#sanitizing)
  const unsafe = unsafeDecl(n.prop, written);
  if (unsafe) {
    ctx.diagnostics.report("I001", { message: unsafe.message, hint: unsafe.hint, loc: loc() });
    if (unsafe.value === undefined) return [];
    written = unsafe.value;
  }
  const vw: Array<[string, string]> = [];
  const value = resolveViewport(written, width, (token, px) => vw.push([token, px]));
  const prop = n.prop.startsWith("--") ? n.prop : n.prop.toLowerCase();
  const expanded = prop.startsWith("--") ? [[prop, value] as const] : expandDeclaration(prop, value);
  if (expanded.length === 0) {
    ctx.diagnostics.report("W002", { message: `${prop}: could not parse "${value}"`, loc: loc() });
    return [];
  }
  const usesVw = vw.length > 0;
  // per longhand: `padding: 0 5vw` is not a vw top padding
  const writtenAs = new Map<string, string>(usesVw && !prop.startsWith("--") ? expandDeclaration(prop, written) : []);
  return expanded.map(([p, v]) => {
    const own = writtenAs.get(p);
    const longVw = usesVw && (prop.startsWith("--") || own === undefined || hasViewport(own));
    const textVw = longVw && own !== undefined && TEXT_PROPS.has(p) && hasViewport(own);
    const keep = textVw && narrow;
    return { prop: p, value: keep ? liveValue(p, own!, v) : v.trim(), important: n.important === true, vw: keep ? [] : vw, usesVw: longVw, textVw };
  });
};

// I006 once per distinct viewport length, and only once a declaration lands on something,
// so dead rules stay quiet.
export type ViewportNotes = (d: Decl, loc: SrcLoc | undefined) => void;

export const viewportNotes = (width: number, ctx: Ctx): ViewportNotes => {
  const seen = new Set<string>();
  return (d, loc) => {
    for (const [token, px] of d.vw) {
      if (seen.has(token)) continue;
      seen.add(token);
      ctx.diagnostics.report("I006", { message: `${token} resolved to ${px} at the design width (${width}px)`, loc });
    }
  };
};

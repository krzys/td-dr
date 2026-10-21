// What a screen's rules declare differently on one author element, for an E017 to quote
// (docs/support.md#screens): the author reads the declaration, not the tags it compiled to.
import { locKey, type SrcLoc } from "../loc.ts";
import { joinWithin } from "../diagnostics/shorthand.ts";
import type { StyledElement } from "../style/types.ts";

const SHOWN = 5;
const SIDED = /^([a-z]+(?:-[a-z]+)*?)-(top|right|bottom|left)(-[a-z]+)?$/;
const SIDES = ["top", "right", "bottom", "left"];

// the path from the root to the element at `key`
const pathTo = (el: StyledElement, key: string): StyledElement[] | undefined => {
  if (el.loc && locKey(el.loc) === key) return [el];
  for (const c of el.children) {
    if (c.type !== "element") continue;
    const p = pathTo(c, key);
    if (p) return [el, ...p];
  }
  return undefined;
};
const byLoc = (el: StyledElement, out = new Map<string, StyledElement>()): Map<string, StyledElement> => {
  if (el.loc && !out.has(locKey(el.loc))) out.set(locKey(el.loc), el);
  for (const c of el.children) if (c.type === "element") byLoc(c, out);
  return out;
};

// `border: 0` reaches the cascade as width, style and colour longhands, the colour currentcolor
// computed: said as the shorthand the author wrote, its initial parts left out
const BORDER_PARTS = ["width", "style", "color"];
const borderOf = (now: StyledElement, sides: readonly string[]): string | undefined => {
  const parts = BORDER_PARTS.map((part) => new Set(sides.map((s) => now.declared[`border-${s}-${part}`])));
  if (parts.some((p) => p.size !== 1 || p.has(undefined))) return undefined;
  const [width, style, color] = parts.map((p) => [...p][0]!) as [string, string, string];
  const said = [width === "medium" ? "" : width, style === "none" ? "" : style, color === now.style["color"] ? "" : color].filter(Boolean);
  return said.join(" ") || "none";
};
const foldBorders = (now: StyledElement, props: readonly string[]): string[] => {
  const decls = props.map((p) => `${p}: ${now.declared[p]}`);
  const fold = (name: string, sides: readonly string[]): boolean => {
    const longhands = sides.flatMap((s) => BORDER_PARTS.map((part) => `border-${s}-${part}`));
    const at = longhands.map((l) => props.indexOf(l)).filter((i) => i >= 0);
    const value = at.length > 0 ? borderOf(now, sides) : undefined;
    if (value === undefined) return false;
    at.forEach((i, k) => (decls[i] = k === 0 ? `${name}: ${value}` : ""));
    return true;
  };
  if (!fold("border", SIDES)) for (const s of SIDES) fold(`border-${s}`, [s]);
  return decls.filter(Boolean);
};

// "{ writing-mode: horizontal-tb; border-width: 0 }": a side's longhands next to each other, top
// first, so the four of them read as their shorthand
const declarations = (was: StyledElement, now: StyledElement): string | undefined => {
  const props = Object.keys(now.declared).filter((p) => now.declared[p] !== was.declared[p]);
  if (props.length === 0) return undefined;
  const family = (p: string): string => {
    const m = SIDED.exec(p);
    return m ? m[1]! + (m[3] ?? "") : p;
  };
  const first = new Map<string, number>();
  props.forEach((p, i) => first.has(family(p)) || first.set(family(p), i));
  const side = (p: string): number => SIDES.indexOf(SIDED.exec(p)?.[2] ?? "");
  props.sort((a, b) => first.get(family(a))! - first.get(family(b))! || side(a) - side(b));
  const decls = joinWithin(foldBorders(now, props).join("; ")).split("; ");
  return `{ ${decls.slice(0, SHOWN).join("; ")}${decls.length > SHOWN ? "; …" : ""} }`;
};

// The element at `loc`, else the nearest one inside it, else around it, that the screen declares
// something new on: "this <p> with { … }", "the <div> at line 4, column 3 with { … }".
export const changedAt = (base: StyledElement, screen: StyledElement, loc: SrcLoc): string | undefined => {
  const path = pathTo(base, locKey(loc));
  if (!path) return undefined;
  const there = byLoc(screen);
  const inside: StyledElement[] = [];
  for (let queue = [path.at(-1)!]; queue.length > 0; ) {
    inside.push(...queue);
    queue = queue.flatMap((el) => el.children.filter((c) => c.type === "element"));
  }
  for (const was of [...inside, ...path.slice(0, -1).reverse()]) {
    const now = was.loc && there.get(locKey(was.loc));
    const decls = now && declarations(was, now);
    if (!decls) continue;
    const which = was.loc!.line === loc.line && was.loc!.col === loc.col ? `this <${was.tag}>` : `the <${was.tag}> at line ${was.loc!.line}, column ${was.loc!.col}`;
    return `${which} with ${decls}`;
  }
  return undefined;
};

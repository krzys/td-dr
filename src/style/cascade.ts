// The cascade as a query over a parsed doc it never changes: rules are collected and matched,
// every declaration is offered to what it lands on, the winners resolved per element.
import type { Ctx } from "../ctx.ts";
import { findAllElements, isElement, type DomElement } from "../parse/dom.ts";
import type { ParsedDoc } from "../parse/html.ts";
import { conditionsOf } from "./conditions.ts";
import { declarations, viewportNotes } from "./declarations.ts";
import { directionFrom, directions, physical, reportDirAuto } from "./direction.ts";
import { styleAttributes, type InlineDecls } from "./inline.ts";
import { selectIn } from "./match.ts";
import { offerTo, type Candidate, type Props, type Store } from "./precedence.ts";
import { literalContent, pseudoDecisions, type PseudoSide, type PseudoWon } from "./pseudo.ts";
import { offerInitials, registeredKeyword, type Registry } from "./registered.ts";
import { collectRules, type Block } from "./rules.ts";
import type { Direction } from "./shorthands.ts";
import type { Cascaded, Conditions, Env, FontRules } from "./types.ts";
import { UA_CSS } from "./ua.ts";

export type CascadeResult = (el: DomElement) => Cascaded;

// A static ::before / ::after the cascade decided to show: new text at the start or end of
// `host`, wrapped in `tag`, styled from the pseudo rules (src/style/materialize.ts builds it).
export type PseudoElement = {
  host: DomElement;
  side: PseudoSide;
  text: string;
  tag: "span" | "div";
  cascaded: Cascaded;
  vw: ReadonlySet<string>;
};

export type CascadeOutput = {
  styleOf: CascadeResult;
  vwOf: (el: DomElement) => ReadonlySet<string>; // props whose winning value used a viewport unit
  pseudoOf: (host: DomElement) => readonly PseudoElement[]; // ::before first
  conditions: Conditions;
  fonts: FontRules;
};

type Won = { elements: Store } & PseudoWon;

// Every declaration offered to what it lands on, sheets in source order, then style="".
const offerAll = (blocks: readonly Block[], inline: readonly InlineDecls[], order: number): Won => {
  const elements: Store = new Map();
  const props: Record<PseudoSide, Store> = { before: new Map(), after: new Map() };
  const literal: Record<PseudoSide, Set<DomElement>> = { before: new Set(), after: new Set() };
  for (const b of blocks) {
    for (const sel of b.sels) {
      for (const d of b.decls) {
        const c: Candidate = { value: d.value, tier: d.important ? 2 : b.tier, inline: false, layer: b.layer, spec: sel.spec, order: d.order, ...(d.usesVw && { vw: true as const }) };
        if (sel.pseudo && d.prop === "content") {
          c.from = { selector: sel.match, loc: d.loc };
          if (literalContent(d.value) !== undefined) for (const el of sel.hits) literal[sel.pseudo].add(el);
        }
        for (const el of sel.hits) offerTo(sel.pseudo ? props[sel.pseudo] : elements, el, d.prop, c);
      }
    }
  }
  for (const { el, decls } of inline) {
    for (const d of decls) offerTo(elements, el, d.prop, { value: d.value, tier: d.important ? 2 : 1, inline: true, layer: -1, spec: [0, 0, 0], order: order++, ...(d.usesVw && { vw: true as const }) });
  }
  return { elements, props, literal };
};

const resolve = (props: Props | undefined, dir: () => Direction, attr: string | undefined, registry: Registry): Cascaded => {
  const values: Record<string, string> = {};
  const authored = new Set<string>();
  for (const [prop, c] of physical(props, dir)) {
    values[prop] = registeredKeyword(registry, prop, c.value) ?? c.value;
    if (c.tier === 1 || c.tier === 2) authored.add(prop);
  }
  // dir is a presentational hint (UA tier): it sets direction unless the author did
  if (!props?.has("direction") && (attr === "ltr" || attr === "rtl")) values["direction"] = attr;
  return { values, authored };
};

// the flag belongs to the value that won
const vwIn = (props: Props | undefined, dir: () => Direction): ReadonlySet<string> => {
  const out = new Set<string>();
  for (const [name, c] of physical(props, dir)) if (c.vw) out.add(name);
  return out;
};

export const cascade = (doc: ParsedDoc, ctx: Ctx, env: Env): CascadeOutput => {
  const width = ctx.options.width;
  const declare = declarations(width, env.viewport < width, ctx);
  const notes = viewportNotes(width, ctx);
  const sheets = [{ css: UA_CSS, tier: 0, origin: undefined }, ...doc.styles.map((s) => ({ css: s.css, tier: 1, origin: s.loc }))];
  const rules = collectRules(sheets, { env, designWidth: width, select: selectIn(doc), declare, notes, ctx });
  const inline = styleAttributes(doc, declare, notes, ctx);
  reportDirAuto(doc, ctx);

  const won = offerAll(rules.blocks, inline.found, rules.order);
  const shown = pseudoDecisions(won, won.elements, ctx);
  const root = doc.body.parent && isElement(doc.body.parent) ? doc.body.parent : doc.body;
  offerInitials(rules.registered, won.elements, root, () => findAllElements(doc.document, () => true), shown.map((p) => p.props));

  const directionOf = directions(won.elements);
  const pseudo = new Map<DomElement, PseudoElement[]>();
  for (const { host, side, text, tag, props } of shown) {
    const dir = () => directionFrom(props, undefined, () => directionOf(host));
    const p: PseudoElement = { host, side, text, tag, cascaded: resolve(props, dir, undefined, rules.registered), vw: vwIn(props, dir) };
    const list = pseudo.get(host);
    if (!list) pseudo.set(host, [p]);
    else if (side === "before") list.unshift(p);
    else list.push(p);
  }

  return {
    // el?: a caller may ask about an element the page doesn't have
    styleOf: (el) => resolve(won.elements.get(el), () => directionOf(el), el?.attribs["dir"]?.toLowerCase(), rules.registered),
    vwOf: (el) => vwIn(won.elements.get(el), () => directionOf(el)),
    pseudoOf: (host) => pseudo.get(host) ?? [],
    conditions: conditionsOf(rules.queries, { dark: rules.dark, hover: rules.hover, liveText: rules.liveText || inline.liveText }, width),
    fonts: rules.fonts,
  };
};

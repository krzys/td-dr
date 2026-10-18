// Where in the environment space a rule applies, and which environments the author's rules
// tell apart (docs/support.md#screens). The cascade evaluates against one Env; the variants come from here.
import type { Ctx } from "../ctx.ts";
import type { SrcLoc } from "../loc.ts";
import { canMatch, matchesList, parseMedia, rangesOf, wantsDark, type MediaQuery } from "./media.ts";
import type { Conditions, Env } from "./types.ts";

// What the enclosing @media rules (and a :hover parent) say.
export type EnvScope = {
  live: boolean; // they hold in this env
  possible: boolean; // some env could satisfy them
  below: boolean; // they can hold below the design width
  hover: boolean; // inside a :hover rule that lands on something
  dark: boolean; // one of them asks for dark mode
  width: boolean; // they mention a width feature
  scheme: boolean; // they mention prefers-color-scheme (variants never combine the two)
};

export const TOP: EnvScope = { live: true, possible: true, below: true, hover: false, dark: false, width: false, scheme: false };

// The queries of an @media prelude that can apply inside `scope`; the others are reported.
export const usableQueries = (params: string, scope: EnvScope, loc: SrcLoc | undefined, ctx: Ctx): MediaQuery[] => {
  const queries = parseMedia(params);
  for (const q of queries) {
    if (q.unsupported === undefined) continue;
    ctx.diagnostics.report("W001", {
      message: `@media ${q.unsupported} is not applied: only width and prefers-color-scheme queries are`,
      hint: "Width and prefers-color-scheme queries become head styles; others (height, orientation, hover, print…) have no email equivalent, and a width query can't be combined with prefers-color-scheme yet.",
      loc,
    });
  }
  const ok: MediaQuery[] = [];
  let clash: string | undefined;
  for (const q of queries) {
    if (q.unsupported !== undefined) continue;
    if ((scope.scheme && q.width) || (scope.width && q.scheme !== undefined)) {
      clash ??= "(prefers-color-scheme) with a width query, nested, is not applied: only width and prefers-color-scheme queries are, and not together";
      continue;
    }
    if (scope.hover && (q.width || q.scheme !== undefined)) {
      clash ??= "inside a :hover rule is not applied: hover can't be combined with a width or prefers-color-scheme query";
      continue;
    }
    ok.push(q);
  }
  if (clash !== undefined) {
    ctx.diagnostics.report("W001", {
      message: `@media ${clash}`,
      hint: "Width and prefers-color-scheme queries are separate head styles, and hover is another; don't nest or combine them.",
      loc,
    });
  }
  return ok;
};

export const inMedia = (ok: readonly MediaQuery[], scope: EnvScope, env: Env, designWidth: number): EnvScope => ({
  ...scope,
  live: scope.live && matchesList(ok, env),
  // a list that can never match (print…) must not ask for variant compiles
  possible: scope.possible && ok.some(canMatch),
  // a rule that only applies at or above the design width never needs the phone variant
  below: scope.below && ok.some((q) => q.not || !q.width || q.lo < designWidth),
  dark: scope.dark || ok.some(wantsDark),
  width: scope.width || ok.some((q) => q.width),
  scheme: scope.scheme || ok.some((q) => q.scheme !== undefined),
});

// Hover styles are their own head rules, so they can't sit inside a width or scheme query.
export const hoverCombined = (scope: EnvScope): boolean => scope.width || scope.scheme;
export const asksDark = (scope: EnvScope): boolean => scope.possible && scope.dark;
// vw text below the design width needs a range of its own that ends at the design width
export const keepsTextLive = (scope: EnvScope): boolean => scope.below && (scope.live || scope.possible);

// `queries`: the width queries some env can satisfy, in source order.
export const conditionsOf = (queries: readonly MediaQuery[], seen: { dark: boolean; hover: boolean; liveText: boolean }, designWidth: number): Conditions => ({
  ranges: rangesOf(queries, seen.liveText ? designWidth : undefined),
  dark: seen.dark,
  hover: seen.hover,
});

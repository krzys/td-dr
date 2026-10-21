import { DESKTOP, type Conditions, type Env } from "../style/types.ts";

// One screen the author's rules tell apart from the desktop one, and how its rules are written.
export type Variant = {
  kind: "width" | "dark" | "hover";
  label: string; // for messages: "max-width 600px"
  env: Env;
  range?: { min: number; max: number }; // a width screen's, both ends in
  media?: string; // the @media prelude; hover rules have none
};

const range = ({ min, max }: { min: number; max: number }): Variant => ({
  kind: "width",
  label: min === 0 ? `max-width ${max}px` : `min-width ${min}px and max-width ${max}px`,
  env: { ...DESKTOP, viewport: max },
  range: { min, max },
  media: `@media screen and ${min === 0 ? "" : `(min-width:${min}px) and `}(max-width:${max}px)`,
});

// Rule order in the head: widths widest first (as `ranges` comes), then dark, then hover.
export const variantsOf = ({ ranges, dark, hover }: Conditions): Variant[] => [
  ...ranges.map(range),
  ...(dark ? [{ kind: "dark" as const, label: "dark mode", env: { ...DESKTOP, dark: true }, media: "@media (prefers-color-scheme: dark)" }] : []),
  ...(hover ? [{ kind: "hover" as const, label: ":hover", env: { ...DESKTOP, hover: true } }] : []),
];

// Width screens side by side as the breakpoints the author wrote: the design-width split makes
// [0,599] and [600,600] of one max-width 600px (docs/support.md#screens).
const joined = (vs: readonly Variant[]): { min: number; max: number }[] => {
  const out: { min: number; max: number }[] = [];
  for (const r of vs.flatMap((v) => (v.range ? [v.range] : [])).sort((a, b) => a.min - b.min)) {
    const last = out.at(-1);
    if (last && r.min <= last.max + 1) last.max = Math.max(last.max, r.max);
    else out.push({ ...r });
  }
  return out;
};
const others = (vs: readonly Variant[]): string[] => [...new Set(vs.filter((v) => v.kind !== "width").map((v) => v.label))];

// "max-width 600px", "dark mode": what the rules of these screens are called in a message
export const labelOf = (vs: readonly Variant[]): string =>
  [...joined(vs).map(({ min, max }) => (min === 0 ? `max-width ${max}px` : `min-width ${min}px and max-width ${max}px`)), ...others(vs)].join(" and the ");

// "At 600px and below", "In dark mode": the screens a diagnostic is said on, to lead its message
export const scopeOf = (vs: readonly Variant[]): string => {
  const widths = joined(vs).map(({ min, max }) => (min === 0 ? `${max}px and below` : min === max ? `${max}px` : `${min}–${max}px`));
  const rest = others(vs).map((l) => (l === "dark mode" ? "in dark mode" : `on ${l}`));
  const said = [...(widths.length > 0 ? [`at ${widths.join(" and ")}`] : []), ...rest].join(", ");
  return said.charAt(0).toUpperCase() + said.slice(1);
};

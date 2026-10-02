import { DESKTOP, type Conditions, type Env } from "../style/types.ts";

// One screen the author's rules tell apart from the desktop one, and how its rules are written.
export type Variant = {
  kind: "width" | "dark" | "hover";
  label: string; // for messages: "max-width 600px"
  env: Env;
  media?: string; // the @media prelude; hover rules have none
};

const range = ({ min, max }: { min: number; max: number }): Variant => ({
  kind: "width",
  label: min === 0 ? `max-width ${max}px` : `min-width ${min}px and max-width ${max}px`,
  env: { ...DESKTOP, viewport: max },
  media: `@media screen and ${min === 0 ? "" : `(min-width:${min}px) and `}(max-width:${max}px)`,
});

// Rule order in the head: widths widest first (as `ranges` comes), then dark, then hover.
export const variantsOf = ({ ranges, dark, hover }: Conditions): Variant[] => [
  ...ranges.map(range),
  ...(dark ? [{ kind: "dark" as const, label: "dark mode", env: { ...DESKTOP, dark: true }, media: "@media (prefers-color-scheme: dark)" }] : []),
  ...(hover ? [{ kind: "hover" as const, label: ":hover", env: { ...DESKTOP, hover: true } }] : []),
];

// A CSS length as the box model can carry it: px (or a unitless 0), a percentage, or nothing usable.
export type Len = { px: number } | { pct: number } | undefined;

// An unset value is 0px.
export const parseLen = (v: string | undefined): Len => {
  if (v === undefined) return { px: 0 };
  const n = Number.parseFloat(v);
  if (!Number.isFinite(n)) return undefined;
  if (v.endsWith("%")) return { pct: n };
  if (v.endsWith("px") || n === 0) return { px: n };
  return undefined;
};

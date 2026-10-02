import { elementKey } from "../style/computed.ts";
import type { StyledElement } from "../style/types.ts";

// Elements that are display:none in some screens and shown in others, by source position, with the
// display they have where they show. Every compile keeps them (hidden where they are none), so the
// emitted structure is the same everywhere.
export const shownElsewhere = (bodies: readonly StyledElement[]): Map<string, string> => {
  const shown = new Map<string, string>();
  const hidden = new Set<string>();
  const walk = (el: StyledElement): void => {
    const key = elementKey(el.loc);
    if (key !== undefined) {
      const display = el.style["display"] ?? "inline";
      if (display === "none") hidden.add(key);
      else if (!shown.has(key)) shown.set(key, display);
    }
    for (const c of el.children) if (c.type === "element") walk(c);
  };
  bodies.forEach(walk);
  return new Map([...shown].filter(([key]) => hidden.has(key)));
};

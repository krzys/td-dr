import type { Check } from "./walk.ts";

// I015: the shell writes the source's <title>, empty when it has none.
export const title: Check = (body, ctx, doc) => {
  if (doc?.untitled) ctx.diagnostics.report("I015", { loc: body.loc });
};

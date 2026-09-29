import type { Check } from "./walk.ts";

// I009: the shell writes lang="en" when the source set none.
export const lang: Check = (body, ctx, doc) => {
  if (doc && doc.lang === undefined) ctx.diagnostics.report("I009", { loc: body.loc });
};

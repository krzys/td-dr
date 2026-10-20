import type { Ctx } from "../ctx.ts";
import { dropDeadClasses } from "./dead-classes.ts";
import { selfLint } from "./self-lint.ts";

// The size checks (Gmail's clip, head-style bytes) and the line wrap (wrap.ts) run in pipeline.ts on
// the final string.
export const post = (html: string, ctx: Ctx): string => {
  const out = dropDeadClasses(html);
  selfLint(out, ctx);
  return out;
};

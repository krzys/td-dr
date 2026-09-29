import type { Ctx } from "../ctx.ts";
import type { StyledElement } from "../style/types.ts";
import { altText } from "./alt-text.ts";
import { contrast } from "./contrast.ts";
import { darkDesign } from "./dark-design.ts";
import { headings } from "./headings.ts";
import { lang } from "./lang.ts";
import { linkName } from "./link-name.ts";
import { linkText } from "./link-text.ts";
import { smallText } from "./small-text.ts";
import { transparentImage } from "./transparent-image.ts";
import type { Check, LintDoc } from "./walk.ts";

export type { LintDoc } from "./walk.ts";

// Accessibility and forced-dark-mode advice on the styled input. Warnings and infos only; the output is untouched.
const checks: readonly Check[] = [lang, linkName, contrast, linkText, headings, altText, smallText, transparentImage, darkDesign];

export const lintAccessibility = (body: StyledElement, ctx: Ctx, doc?: LintDoc): void => {
  for (const check of checks) check(body, ctx, doc);
};

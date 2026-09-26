// First match wins.
import type { Rule } from "./rule.ts";
import { blockRule } from "./rules/block.ts";
import { buttonRule } from "./rules/button.ts";
import { flexRule } from "./rules/flex.ts";
import { gridRule } from "./rules/grid.ts";
import { tableDisplayRule } from "./rules/table-display.ts";
import { hintRule } from "./rules/hint.ts";
import { imageRule } from "./rules/image.ts";
import { inlineRule } from "./rules/inline.ts";
import { templateRule } from "./rules/template.ts";
import { unsupportedRule } from "./rules/unsupported.ts";

export const rules: readonly Rule[] = [templateRule, hintRule, unsupportedRule, imageRule, buttonRule, gridRule, tableDisplayRule, flexRule, blockRule, inlineRule];

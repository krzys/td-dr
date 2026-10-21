// react/jsx-runtime for email modules in the email environment (docs/templates.md#native-component-code)
import { Fragment, jsx as reactJsx, jsxs as reactJsxs } from "react/jsx-runtime";
import { prepare, type Make } from "./blocks.ts";

export { Fragment };
export const jsx = (type: unknown, config: Record<string, unknown>, key?: unknown) => prepare(reactJsx as Make, type, config, key);
export const jsxs = (type: unknown, config: Record<string, unknown>, key?: unknown) => prepare(reactJsxs as Make, type, config, key);

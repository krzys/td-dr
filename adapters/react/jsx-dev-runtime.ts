// react/jsx-dev-runtime for email modules in the email environment (docs/decisions.md §11)
import { Fragment, jsxDEV as reactJsxDEV } from "react/jsx-dev-runtime";
import { prepare, type Make } from "./blocks.ts";

export { Fragment };
export const jsxDEV = (type: unknown, config: Record<string, unknown>, key: unknown, isStatic: boolean, source: unknown, self: unknown) =>
  prepare(((t, c, k) => reactJsxDEV(t as never, c, k as string, isStatic, source as never, self)) as Make, type, config, key);

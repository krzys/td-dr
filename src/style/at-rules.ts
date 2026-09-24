// The at-rules that hold no style rules for the cascade to walk.
import type { AtRule } from "postcss";
import type { Ctx } from "../ctx.ts";
import type { SrcLoc } from "../loc.ts";
import { importUrl, isFontHost } from "../parse/font-hosts.ts";
import { evalSupports } from "./supports.ts";

// Nothing to cascade in these, so no warning either.
const SILENT = new Set(["charset", "page", "namespace"]);
export const isSilent = (name: string): boolean => SILENT.has(name) || /^(-\w+-)?keyframes$/.test(name);

// A face under @media keeps its query; under a false @supports the walk never gets here.
export const fontFace = (node: AtRule): string => {
  let face = node.toString();
  // a true @supports or @layer between is dropped, the @media outside it still wraps
  for (let p = node.parent; p?.type === "atrule"; p = p.parent) {
    if ((p as AtRule).name.toLowerCase() === "media") face = `@media ${(p as AtRule).params}{${face}}`;
  }
  return face;
};

// browsers only honour @import before every rule except @charset and other @imports
const importIsFirst = (node: AtRule): boolean => {
  if (node.parent?.type !== "root") return false;
  for (let p = node.prev(); p; p = p.prev()) {
    if (p.type === "comment") continue;
    if (p.type === "atrule" && (["charset", "import"].includes(p.name.toLowerCase()) || (p.name.toLowerCase() === "layer" && !p.nodes))) continue;
    return false;
  }
  return true;
};

// The @import text to keep in the head, or undefined (with a W001) when it isn't a usable font import.
export const fontImport = (node: AtRule, loc: SrcLoc | undefined, ctx: Ctx): string | undefined => {
  const url = importUrl(node.params);
  if (!isFontHost(url)) {
    ctx.diagnostics.report("W001", { message: `External stylesheet ${url || node.params.trim()} is not fetched`, hint: "Inline it in a <style> block or pass it through the css option.", loc });
  } else if (node.parent?.type !== "root") {
    ctx.diagnostics.report("W001", {
      message: `@import ${node.params.trim()} inside @layer/@supports is invalid CSS; it was dropped`,
      hint: "Move the @import to the top of its <style> block.",
      loc,
    });
  } else if (!importIsFirst(node)) {
    ctx.diagnostics.report("W001", {
      message: `@import ${node.params.trim()} comes after other rules, so browsers ignore it; it was dropped`,
      hint: "Move the @import to the top of its <style> block, before any other rule.",
      loc,
    });
  } else return node.toString();
  return undefined;
};

// Whether the rules inside an @supports apply; what can't be decided is skipped with a warning.
export const supportsHolds = (node: AtRule, loc: SrcLoc | undefined, canInline: (selector: string) => boolean, ctx: Ctx): boolean => {
  const v = evalSupports(node.params, canInline);
  if (v === null) {
    ctx.diagnostics.report("W002", { message: `@supports condition "${node.params}" could not be parsed; its rules were skipped`, loc });
  } else if (v === undefined) {
    ctx.diagnostics.report("W001", {
      message: `@supports ${node.params} can't be decided for email; its rules were skipped`,
      hint: "td;dr answers @supports for what the email can rely on (colour functions, flex, grid, gap; vendor checks are false). Move the rules out if they should apply.",
      loc,
    });
  }
  return v === true;
};

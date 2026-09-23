import { parse as parse5 } from "parse5";
import { adapter } from "parse5-htmlparser2-tree-adapter";
import { isFontHost } from "./font-hosts.ts";
import type { Ctx } from "../ctx.ts";
import type { SrcLoc } from "../loc.ts";
import { findAllElements, findElement, locOf, textContent, type DomDocument, type DomElement } from "./dom.ts";

// `loc` is where `css` starts in the input.
export type StyleSource = { css: string; origin: "author" | "extra"; loc?: SrcLoc };

// preheader: text of the data-email="preheader" elements, which sanitize takes out of the body
export type DocMeta = { lang?: string; dir?: string; title?: string; preheader?: string; fontLinks?: string[] }; // fontLinks: stylesheet hrefs of web font <link>s

export type ParsedDoc = {
  document: DomDocument;
  body: DomElement;
  styles: StyleSource[]; // <style> blocks in order, then options.css
  meta: DocMeta;
};

// Takes a full document or just body content.
export const parse = (html: string, ctx: Ctx): ParsedDoc => {
  const document = parse5(html, { treeAdapter: adapter, sourceCodeLocationInfo: true });
  const body = findElement(document, (el) => el.name === "body");
  if (!body) throw new Error("parse5 always creates <body>; not found");

  const styles: StyleSource[] = findAllElements(document, (el) => el.name === "style").flatMap((el) => {
    const media = el.attribs["media"]?.trim().toLowerCase();
    if (media && !/^(all|screen)\b/.test(media)) {
      ctx.diagnostics.report("W001", { message: `<style media="${media}"> is not for screens and was ignored`, loc: locOf(el) });
      return [];
    }
    const start = el.sourceCodeLocation?.startTag;
    const src: StyleSource = { css: textContent(el), origin: "author" };
    if (start) src.loc = { line: start.endLine, col: start.endCol };
    return [src];
  });
  for (const css of ctx.options.css) styles.push({ css, origin: "extra" });
  const meta: DocMeta = {};
  for (const link of findAllElements(document, (el) => el.name === "link" && /\bstylesheet\b/i.test(el.attribs["rel"] ?? ""))) {
    const href = link.attribs["href"] ?? "";
    if (isFontHost(href)) {
      (meta.fontLinks ??= []).push(href);
      const extra = Object.keys(link.attribs).filter((a) => !["rel", "href", "type"].includes(a));
      if (extra.length > 0) {
        ctx.diagnostics.report("W001", {
          message: `Font link ${href} has ${extra.join(", ")}, which td;dr doesn't keep; it loads unconditionally`,
          hint: "Only rel and href are written to the output (type is dropped too).",
          loc: locOf(link),
        });
      }
    } else {
      ctx.diagnostics.report("W001", { message: `External stylesheet ${href} is not fetched`, hint: "Inline it in a <style> block or pass it through the css option.", loc: locOf(link) });
    }
  }

  const htmlEl = findElement(document, (el) => el.name === "html");
  const title = findElement(document, (el) => el.name === "title");
  if (htmlEl?.attribs["lang"]) meta.lang = htmlEl.attribs["lang"];
  if (htmlEl?.attribs["dir"]) meta.dir = htmlEl.attribs["dir"];
  if (title) meta.title = textContent(title).trim();

  return { document, body, styles, meta };
};

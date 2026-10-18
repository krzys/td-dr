// style="" declarations.
import postcss, { CssSyntaxError } from "postcss";
import type { Ctx } from "../ctx.ts";
import { findAllElements, locOf, type DomElement } from "../parse/dom.ts";
import type { ParsedDoc } from "../parse/html.ts";
import type { Decl, Declare, ViewportNotes } from "./declarations.ts";

export type InlineDecls = { el: DomElement; decls: Decl[] };

// In document order. `liveText`: one of them is vw text (docs/support.md#design-width).
export const styleAttributes = (doc: ParsedDoc, declare: Declare, notes: ViewportNotes, ctx: Ctx): { found: InlineDecls[]; liveText: boolean } => {
  const found: InlineDecls[] = [];
  let liveText = false;
  for (const el of findAllElements(doc.document, (e) => e.attribs["style"] !== undefined)) {
    let root;
    try {
      root = postcss.parse(`a{${el.attribs["style"]}}`);
    } catch (err) {
      ctx.diagnostics.report("W002", { message: err instanceof CssSyntaxError ? `CSS syntax error in style attribute: ${err.reason}` : undefined, loc: locOf(el) });
      continue;
    }
    const rule = root.first;
    if (root.nodes.length !== 1 || rule?.type !== "rule") {
      ctx.diagnostics.report("W002", { message: "Malformed style attribute was ignored", loc: locOf(el) });
      continue;
    }
    const decls: Decl[] = [];
    rule.each((n) => {
      if (n.type === "rule" || n.type === "atrule") {
        ctx.diagnostics.report("W001", { message: "Rules inside a style attribute are not supported and were skipped", loc: locOf(el) });
      } else if (n.type === "decl") {
        for (const d of declare(n, () => locOf(el))) {
          notes(d, locOf(el));
          if (d.textVw) liveText = true;
          decls.push(d);
        }
      }
    });
    found.push({ el, decls });
  }
  return { found, liveText };
};

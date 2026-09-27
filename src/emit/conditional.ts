// Markup only some readers get: Outlook conditionals, and the ESP's blocks.
import type { ConditionalNode, Node, TemplateNode } from "../ir/index.ts";
import { blockClose, blockOpen } from "../template/tokens.ts";
import type { EmitContext } from "./context.ts";
import { ifNotMso, msoOnly, resolveInlineMso } from "./mso.ts";
import { isNothing } from "./plan.ts";

export const conditional = (e: EmitContext, n: ConditionalNode, html: string): string =>
  n.target === "mso"
    ? msoOnly(html, (c) =>
        e.ctx.diagnostics.report("W001", {
          message: `[if ${c}] inside an Outlook-only block is dropped`,
          hint: "Version-specific conditionals can't nest in another one; split them into separate blocks.",
          loc: n.loc,
        }),
      )
    : ifNotMso(html);

// The ESP's block around what is emitted for one repetition, or around each branch of a chain:
// every branch sits in the same slot (docs/templates.md).
export const templated = (n: TemplateNode, emit: (child: Node) => string): string => {
  if (n.op === "each") return `${blockOpen(n)}\n${emit(n.child)}\n${blockClose("each")}`;
  const body = (c: Node): string => (isNothing(c) ? "" : `${emit(c)}\n`);
  const branches = n.branches.map((b, i) => `${blockOpen({ op: i ? "elseif" : "if", when: b.when })}\n${body(b.child)}`);
  if (n.otherwise) branches.push(`${blockOpen({ op: "else" })}\n${body(n.otherwise)}`);
  return `${branches.join("")}${blockClose("if")}`;
};

// The analyzer's outlook-only text elements, as conditionals.
export const inlineMso = (e: EmitContext, html: string): string =>
  resolveInlineMso(html, (c) =>
    e.ctx.diagnostics.report("W001", {
      message: `[if ${c}] inside an Outlook-only element is dropped`,
      hint: "Version-specific conditionals can't nest in another one; split them into separate blocks.",
    }),
  );

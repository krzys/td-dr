import type { Ctx } from "../../ctx.ts";
import { emptyBox, withLoc, type Branch, type Node } from "../../ir/index.ts";
import { get, isInherited } from "../../style/props.ts";
import type { ComputedStyle, StyledComment, StyledElement, StyledNode } from "../../style/types.ts";
import { CHAIN_TAG, GROUP_TAG, WHEN_ATTR } from "../../template/chain.ts";
import { isProblem, parseCond } from "../../template/cond.ts";
import { hasTemplateAttrs, readBlocks, TEMPLATE_ATTRS, type Block } from "../../template/hints.ts";
import { MARKER_DATA } from "../../template/tokens.ts";
import { isBlank } from "../children.ts";
import { isInlineLevel, isPassThrough } from "../classify.ts";
import type { Rule } from "../rule.ts";

const withoutTemplateAttrs = (el: StyledElement): StyledElement => {
  const attrs = Object.fromEntries(Object.entries(el.attrs).filter(([k]) => !(TEMPLATE_ATTRS as readonly string[]).includes(k)));
  return { ...el, attrs };
};

// Rows and grids lay their items out as columns: their widths can't depend on data the ESP fills in.
const isRow = (s: ComputedStyle | undefined): boolean => {
  if (!s) return false;
  const d = get(s, "display");
  if (d === "grid" || d === "inline-grid") return true;
  return (d === "flex" || d === "inline-flex") && !/^column/.test(get(s, "flex-direction") ?? "row");
};

const isColumn = (s: ComputedStyle): boolean => /flex/.test(get(s, "display") ?? "") && !isRow(s);

const isMarker = (n: StyledNode): n is StyledComment => n.type === "comment" && MARKER_DATA.test(n.data);
const isText = (n: StyledNode): boolean => n.type === "text" && !isBlank(n);

const node = (b: Block, child: Node): Node =>
  b.op === "each" ? { kind: "template", op: "each", path: b.path, ...(b.as !== undefined ? { as: b.as } : {}), child } : { kind: "template", op: "if", branches: [{ when: b.when, child }] };

// A block sanitize marked (docs/templates.md): the markers, and what sits between them per branch.
type Marked = { op: "each" | "if"; nodes: StyledNode[]; open: StyledComment; arg: string; branches: { when?: string; body: StyledNode[] }[] };
type Item = StyledNode | Marked;
const isMarked = (i: Item): i is Marked => "nodes" in i;

const split = (kids: readonly StyledNode[]): Item[] => {
  const out: Item[] = [];
  for (let i = 0; i < kids.length; i++) {
    const n = kids[i]!;
    if (!isMarker(n)) {
      out.push(n);
      continue;
    }
    const [, closing, op, arg = ""] = MARKER_DATA.exec(n.data)!;
    // sanitize writes them in pairs; a stray one would only loop here, so it goes
    if (closing || (op !== "each" && op !== "if")) continue;
    const branches: Marked["branches"] = [op === "if" ? { when: arg, body: [] } : { body: [] }];
    let depth = 1;
    let j = i + 1;
    for (; j < kids.length; j++) {
      const k = kids[j]!;
      const m = isMarker(k) ? MARKER_DATA.exec(k.data)! : undefined;
      if (m?.[1]) depth--;
      else if (m?.[2] === "each" || m?.[2] === "if") depth++;
      if (depth === 0) break;
      if (depth === 1 && (m?.[2] === "elseif" || m?.[2] === "else")) branches.push(m[2] === "else" ? { body: [] } : { when: m[3] ?? "", body: [] });
      else branches.at(-1)!.body.push(k);
    }
    out.push({ op: op as "each" | "if", nodes: kids.slice(i, j + 1), open: n, arg, branches });
    i = j;
  }
  return out;
};

const inherited = (s: ComputedStyle): Record<string, string> => Object.fromEntries(Object.entries(s).filter(([p]) => isInherited(p)));

// A group lays its children out the way the parent would have: they are its children in the source.
const group = (parent: StyledElement, children: StyledNode[], inline: boolean, attrs: Record<string, string>, at: StyledComment): StyledElement => {
  const s = parent.style;
  const layout: Record<string, string> = inline ? { display: "inline" } : isColumn(s) ? { display: "flex", "flex-direction": "column" } : { display: "block" };
  if (!inline && isColumn(s)) for (const p of ["row-gap", "column-gap", "align-items"]) if (s[p] !== undefined) layout[p] = s[p];
  return { type: "element", tag: GROUP_TAG, attrs, style: { ...inherited(s), ...layout }, declared: {}, children, parentStyle: s, ...(at.loc ? { loc: at.loc } : {}) };
};

const inlineContent = (m: Marked): boolean => m.branches.every((b) => b.body.every((n) => n.type !== "element" || isInlineLevel(n)));

// The marked blocks among `el`'s children become groups and chains the rules can lower. A block
// that shares a line with text stays text: a transparent group around its markers, which the
// serializer writes as they are.
const regroup = (el: StyledElement, ctx: Ctx): StyledNode[] => {
  const items = split(el.children);
  if (isRow(el.style)) {
    const out: StyledNode[] = [];
    for (const i of items) {
      if (!isMarked(i)) {
        out.push(i);
        continue;
      }
      ctx.diagnostics.report("E012", { message: `${i.op === "each" ? "<tddr-each>" : "an if / else chain"} on an item of a row or grid`, ...(i.open.loc ? { loc: i.open.loc } : {}) });
      for (const b of i.branches) out.push(...b.body);
    }
    return out;
  }
  const solid = items.filter((i) => isMarked(i) || !(i.type === "text" ? isBlank(i) : i.type === "comment"));
  const onLine = (i: Item | undefined): boolean =>
    i !== undefined && (isMarked(i) ? inlineContent(i) : isText(i) || (i.type === "element" && isInlineLevel(i)));
  return items.flatMap((i): StyledNode[] => {
    if (!isMarked(i)) return [i];
    const at = solid.indexOf(i);
    if (!isColumn(el.style) && inlineContent(i) && (onLine(solid[at - 1]) || onLine(solid[at + 1]))) return [group(el, i.nodes, true, {}, i.open)];
    if (i.op === "each") {
      const [path = "", as] = i.arg.split(" ");
      const attrs: Record<string, string> = { "data-email-each": path, ...(as ? { "data-email-as": as } : {}) };
      const body = i.branches[0]!.body;
      const only = body.filter((n) => !(n.type === "text" && isBlank(n)));
      // one element: the list goes on it, as if it carried data-email-each itself
      const first = only[0];
      const one = only.length === 1 && first?.type === "element" && !hasTemplateAttrs(first.attrs) ? first : undefined;
      return [one ? { ...one, attrs: { ...one.attrs, ...attrs } } : group(el, body, false, attrs, i.open)];
    }
    const branches = i.branches.map((b) => group(el, b.body, false, b.when === undefined ? {} : { [WHEN_ATTR]: b.when }, i.open));
    return [{ ...group(el, branches, false, {}, i.open), tag: CHAIN_TAG }];
  });
};

// One branch: its only element as is, or a group of everything in it.
const branchNode = (g: StyledElement, recurse: (n: StyledElement) => Node): Node => {
  const solid = g.children.filter((c) => !(c.type === "text" && isBlank(c)));
  const only = solid[0];
  if (solid.length === 1 && only?.type === "element") return recurse(only);
  if (solid.length === 0) return { kind: "stack", box: emptyBox(), children: [], gap: 0, collapse: true };
  const { [WHEN_ATTR]: _when, ...attrs } = g.attrs;
  return recurse({ ...g, attrs });
};

const chain = (el: StyledElement, recurse: (n: StyledElement) => Node): Node => {
  const branches: Branch[] = [];
  let otherwise: Node | undefined;
  for (const g of el.children) {
    if (g.type !== "element") continue;
    const child = branchNode(g, recurse);
    const when = g.attrs[WHEN_ATTR];
    if (when === undefined) otherwise = child;
    else {
      // written by sanitize from a condition it parsed, so it reads back
      const c = parseCond(when, "branch");
      if (!isProblem(c)) branches.push({ when: c, child });
    }
  }
  return withLoc({ kind: "template", op: "if", branches, ...(otherwise ? { otherwise } : {}) }, el.loc);
};

// data-email-each / -if / -unless and the chains and lists sanitize marked (docs/templates.md).
// Before the hint rule, so a construct on an outlook-only element stays outside the conditional.
// if / unless wrap the whole thing, each repeats what is inside them.
export const templateRule: Rule = {
  name: "template",
  matches: (el) => el.tag === CHAIN_TAG || hasTemplateAttrs(el.attrs) || (!isPassThrough(el) && el.children.some(isMarker)),
  analyze: (el, ctx: Ctx, recurse) => {
    if (el.tag === CHAIN_TAG) return chain(el, recurse);
    if (!hasTemplateAttrs(el.attrs)) return recurse({ ...el, children: regroup(el, ctx) });
    const { blocks, problems } = readBlocks(el.attrs);
    for (const p of problems) ctx.diagnostics.report("E012", { ...p, loc: el.loc });
    const lowered = recurse(withoutTemplateAttrs(el));
    if (blocks.length === 0) return lowered;
    if (isRow(el.parentStyle)) {
      ctx.diagnostics.report("E012", { message: `${blocks.map((b) => `data-email-${b.op === "if" ? b.name : "each"}`).join(" and ")} on an item of a row or grid`, loc: el.loc });
      return lowered;
    }
    return blocks.reduceRight<Node>((child, b) => withLoc(node(b, child), el.loc), lowered);
  },
};

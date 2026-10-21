import { defaultTreeAdapter, html as h5, parse, serialize } from "parse5";
import type { DefaultTreeAdapterMap } from "parse5";
import type { Cond } from "../ir/types.ts";
import { scanChains, type Access } from "./chain.ts";
import { dialects, type DialectName } from "./dialects.ts";
import { CHAIN_ATTRS, readBlocks, TEMPLATE_ATTRS } from "./hints.ts";
import { checkPath, checkZero, evaluate } from "./semantics.ts";
import { startTags } from "./tags.ts";
import { FIELD_CLOSE, FIELD_OPEN } from "./tokens.ts";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
type Parent = DefaultTreeAdapterMap["parentNode"];
type Child = DefaultTreeAdapterMap["childNode"];
type Props = Readonly<Record<string, unknown>>;

const FIELD = new RegExp(`${FIELD_OPEN}([^${FIELD_CLOSE}]*)${FIELD_CLOSE}`, "g");
const HINTS: readonly string[] = TEMPLATE_ATTRS;

// the data's own fields only: JSON has no inherited ones, and neither engine reads them
const read = (scope: Props, path: string): unknown =>
  path.split(".").reduce<unknown>((v, k) => (v === null || typeof v !== "object" || !Object.hasOwn(v, k) ? undefined : (v as Record<string, unknown>)[k]), scope);

// What annotate needs of the input: the start tag index of every element, by where its tag starts, and the text itself.
type Annotate = { tags: ReadonlyMap<number, number>; src: string };
// `on`: the dialects whose data needs every condition is checked against
type Opts = { ann: Annotate | undefined; on: readonly DialectName[] };

// Conditions read as JS reads them; see semantics.ts
const holds = (scope: Props, c: Cond, o: Opts): boolean => evaluate(c, (p) => read(scope, p), o.on);
const shown = (scope: Props, path: string, o: Opts): string => {
  checkPath(path, (p) => read(scope, p), o.on);
  return String(read(scope, path) ?? "");
};
const fill = (s: string, scope: Props, o: Opts): string => s.replace(FIELD, (_m, path: string) => shown(scope, path, o));
const list = (scope: Props, path: string, o: Opts): unknown[] => {
  checkPath(path, (p) => read(scope, p), o.on, true);
  const v = read(scope, path);
  return Array.isArray(v) ? v : [];
};
// Elements whose text is not markup, so a field there can't be wrapped
const RAW_TEXT = new Set(["script", "style", "title", "textarea"]);

const attrsOf = (n: Node): Record<string, string> => ("attrs" in n ? Object.fromEntries(n.attrs.map((a) => [a.name, a.value])) : {});

const access: Access<Child> = {
  tag: (n) => ("tagName" in n ? n.tagName : undefined),
  attrs: attrsOf,
  blank: (n) => n.nodeName === "#text" && "value" in n && /^[ \t\n\r\f]*$/.test(n.value),
};

const clone = (n: Node, parent: Parent | null): Node => {
  if ("childNodes" in n) {
    const copy = { ...n, parentNode: parent, childNodes: [] as Node[] } as unknown as Element;
    if ("attrs" in n) copy.attrs = n.attrs.map((a) => ({ ...a }));
    copy.childNodes = n.childNodes.map((c) => clone(c, copy) as Child);
    // a <template>'s children live in its content fragment
    if ("content" in n) (copy as unknown as { content: Node }).content = clone(n.content as unknown as Node, null);
    return copy;
  }
  return { ...n, parentNode: parent } as Node;
};

const inner = (n: Node): Child[] => ("childNodes" in n ? (n.childNodes as Child[]) : []);

// What `nodes` (siblings under `parent`) show for `scope`. The same constructs compile writes,
// read the same way: anything invalid is shown once, as is.
const expandAll = (nodes: readonly Child[], parent: Parent, scope: Props, o: Opts, at: string): Child[] => {
  const out: Child[] = [];
  // a transparent element shows its children in its place
  const children = (n: Child, s: Props, pos = at): Child[] => expandAll(inner(n), parent, s, o, pos);
  for (const piece of scanChains(nodes, access, () => undefined)) {
    if (piece.kind === "node") out.push(...element(piece.node, parent, scope, false, o, at));
    else if (piece.kind === "plain") out.push(...(piece.tddr ? children(piece.node, scope) : element(piece.node, parent, scope, true, o, at)));
    else if (piece.kind === "each") {
      for (const [i, item] of list(scope, piece.path, o).entries()) out.push(...children(piece.node, { ...scope, [piece.as ?? "item"]: item }, place(at, i)));
    } else {
      const zero = attrsOf(piece.members[0]!.node)["prints-zero"];
      if (zero) checkZero(zero.split(" "), (p) => read(scope, p));
      const pick = piece.members.find((m) => m.when === undefined || holds(scope, m.when, o));
      if (pick) out.push(...(pick.tddr ? children(pick.node, scope) : element(pick.node, parent, scope, true, o, at)));
    }
  }
  return out;
};

// loop positions from the outermost loop in: "1" in a loop, "1.0" in a loop inside it
const place = (at: string, i: number): string => (at ? `${at}.${i}` : String(i));

const attr = (name: string, value: string) => ({ name, value });

// The text with each field replaced by its value inside a <tddr-f> that names where the field is in the input.
const wrapFields = (n: Child & { value: string }, parent: Parent, scope: Props, ann: Annotate, o: Opts): Child[] => {
  const loc = n.sourceCodeLocation;
  const raw = loc ? [...ann.src.slice(loc.startOffset, loc.endOffset).matchAll(FIELD)] : [];
  const inText = [...n.value.matchAll(FIELD)];
  if (!loc || inText.length === 0 || inText.length !== raw.length || RAW_TEXT.has("tagName" in parent ? parent.tagName : "")) return [{ ...n, value: fill(n.value, scope, o) } as Child];
  const out: Child[] = [];
  let last = 0;
  inText.forEach((m, k) => {
    if (m.index > last) out.push({ ...n, value: n.value.slice(last, m.index) } as Child);
    const wrapper = defaultTreeAdapter.createElement("tddr-f", h5.NS.HTML, [attr("data-tddr-f", String(loc.startOffset + raw[k]!.index))]);
    defaultTreeAdapter.insertText(wrapper, shown(scope, m[1]!, o));
    wrapper.parentNode = parent;
    out.push(wrapper as Child);
    last = m.index + m[0].length;
  });
  if (last < n.value.length) out.push({ ...n, value: n.value.slice(last) } as Child);
  return out;
};

// One node; `branch`: its condition was decided already, only an each is left on it.
const element = (n: Child, parent: Parent, scope: Props, branch: boolean, o: Opts, at: string): Child[] => {
  const ann = o.ann;
  if ("value" in n && n.nodeName === "#text") return ann ? wrapFields(n as Child & { value: string }, parent, scope, ann, o) : [{ ...n, value: fill(n.value, scope, o) } as Child];
  if (!("tagName" in n)) return [n];
  const attrs = attrsOf(n);
  if (branch) for (const a of CHAIN_ATTRS) delete attrs[a];
  const blocks = readBlocks(attrs).blocks;
  if (!blocks.every((b) => b.op === "each" || holds(scope, b.when, o))) return [];
  const each = blocks.find((b) => b.op === "each");
  const items = each === undefined ? [undefined] : list(scope, each.path, o);
  return items.map((item, i) => {
    const copy = clone(n, parent) as Element;
    const s = each === undefined ? scope : { ...scope, [each.as ?? "item"]: item };
    const here = each === undefined ? at : place(at, i);
    copy.attrs = copy.attrs.filter((a) => !HINTS.includes(a.name)).map((a) => ({ ...a, value: fill(a.value, s, o) }));
    if (ann) {
      const tag = ann.tags.get(n.sourceCodeLocation?.startTag?.startOffset ?? -1);
      if (tag !== undefined) copy.attrs.push(attr("data-tddr-s", String(tag)));
      if (here) copy.attrs.push(attr("data-tddr-n", here));
    }
    const host = "content" in copy ? (copy.content as unknown as Parent) : copy;
    host.childNodes = expandAll(host.childNodes as Child[], host, s, o, here);
    return copy;
  });
};

// Shows what an email looks like for sample props: lists repeated, branches decided, placeholders
// filled. Runs on the author's markup, before compiling, so it can be diffed against the output.
//
// annotate (for the dev UI, never compiled): every element carries data-tddr-s, the index of its start
// tag in the input counted like the dev UI does, and data-tddr-n inside a loop (its position, "1.0"
// for the first copy in the second pass of the outer loop). A text field becomes
// <tddr-f data-tddr-f="offset of the field in the input">value</tddr-f>.
//
// Conditions mean what they mean in JS. `dialects` (default: all) are the templates the data must
// suit: a data set that doesn't meet a dialect's needs for a condition it reaches throws a
// TemplateDataError naming the value, rather than showing what only one side would show.
export const preview = (html: string, props: Props, o: { annotate?: boolean; dialects?: readonly DialectName[] } = {}): string => {
  const ann = o.annotate ? { tags: new Map(startTags(html).map((t, i) => [t.start, i])), src: html } : undefined;
  const doc = parse(html, ann ? { sourceCodeLocationInfo: true } : {});
  const on = o.dialects ?? (Object.keys(dialects) as DialectName[]);
  doc.childNodes = expandAll(doc.childNodes, doc, props, { ann, on }, "");
  return serialize(doc);
};

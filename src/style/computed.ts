import type { Ctx } from "../ctx.ts";
import { withLoc } from "../loc.ts";
import { isElement, locOf } from "../parse/dom.ts";
import type { ParsedDoc } from "../parse/html.ts";
import { removedControl } from "../sanitize/sanitize.ts";
import { backdropOf, flattenStyle, translucentLeft, type RGB } from "./alpha.ts";
import { cascade } from "./cascade.ts";
import { computeValues } from "./inherit.ts";
import { materialize, type CascadedElement } from "./materialize.ts";
import { INITIAL_FONT_SIZE, isLive, parsePx, publicValue, relativeLive } from "./units.ts";
import { DESKTOP, type ComputedStyle, type Env, type StyledDoc, type StyledElement, type StyledNode, type Unstack } from "./types.ts";

// Flex items are blockified, like browsers do (CSS Display §2.7).
const BLOCKIFY: Readonly<Record<string, string>> = { inline: "block", "inline-block": "block", "inline-flex": "flex", "inline-table": "table" };

export const blockify = (style: ComputedStyle, parent: ComputedStyle | undefined): ComputedStyle => {
  const pd = parent?.["display"];
  if (pd !== "flex" && pd !== "inline-flex" && pd !== "grid" && pd !== "inline-grid") return style;
  const to = BLOCKIFY[style["display"] ?? "inline"];
  return to ? { ...style, display: to } : style;
};

// Word doesn't know currentcolor.
const currentColor = (style: ComputedStyle): ComputedStyle => {
  let out: Record<string, string> | undefined;
  for (const [p, v] of Object.entries(style)) {
    if (p !== "color" && v.toLowerCase() === "currentcolor") (out ??= { ...style })[p] = style["color"] ?? "#000000";
  }
  return out ?? style;
};

// A live font-size is carried as "px at the design width + authored" so em math has a number;
// children get it as is, the computed style shows the authored part. Line-height and
// letter-spacing that scale with the font follow it live (5vw text with line-height 1.2).
const NUM = "([+-]?(?:\\d+\\.?\\d*|\\.\\d+))";
const BARE = new RegExp(`^${NUM}$`);
const RELATIVE = new RegExp(`^${NUM}(em|%)$`, "i");
const shown = (style: ComputedStyle, authored: Readonly<Record<string, string>> = {}): ComputedStyle => {
  const v = style["font-size"];
  if (v === undefined || !isLive(v)) return style;
  const fs = publicValue(v);
  const out: Record<string, string> = { ...style, "font-size": fs };
  for (const prop of ["line-height", "letter-spacing"]) {
    const bare = prop === "line-height" ? BARE.exec(style[prop] ?? "") : null;
    const rel = RELATIVE.exec(authored[prop]?.trim() ?? "");
    const m = bare ?? rel;
    if (!m) continue;
    const k = Number(m[1]) / (rel && !bare && rel[2] === "%" ? 100 : 1);
    out[prop] = `calc(${Math.round(k * 1e4) / 1e4} * ${fs})`;
  }
  return out;
};

// em / % under a live parent: the design px computeValues found, plus a live expression
const liveSize = (style: ComputedStyle, authored: string | undefined, parent: ComputedStyle | undefined): ComputedStyle => {
  const own = style["font-size"];
  const up = parent?.["font-size"];
  if (own === undefined || authored === undefined || up === undefined || isLive(own)) return style;
  const live = relativeLive(authored, up, own);
  return live ? { ...style, "font-size": live } : style;
};

// Elements are told apart across parses by where they start in the source.
export const elementKey = (loc: { line: number; col: number } | undefined): string | undefined => (loc ? `${loc.line}:${loc.col}` : undefined);

// `shownElsewhere`: element key -> the display it has where it is shown, for elements hidden in some
// environments only. They keep their place here and are flagged, so the compiles share one structure.
// `stacked`: element key -> its row style, for rows and grids that stack in some environments only.
// `doc` is only read, so one parse serves every environment.
export const computeStyles = (doc: ParsedDoc, ctx: Ctx, env: Env = DESKTOP, shownElsewhere?: ReadonlyMap<string, string>, stacked?: ReadonlyMap<string, Unstack>): StyledDoc => {
  const query = cascade(doc, ctx, env);
  const { conditions, fonts } = query;

  // so `html { font-family }` reaches body; rem is the root's font-size everywhere below it
  const root = doc.body.parent;
  const rootRaw = root && isElement(root) ? computeValues(query.styleOf(root), undefined, ctx, locOf(root), "root") : undefined;
  const rem = parsePx(rootRaw?.["font-size"]) ?? INITIAL_FONT_SIZE;

  // children inherit the authored colours (`raw`); what's emitted is flattened over the backdrop
  const element = (el: CascadedElement, parentRaw: ComputedStyle | undefined, parent: ComputedStyle | undefined, behind: RGB | undefined, vwVars: ReadonlySet<string>): StyledElement => {
    const loc = el.loc;
    const c = el.cascaded;
    const key = elementKey(loc);
    const computed = liveSize(currentColor(blockify(computeValues(c, parentRaw, ctx, loc, rem), parentRaw)), c.values["font-size"], parentRaw);
    // the items below are laid out as a row's, so a row blockifies them
    const asRow = key === undefined ? undefined : stacked?.get(key)?.(computed);
    const raw = asRow?.style ?? computed;
    const style = flattenStyle(shown(raw, c.values), behind);
    const inner = backdropOf(raw, behind);
    const declared: Record<string, string> = {};
    // --w: 80vw then width: var(--w) is a vw width too
    const own = el.vw;
    const vars = new Set([...vwVars].filter((n) => c.values[n] === undefined));
    for (const n of own) if (n.startsWith("--")) vars.add(n);
    const vwProps = new Set(own);
    if (vars.size > 0) for (const [p, v] of Object.entries(c.values)) if (!p.startsWith("--") && [...vars].some((n) => new RegExp(`var\\(\\s*${n}\\s*[,)]`).test(v))) vwProps.add(p);
    const seeThrough = translucentLeft(style, c.authored);
    if (seeThrough.length > 0) {
      ctx.diagnostics.report("W001", {
        message: `Translucent colour kept as written (${seeThrough.join("; ")}): it sits over a gradient, photo or colour td;dr can't resolve`,
        hint: "Outlook ignores rgba() and some Gmail and Yahoo clients drop it; use a solid colour here.",
        loc,
      });
    }
    for (const p of c.authored) {
      const v = style[p];
      if (v !== undefined) declared[p] = v;
    }
    const kids: StyledNode[] = [];
    for (const n of el.children) kids.push(n.type === "element" ? element(n, raw, style, inner, vars) : { ...n });
    const shownAs = key === undefined ? undefined : shownElsewhere?.get(key);
    const hidden = shownAs !== undefined && style["display"] === "none";
    const out: StyledElement = {
      type: "element",
      tag: el.tag,
      attrs: { ...el.attrs },
      style: hidden ? { ...style, display: shownAs } : style,
      declared: hidden ? Object.fromEntries(Object.entries(declared).filter(([p]) => p !== "display")) : declared,
      children: kids,
    };
    if (asRow) out.stacked = asRow.to;
    if (shownAs !== undefined) out.keep = hidden ? "hidden" : "shown";
    if (vwProps.size > 0) out.vwProps = vwProps;
    if (parent) out.parentStyle = parent;
    return withLoc(out, loc);
  };

  const rootStyle = rootRaw && shown(rootRaw);
  const rootVars = new Set(root && isElement(root) ? [...query.vwOf(root)].filter((n) => n.startsWith("--")) : []);
  // a hidden one is hidden content, as a hidden input is; one the reader sees is a lost control
  for (const el of doc.stateOnly ?? []) {
    if (query.styleOf(el).values["display"] === "none") ctx.diagnostics.report("I002", { message: "Hidden <input> dropped", loc: locOf(el) });
    else removedControl("input", locOf(el), ctx);
  }
  const body = materialize(doc.body, query, doc.stateOnly);
  // the source is seen on a white page unless html says otherwise
  return { body: element(body, rootRaw, rootStyle, backdropOf(rootStyle ?? {}, [255, 255, 255]), rootVars), conditions, fonts };
};

import type { Ctx } from "../ctx.ts";
import type { SrcLoc } from "../loc.ts";
import { isInherited, LEGACY_ALIGN } from "./props.ts";
import { expandDeclaration, parsePending, toPhysical } from "./shorthands.ts";
import { hasModernColor, lowerColors } from "./colors.ts";
import { formatPx, INITIAL_FONT_SIZE, parsePx, reduceMath, resolveFontSize, toPx, type FontSizes } from "./units.ts";
import { hasVar, resolveCustomProps, substituteVars } from "./vars.ts";
import type { Cascaded, ComputedStyle } from "./types.ts";

const KEYWORDS = new Set(["inherit", "initial", "unset", "revert"]);
const BORDER_WIDTH_KW: Readonly<Record<string, string>> = { thin: "1px", medium: "3px", thick: "5px" };
const COLOR_HINT = "Use hex or rgb(), or a colour function of literal colours: system colours, and currentColor with no color set above, can't be computed ahead of time.";

// Inheritance, inherit/initial/unset, var() and lengths -> px. Lengths come out
// as "21.44px", zero as "0"; percentages are left as authored.
// `rem`: the root element's computed font-size in px, or "root" for the root element itself,
// whose font-size is relative to the initial one and whose other lengths to that font-size.
export const computeValues = (
  cascaded: Cascaded,
  parent: ComputedStyle | undefined,
  ctx: Ctx,
  loc?: SrcLoc,
  rem: number | "root" = INITIAL_FONT_SIZE,
): ComputedStyle => {
  const out: Record<string, string> = {};
  for (const [p, v] of Object.entries(parent ?? {})) if (isInherited(p)) out[p] = v;

  const report = (code: "W001" | "W002" | "E006", message: string, hint?: string) => ctx.diagnostics.report(code, { message, loc, hint });

  // inherit / initial / unset on one property
  const keyword = (prop: string, kw: string) => {
    const fromParent = kw === "inherit" || (kw !== "initial" && isInherited(prop));
    const v = fromParent ? parent?.[prop] : undefined;
    if (v === undefined) delete out[prop];
    else out[prop] = v;
  };

  const custom: Record<string, string> = {};
  for (const [p, v] of Object.entries(cascaded.values)) {
    if (!p.startsWith("--")) continue;
    const kw = v.trim().toLowerCase();
    if (KEYWORDS.has(kw)) keyword(p, kw);
    else custom[p] = v;
  }
  const resolved = resolveCustomProps(custom, out);
  Object.assign(out, resolved.values);
  for (const name of resolved.failed) {
    delete out[name];
    report("W001", `${name} dropped: var() cycle or unresolved reference`);
  }

  const decls: Array<readonly [string, string]> = [];
  // a var() shorthand shows up as one pending value per longhand; expand it once
  const pending = new Map<string, ReadonlyArray<readonly [string, string]>>();
  const fromPending = (p: string, raw: string, pend: NonNullable<ReturnType<typeof parsePending>>) => {
    let parts = pending.get(raw);
    if (!parts) {
      const sub = substituteVars(pend.value, (n) => out[n]);
      if (sub === undefined) report("W001", `${pend.prop} dropped: var() cycle or unresolved reference`);
      parts = sub === undefined ? [] : expandDeclaration(pend.prop, sub);
      if (sub !== undefined && parts.length === 0) report("W002", `${pend.prop}: could not parse "${sub}"`);
      parts = parts.map(([n, x]) => [toPhysical(n, pend.dir ?? "ltr"), x] as const);
      pending.set(raw, parts);
    }
    return parts.filter(([n]) => n === p);
  };
  for (const [p, raw] of Object.entries(cascaded.values)) {
    if (p.startsWith("--")) continue;
    const pend = parsePending(raw);
    if (pend) {
      decls.push(...fromPending(p, raw, pend));
      continue;
    }
    let v = raw;
    if (hasVar(v)) {
      const sub = substituteVars(v, (n) => out[n]);
      if (sub === undefined) {
        report("W001", `${p} dropped: var() cycle or unresolved reference`);
        continue;
      }
      v = sub;
    }
    const parts = expandDeclaration(p, v);
    if (parts.length === 0) report("W002", `${p}: could not parse "${v}"`);
    decls.push(...parts);
  }

  const plain: Array<readonly [string, string]> = [];
  for (const [p, v] of decls) {
    const kw = v.trim().toLowerCase();
    if (KEYWORDS.has(kw)) keyword(p, kw);
    else plain.push([p, v]);
  }

  // em has to know font-size, so that one goes first
  const parentSize = parsePx(parent?.["font-size"]) ?? INITIAL_FONT_SIZE;
  const size = plain.findLast(([p]) => p === "font-size");
  if (size) {
    const px = resolveFontSize(size[1], { em: parentSize, rem: rem === "root" ? INITIAL_FONT_SIZE : rem });
    if (px === null) report("E006", `font-size: unsupported length "${size[1]}"`);
    else out["font-size"] = px;
  }
  const fontSize = parsePx(out["font-size"]) ?? INITIAL_FONT_SIZE;
  const sizes: FontSizes = { em: fontSize, rem: rem === "root" ? fontSize : rem };

  // currentColor is the element's own colour; inside color itself it's the parent's
  const parentColor = parent?.["color"];
  const colorDecl = plain.findLast(([p]) => p === "color");
  const own = colorDecl && lowerColors(colorDecl[1].trim(), parentColor);
  const current = own && !hasModernColor(own) ? own : out["color"];

  for (const [p, v] of plain) {
    if (p === "font-size") continue;
    const t = reduceMath(lowerColors(v.trim(), p === "color" ? parentColor : current), sizes);
    if (hasModernColor(t)) {
      report("W001", `${p} dropped: "${t}" can't be turned into a colour email clients read`, COLOR_HINT);
      continue;
    }
    let next: string | null;
    if (p === "line-height" && /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(t)) next = t;
    else if (p === "line-height" && t.endsWith("%") && parsePx(t.slice(0, -1)) !== undefined) next = formatPx((parsePx(t.slice(0, -1))! * fontSize) / 100);
    else if (/^border-(?:top|right|bottom|left)-width$/.test(p) && BORDER_WIDTH_KW[t.toLowerCase()]) next = BORDER_WIDTH_KW[t.toLowerCase()]!;
    // the flex rule parses calc(P% ± Npx) itself (docs/support.md#flex-rows) and gives anything else its own E006 + hint
    else if ((p === "flex-basis" || p === "width") && /^calc\(/i.test(t)) next = t;
    else next = toPx(t, sizes);
    if (next === null) report("E006", `${p}: unsupported length "${t}"`);
    else out[p] = next;
  }
  // -webkit-center & co. are text-align for the lines and also place the blocks inside, margins or not
  // (docs/support.md#block-flow); a text-align of its own ends that, inherit and unset don't
  const ta = decls.findLast(([p]) => p === "text-align")?.[1].trim().toLowerCase();
  if (ta !== undefined) {
    const legacy = /^-webkit-(left|right|center)$/.exec(out["text-align"]?.toLowerCase() ?? "")?.[1];
    if (legacy) out["text-align"] = out[LEGACY_ALIGN] = legacy;
    else if (ta === "initial" || !KEYWORDS.has(ta)) delete out[LEGACY_ALIGN];
  }
  // a table is placed by it but resets it to start for its own cells, as browsers do
  if (out[LEGACY_ALIGN] !== undefined && (out["display"] === "table" || out["display"] === "inline-table")) {
    out["text-align"] = "start";
    delete out[LEGACY_ALIGN];
  }
  // no border style means no border, whatever width was written
  for (const side of ["top", "right", "bottom", "left"]) {
    const style = out[`border-${side}-style`];
    if (out[`border-${side}-width`] !== undefined && (style === undefined || style === "none" || style === "hidden")) out[`border-${side}-width`] = "0";
  }
  return out;
};

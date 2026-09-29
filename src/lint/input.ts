import { isReset } from "../analyze/box.ts";
import { BOX_PROP, isBlank, KEEPS_BOX } from "../analyze/children.ts";
import { isHidden, isInlineLevel } from "../analyze/classify.ts";
import { parseTable } from "../analyze/lint.ts";
import { rules } from "../analyze/registry.ts";
import type { Ctx } from "../ctx.ts";
import { lintAccessibility, type LintDoc } from "./index.ts";
import type { SrcLoc } from "../loc.ts";
import { INITIAL, isInherited } from "../style/props.ts";
import type { StyledElement, StyledNode } from "../style/types.ts";
import { hasTemplateAttrs } from "../template/hints.ts";
import { featuresFor } from "../targets/features.ts";

// Properties the layout IR replaces, or that already get their own E00x (offsets), so
// they never reach the output as authored. Everywhere:
const LOWERED =
  /^(flex(-|$)|grid-|gap$|row-gap$|column-gap$|align-|justify-|box-sizing$|order$|float$|transform|animation|transition|--|top$|right$|bottom$|left$)/;
// On containers the IR also owns the box model; on pass-through text it is emitted as authored.
const LOWERED_ON_CONTAINERS = /^(margin(-|$)|padding(-|$)|width$|max-width$)/;
// What the container emitter writes from the box besides inherited text properties.
const CONTAINER_WRITES = /^(border-(top|right|bottom|left)-(width|style|color)|border-.*-radius|background-color)$/;
const LOWERED_VALUES: Readonly<Record<string, ReadonlySet<string>>> = {
  display: new Set(["block", "flex", "inline-flex", "list-item", "grid", "inline-grid", "table", "inline-table"]),
  position: new Set(["static", "relative", "absolute", "fixed", "sticky"]),
};

// px (and unitless) line-height is emitted as px with mso-line-height-rule:exactly already.
const isHandledLineHeight = (v: string): boolean => /^\d+(\.\d+)?(px)?$/.test(v);

// How the analyzer treats an element decides which of its properties reach the output.
type Role =
  | "container" // block/flex: becomes a table, the emitter writes the box
  | "image" // image node: only the box (border, radius, background) is kept
  | "button" // like a container, but Outlook gets its radius from VML (or a W003 when it can't)
  | "text-root" // pass-through root: margins become IR margin, a text block's box moves to its cell
  | "nested"; // inside pass-through HTML: serialized as authored

const isLowered = (el: StyledElement, prop: string, value: string, role: Role): boolean => {
  if (LOWERED.test(prop) || (LOWERED_VALUES[prop]?.has(value) ?? false)) return true;
  if (prop === "line-height" && isHandledLineHeight(value)) return true;
  if (el.tag === "img" && (prop === "width" || prop === "height")) return true; // become attributes
  if (value === INITIAL[prop] || isReset(prop, value)) return true;
  switch (role) {
    case "container":
      // containers become tables: only what the emitter writes (or inherits) reaches the output
      return LOWERED_ON_CONTAINERS.test(prop) || !(CONTAINER_WRITES.test(prop) || isInherited(prop));
    case "image":
      return !CONTAINER_WRITES.test(prop);
    case "button":
      return /^border-.*-radius$/.test(prop) || isLowered(el, prop, value, "container");
    case "text-root":
      if (/^margin(-|$)/.test(prop)) return true; // passThrough writes margin:0
      return !isInlineLevel(el) && !KEEPS_BOX.has(el.tag) && BOX_PROP.test(prop);
    default:
      return false;
  }
};

// Name the family, not the first longhand seen: margin-top stands for all four sides.
const shownName = (prop: string): string =>
  /^border-.*-radius$/.test(prop) ? "border-radius" : /^(margin|padding)-/.test(prop) ? prop.split("-")[0] ?? prop : prop;

// Value features are about the value, not the property it sits in.
const VALUE_LABEL: Readonly<Record<string, string>> = {
  "css-rgba": "an rgba() colour",
  "css-variables": "var()",
  "css-unit-calc": "calc()",
  "css-unit-rem": "the rem unit",
  "css-unit-em": "the em unit",
  "css-linear-gradient": "linear-gradient()",
  "css-radial-gradient": "radial-gradient()",
  "css-conic-gradient": "conic-gradient()",
  "css-important": "!important",
};

type Seen = { prop: string; loc: SrcLoc | undefined; els: Set<StyledElement>; values: Set<string> };


// caniemail's partial notes for these are about edge values (numeric weights
// like 450, `lowercase`, negative spacing, multi-value decorations).
const PARTIAL_IRRELEVANT: Readonly<Record<string, (v: string) => boolean>> = {
  "css-font-weight": (v) => /^(normal|bold|bolder|lighter|[1-9]00)$/.test(v.trim()),
  "css-text-transform": (v) => v.trim() !== "lowercase",
  "css-letter-spacing": (v) => !v.trim().startsWith("-"),
  "css-text-decoration": (v) => !/\s/.test(v.trim()),
  "css-margin": (v) => !/-|auto/.test(v),
};

export const lintInput = (body: StyledElement, ctx: Ctx, doc?: LintDoc): void => {
  const seen = new Map<string, Seen>();

  const lint = (el: StyledElement, role: Role): void => {
    // the clipped gradient never reaches the output: solid colour (W001 at analysis) or the author's colour
    const clipped = role === "text-root" && (el.style["background-clip"] ?? el.style["-webkit-background-clip"]) === "text";
    // a cell paints the image: a url is covered by VML and the fallback colour, a gradient is not
    const paints = role === "container" || (role === "text-root" && !isInlineLevel(el) && !KEEPS_BOX.has(el.tag));
    for (const [prop, value] of Object.entries(el.declared)) {
      if (clipped && /^(-webkit-)?background-(clip|image)$/.test(prop)) continue;
      const painted = paints && prop === "background-image" && !isLowered(el, prop, value, "nested");
      if (!painted && isLowered(el, prop, value, role)) continue;
      for (const slug of featuresFor(prop, value)) {
        if (painted && slug === "css-background-image") continue;
        const s = seen.get(slug);
        if (s) {
          s.els.add(el);
          s.values.add(value);
        } else seen.set(slug, { prop: VALUE_LABEL[slug] ?? shownName(prop), loc: el.loc, els: new Set([el]), values: new Set([value]) });
      }
    }
  };

  const nested = (el: StyledElement): void => {
    if (isHidden(el)) return; // dropped with I002
    lint(el, "nested");
    for (const c of el.children) if (c.type === "element") nested(c);
  };

  // Children of a container, found the way analyzeChildren does.
  const children = (el: StyledElement): void => {
    let run: StyledNode[] = [];
    const flush = (): void => {
      const solid = run.filter((n) => !isBlank(n));
      const only = solid[0];
      if (solid.length === 1 && only?.type === "element") root(only);
      else for (const n of solid) if (n.type === "element") nested(n);
      run = [];
    };
    for (const c of el.children) {
      if (c.type !== "element") run.push(c);
      else if (isHidden(c)) continue;
      else if (isInlineLevel(c)) run.push(c);
      else {
        flush();
        root(c);
      }
    }
    flush();
  };

  // Elements the analyzer turns into IR nodes, found the way analyzeChildren/analyzeItems do.
  const root = (el: StyledElement): void => {
    if (isHidden(el)) return;
    // a parent the template rule regroups (template block markers among its children) is lowered by the next rule
    const rule = rules.find((r) => r.matches(el, ctx) && (r.name !== "template" || hasTemplateAttrs(el.attrs)))?.name;
    if (rule === "image") {
      lint(el, "image");
      for (const c of el.children) if (c.type === "element" && c.tag === "img") lint(c, "image");
    } else if (rule === "button") {
      // the button table gets the box, the label keeps text styles
      lint(el, "button");
      for (const c of el.children) if (c.type === "element") nested(c);
    } else if (rule === "flex") {
      lint(el, "container");
      for (const c of el.children) if (c.type === "element") root(c);
    } else if (rule === "block") {
      lint(el, "container");
      children(el);
    } else if (rule === "table-display") {
      // a table's rows and cells are boxes the emitter writes, like the container itself
      const table = parseTable(el);
      lint(el, "container");
      const cell = (c: StyledNode): void => {
        if (c.type !== "element" || isHidden(c)) return;
        lint(c, "container");
        children(c);
      };
      if (table.mode === "block") children(el);
      else if (table.mode === "cells") el.children.forEach(cell);
      else {
        for (const r of el.children) {
          if (r.type !== "element" || isHidden(r)) continue;
          lint(r, "container");
          r.children.forEach(cell);
        }
      }
    } else if (rule === "inline") {
      if (el.tag === "hr") return; // becomes a divider cell, never emitted
      lint(el, "text-root");
      for (const c of el.children) if (c.type === "element") nested(c);
    } else nested(el); // unsupported: kept raw, nothing is lowered
  };
  root(body);

  // Whichever rule lowers it (or passes it through), the disclosure is gone.
  const details = (el: StyledElement): void => {
    if (isHidden(el)) return;
    if (el.tag === "details") ctx.diagnostics.report("W001", { message: "<details> has no disclosure widget in most email clients: its content shows expanded", hint: "Apple Mail may keep it collapsible; elsewhere the summary and content are always visible. Drop <details> or write the content as plain blocks.", loc: el.loc });
    for (const c of el.children) if (c.type === "element") details(c);
  };
  details(body);

  for (const [slug, s] of seen) {
    const res = ctx.caps.check(slug);
    if (res.status !== "n" && res.status !== "a") continue;
    // a partial-support note that can't apply to any value used isn't worth a diagnostic
    const irrelevant = PARTIAL_IRRELEVANT[slug];
    if (res.status === "a" && irrelevant && [...s.values].every(irrelevant)) continue;
    const places = s.els.size > 1 ? ` (${s.els.size} places)` : "";
    const note = res.notes[0];
    if (res.status === "n") {
      const partly = res.clients.filter((c) => !res.unsupported.includes(c));
      const also = partly.length ? `; partly in ${partly.join(", ")}` : "";
      ctx.diagnostics.report("W005", {
        message: `${s.prop} isn't supported in ${res.unsupported.join(", ")}${also}${places}`,
        hint: note ?? "Those clients ignore it; drop the property or narrow --targets.",
        loc: s.loc,
      });
    } else {
      ctx.diagnostics.report("I003", {
        message: `${s.prop} is only partly supported in ${res.clients.join(", ")}${places}`,
        hint: note,
        loc: s.loc,
      });
    }
  }

  lintAccessibility(body, ctx, doc);
};

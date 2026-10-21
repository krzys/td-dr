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
import { featuresFor, featuresForImage, featuresForTag } from "../targets/features.ts";

// Properties the layout IR replaces, or that already get their own E00x (offsets), so
// they never reach the output as authored. Everywhere (z-index goes with position):
const LOWERED =
  /^(flex(-|$)|grid-|gap$|row-gap$|column-gap$|align-|justify-|box-sizing$|order$|float$|transform|animation|transition|--|top$|right$|bottom$|left$|z-index$)/;
// On containers the IR also owns the box model; on pass-through text it is emitted as authored.
// border-spacing becomes cellspacing or spacer cells (table-display); what's left is inherited onto cells, where it does nothing.
const LOWERED_ON_CONTAINERS = /^(margin(-|$)|padding(-|$)|width$|max-width$|border-spacing$)/;
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
  "css-rgb": "rgb()",
  "css-modern-color": "lab()/lch() colours",
  "css-function-light-dark": "light-dark()",
  "css-function-clamp": "clamp()",
  "css-function-min": "min()",
  "css-function-max": "max()",
  "css-intrinsic-size": "fit-content/min-content/max-content",
  "css-unit-initial": "the initial keyword",
  "css-sytem-ui": "system-ui fonts",
  "css-list-style-image": "list-style-image",
  ...Object.fromEntries(
    ["ch", "ex", "vw", "vh", "vmin", "vmax", "pt", "pc", "in", "cm", "mm"].map((u) => [`css-unit-${u}`, `the ${u} unit`]),
  ),
};

// Image formats by their caniemail slug: image-webp is "a WebP image".
const IMAGE_LABEL: Readonly<Record<string, string>> = {
  "image-png": "a PNG image", "image-apng": "an APNG image", "image-jpg": "a JPEG image", "image-gif": "a GIF image",
  "image-svg": "an SVG image", "image-webp": "a WebP image", "image-avif": "an AVIF image", "image-bmp": "a BMP image",
  "image-ico": "an ICO image", "image-tiff": "a TIFF image", "image-heif": "a HEIF image", "image-hdr": "an HDR image",
  "image-mp4": "an MP4 image",
};
const URL_IN = /\burl\(\s*(["']?)([^"')]+)\1\s*\)/gi;

// Where caniemail's first note is about something else (visibility: collapse on rows).
const HINT: Readonly<Record<string, string>> = {
  "css-visibility": "Those clients show what it hides. To hide content everywhere use display:none, which td;dr drops from the output (I002).",
};

type Seen = { prop: string; loc: SrcLoc | undefined; els: Set<StyledElement>; values: Set<string> };


// rgb(0 128 0) and rgba(0 0 0 / 50%), not rgba(0, 0, 0, 0.5)
const WHITESPACE_COLOUR = /\b(?:rgba?|hsla?)\(\s*[^,()\s]+\s+[^,()]*\)/i;

// caniemail's partial notes for these are about edge values (numeric weights
// like 450, `lowercase`, negative spacing, multi-value decorations).
const PARTIAL_IRRELEVANT: Readonly<Record<string, (v: string) => boolean>> = {
  "css-font-weight": (v) => /^(normal|bold|bolder|lighter|[1-9]00)$/.test(v.trim()),
  "css-text-transform": (v) => v.trim() !== "lowercase",
  "css-letter-spacing": (v) => !v.trim().startsWith("-"),
  "css-text-decoration": (v) => !/\s/.test(v.trim()),
  "css-margin": (v) => !/-|auto/.test(v),
  // the borders the emitter writes as-is; the notes are about wide borders and odd styles
  "css-border": (v) => [...v.matchAll(/([\d.]+)px/g)].every((m) => Number(m[1]) <= 8),
  "css-text-align": (v) => /^(left|right|center|justify)$/.test(v.trim()),
  "css-direction": () => true, // the notes are about clients guessing rtl themselves; dir= is written too
  "css-text-indent": (v) => !v.trim().startsWith("-"),
  "css-rgb": (v) => [...v.matchAll(/(?<![\w-])rgb\(([^)]*)\)/gi)].every((m) => !m[1]!.includes("/") && m[1]!.split(",").length === 3),
  // td;dr writes rgba() with commas (src/style/colors.ts); the notes are about `rgb(0 128 0 / 1)`
  "css-rgba": (v) => !WHITESPACE_COLOUR.test(v),
  "css-list-style": (v) => !/\burl\(/i.test(v),
  // tag features carry the element's attribute names as their value
  "html-lists": (v) => !/\b(reversed|value)\b/.test(v),
  "html-dfn": (v) => !/\btitle\b/.test(v),
  // the note is Gmail rasterizing it to PNG: still shown, at its size
  "image-svg": () => true,
};

export const lintInput = (body: StyledElement, ctx: Ctx, doc?: LintDoc): void => {
  const seen = new Map<string, Seen>();

  const note = (slug: string, label: string, el: StyledElement, value: string): void => {
    const s = seen.get(slug);
    if (s) {
      s.els.add(el);
      s.values.add(value);
    } else seen.set(slug, { prop: label, loc: el.loc, els: new Set([el]), values: new Set([value]) });
  };

  // `raw`: inside an element kept as raw html, whose gradient text is made solid too (rules/unsupported.ts)
  const lint = (el: StyledElement, role: Role, raw = false): void => {
    // passed-through HTML keeps its tags; everything else is re-emitted as tables
    if (role === "nested" || role === "text-root") {
      for (const slug of featuresForTag(el.tag)) note(slug, `<${el.tag}>`, el, Object.keys(el.attrs).join(" "));
    }
    const src = el.tag === "img" ? el.attrs["src"] : undefined;
    if (src) for (const slug of featuresForImage(src)) note(slug, IMAGE_LABEL[slug] ?? slug, el, src);
    // the clipped gradient never reaches the output: solid colour (W001 at analysis) or the author's colour
    const clipped = (role === "text-root" || raw) && (el.style["background-clip"] ?? el.style["-webkit-background-clip"]) === "text";
    // a cell paints the image: a url is covered by VML and the fallback colour, a gradient is not
    const paints = role === "container" || (role === "text-root" && !isInlineLevel(el) && !KEEPS_BOX.has(el.tag));
    for (const [prop, value] of Object.entries(el.declared)) {
      if (clipped && /^(-webkit-)?background-(clip|image)$/.test(prop)) continue;
      const painted = paints && prop === "background-image" && !isLowered(el, prop, value, "nested");
      if (!painted && isLowered(el, prop, value, role)) continue;
      for (const slug of featuresFor(prop, value)) {
        if (painted && slug === "css-background-image") continue;
        note(slug, VALUE_LABEL[slug] ?? shownName(prop), el, value);
      }
      if (prop === "background-image") {
        for (const [, , url] of value.matchAll(URL_IN)) for (const slug of featuresForImage(url!)) note(slug, IMAGE_LABEL[slug] ?? slug, el, url!);
      }
    }
  };

  const nested = (el: StyledElement, raw = false): void => {
    if (isHidden(el)) return; // dropped with I002
    lint(el, "nested", raw);
    for (const c of el.children) if (c.type === "element") nested(c, raw);
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
    } else if (rule === "flex" || rule === "grid") {
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
    } else nested(el, rule === "unsupported"); // kept raw, nothing is lowered
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
    // a note about a syntax none of the values use is no hint
    const note = HINT[slug] ?? res.notes.find((n) => !/whitespace syntax/i.test(n) || [...s.values].some((v) => WHITESPACE_COLOUR.test(v)));
    if (res.status === "n") {
      const plain = irrelevant !== undefined && [...s.values].every(irrelevant);
      const partly = plain ? [] : res.clients.filter((c) => !res.unsupported.includes(c));
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

import type { Ctx } from "../ctx.ts";
import type { SrcLoc } from "../loc.ts";
import { AMP_HINT, ampMarker } from "../parse/amp.ts";
import { children, findAllElements, findElement, isComment, isElement, isText, locOf, type DomChild, type DomDocument, type DomElement, type DomNode } from "../parse/dom.ts";
import type { ParsedDoc } from "../parse/html.ts";
import { cssUrls } from "../style/unsafe.ts";
import { TDDR_TAGS } from "../template/chain.ts";
import { TEMPLATE_ATTRS } from "../template/hints.ts";
import { markChains } from "./chains.ts";
import { badScheme, srcsetUrls, URL_HINT, type UrlUse } from "./urls.ts";

const DROP_TAGS = new Set(["script", "noscript", "template", "style", "link", "meta", "title", "base"]);
// URL attributes by what they load; src is an image on <img> only.
const IMAGE_ATTRS = new Set(["background", "poster", "lowsrc", "dynsrc"]);
const LINK_ATTRS = new Set(["href", "xlink:href", "src", "action", "cite", "longdesc", "codebase"]);
// An embedded document's source, and a submit target: nothing a mail client follows.
const DOC_ATTRS = new Set(["srcdoc", "formaction"]);

// Mail clients don't load embedded documents or plugins, and strip or disable forms (Outlook.com
// drops a form with what is in it), so these go in every mode (docs/support.md#sanitizing).
const EMBEDS = new Set(["iframe", "frame", "frameset", "object", "embed", "applet", "portal", "fencedframe"]);
const CONTROLS = new Set(["input", "select", "textarea", "button", "keygen", "datalist"]);
const EMBED_HINT = "Mail clients don't load embedded pages or plugins. Link to the page instead, e.g. with a screenshot of it as the link's image.";
const CONTROL_HINT = 'Mail clients disable or strip form controls. Link to a form on the web instead; an <a> with data-email="button" makes a button every client shows.';

// Conditional comments the MSO patterns depend on, in all their spellings.
const MSO_COMMENT = /^\s*(\[if[\s\]]|\[endif\]|<!\[endif\])/;

// Kept <svg> is author markup shown in a mail client's webview: no data: links, no embedded
// HTML, no references to other documents.
// parse5 stores xlink:href under the key href, so the second name only matters for hand-built trees.
const SVG_HREFS = ["href", "xlink:href"];
// These can pull in another document, so only #fragment references survive.
const SAME_DOC_ONLY = new Set(["use", "feimage"]);
// Presentation attributes that take a url() the way their CSS property does.
const SVG_PAINT = new Set(["fill", "stroke", "filter", "clip-path", "mask", "marker-start", "marker-mid", "marker-end", "cursor"]);
const ANIMATORS = new Set(["animate", "set", "animatemotion", "animatetransform"]);
// SMIL can set an href at runtime and so dodge the attribute checks below.
const animatesHref = (c: { name: string; attribs: Record<string, string> }): boolean =>
  ANIMATORS.has(c.name.toLowerCase()) && SVG_HREFS.includes((c.attribs.attributename ?? c.attribs.attributeName ?? "").trim().toLowerCase());
const isDataUrl = (v: string): boolean => v.replace(/[\x00-\x20]/g, "").toLowerCase().startsWith("data:");

const detach = (kids: DomChild[], drop: DomChild): void => {
  const i = kids.indexOf(drop);
  const prev = kids[i - 1] ?? null;
  const next = kids[i + 1] ?? null;
  if (prev) prev.next = next;
  if (next) next.prev = prev;
  kids.splice(i, 1);
  drop.parent = null;
};

// raw / outlook-only blocks that only held a preheader would otherwise leave an empty shell.
const pruneEmptyHints = (el: DomNode): void => {
  if (!isElement(el) || !/^(raw|outlook-only)$/.test(el.attribs["data-email"] ?? "")) return;
  if (children(el).some((c) => !(isText(c) && c.data.trim() === ""))) return;
  const parent = el.parent;
  if (!parent) return;
  detach(children(parent), el);
  pruneEmptyHints(parent);
};

const templateAttr = (el: DomElement): string | undefined => {
  if ((TDDR_TAGS as readonly string[]).includes(el.name)) return `<${el.name}>`;
  const a = TEMPLATE_ATTRS.find((name) => el.attribs[name] !== undefined);
  return a && `${a}="${el.attribs[a]}"`;
};

const PREHEADER_HINT = "The preheader is one string and takes no blocks. Put the condition on the content of a placeholder instead, e.g. send the preheader text as a field.";

// The scheme a URL attribute holds that isn't allowed; one bad srcset or ping entry is enough.
const badUrl = (tag: string, name: string, value: string): string | undefined => {
  if (name === "srcset") return srcsetUrls(value).map((u) => badScheme(u, "image")).find(Boolean);
  if (name === "ping") return value.split(/\s+/).map((u) => badScheme(u, "link")).find(Boolean);
  const use: UrlUse | undefined = IMAGE_ATTRS.has(name) || (name === "src" && tag === "img") ? "image" : LINK_ATTRS.has(name) ? "link" : undefined;
  return use && badScheme(value, use);
};

// What a browser would parse back as one tag: `scr<script` would not (HTML's valid custom
// element names, plus the o:/v: prefixes Office markup uses).
const TAG_NAME = /^[a-z][a-z0-9._:\-\u00b7\u00c0-\u{effff}]*$/iu;
const TAG_HINT = "A stray < starts a tag; write it as &lt; in text.";

type Category = "script" | "handler" | "svg" | "srcdoc" | "formaction" | "tag" | `url:${string}`;
const WHAT: Record<string, string> = {
  script: "script element",
  handler: "event handler attribute",
  svg: "unsafe SVG content",
  srcdoc: "srcdoc attribute",
  formaction: "formaction attribute",
  tag: "element with an invalid tag name, its content kept",
};

// Puts a node's children where it was.
const unwrap = (kids: DomChild[], el: DomElement): void => {
  const inner = children(el);
  const i = kids.indexOf(el);
  const prev = kids[i - 1] ?? null;
  const next = kids[i + 1] ?? null;
  for (const k of inner) k.parent = el.parent;
  const first = inner[0] ?? next;
  const last = inner[inner.length - 1] ?? prev;
  if (prev) prev.next = first;
  if (next) next.prev = last;
  if (inner[0]) inner[0].prev = prev;
  if (inner[inner.length - 1]) inner[inner.length - 1]!.next = next;
  kids.splice(i, 1, ...inner);
  el.parent = null;
};

export const sanitize = (doc: ParsedDoc, ctx: Ctx): ParsedDoc => {
  const document = doc.document.cloneNode(true) as DomDocument;
  const body: DomElement | undefined = findElement(document, (el) => el.name === "body");
  if (!body) throw new Error("cloned document lost its <body>");
  const amp = ampMarker(document);
  if (amp) ctx.diagnostics.report("E008", { message: "AMP for Email input is not compiled", hint: AMP_HINT, loc: locOf(amp) });

  // One I001 per category, pointing at the first hit.
  const firstHit = new Map<Category, SrcLoc | undefined>();
  const note = (k: Category, n: DomNode): void => {
    if (!firstHit.has(k)) firstHit.set(k, locOf(n));
  };

  const preheader: string[] = [];
  // only what a reader would see; stylesheet-hidden text can't be known here
  const shown = (n: DomNode): string => {
    if (isText(n)) return n.data;
    if (!isElement(n) || "hidden" in n.attribs || /display\s*:\s*none/i.test(n.attribs["style"] ?? "")) return "";
    return children(n).map(shown).join("");
  };

  // The preheader leaves the body here, before any template hint is read, so a hint on, in or
  // around it would just be ignored.
  const hintAt = (el: DomElement, message: string): void => ctx.diagnostics.report("E012", { message, hint: PREHEADER_HINT, loc: locOf(el) });

  const cleanAttrs = (c: DomElement, svg: boolean): void => {
    for (const [name, value] of Object.entries(c.attribs)) {
      if (name.startsWith("on")) {
        note("handler", c);
        delete c.attribs[name];
      } else if (DOC_ATTRS.has(name)) {
        note(name as Category, c);
        delete c.attribs[name];
      } else if (svg && SVG_HREFS.includes(name) && isDataUrl(value)) {
        note("svg", c);
        delete c.attribs[name];
      } else {
        const scheme = svg && SVG_PAINT.has(name) ? cssUrls(value).map((u) => badScheme(u, "image")).find(Boolean) : badUrl(c.name.toLowerCase(), name, value);
        if (scheme === undefined) continue;
        note(`url:${scheme}`, c);
        delete c.attribs[name];
      }
      // data-* (data-v-* scoped styles, data-reactroot…) stay until the cascade has
      // used them; serializeStyled drops them from the output.
    }
  };

  // A nested preheader stays in its parent's subtree so the text reads in document order.
  let inPreheader = false;
  let guard: string | undefined;
  let inSvg = false;
  const walk = (node: DomNode): void => {
    const kids = children(node);
    for (const c of [...kids]) {
      if (isComment(c)) {
        if (!MSO_COMMENT.test(c.data)) detach(kids, c);
        continue;
      }
      if (!isElement(c)) continue;
      const hint = templateAttr(c);
      if (hint && inPreheader) hintAt(c, `${hint} inside a preheader`);
      if (c.attribs["data-email"] === "preheader") {
        if (hint && !inPreheader) hintAt(c, `${hint} on a preheader`);
        else if (guard && !inPreheader) hintAt(c, `a preheader inside ${guard} is always sent`);
        const nested = inPreheader;
        inPreheader = true;
        walk(c);
        inPreheader = nested;
        if (nested) continue;
        const text = children(c).map(shown).join("").replace(/\s+/g, " ").trim();
        if (text) preheader.push(text);
        else {
          ctx.diagnostics.report("W007", {
            message: "Preheader has no visible text and was dropped",
            hint: "Put the preview text inside the data-email=\"preheader\" element, and don't hide it with display:none or hidden.",
            loc: locOf(c),
          });
        }
        const parent = c.parent;
        detach(kids, c);
        if (parent) pruneEmptyHints(parent);
        continue;
      }
      // an svg title is its accessible name; DROP_TAGS is about the head title
      if (DROP_TAGS.has(c.name) && !(inSvg && c.name === "title")) {
        if (c.name === "script") note("script", c);
        detach(kids, c);
        continue;
      }
      const lower = c.name.toLowerCase();
      if (inSvg && (lower === "foreignobject" || (SAME_DOC_ONLY.has(lower) && SVG_HREFS.some((h) => !(c.attribs[h] ?? "#").trim().startsWith("#"))) || animatesHref(c))) {
        note("svg", c);
        detach(kids, c);
        continue;
      }
      if (EMBEDS.has(lower) || CONTROLS.has(lower)) {
        if (lower === "input" && c.attribs["type"]?.trim().toLowerCase() === "hidden") {
          ctx.diagnostics.report("I002", { message: "Hidden <input> dropped", hint: "A hidden input only feeds a form submit, which mail clients don't do.", loc: locOf(c) });
        } else {
          const embed = EMBEDS.has(lower);
          ctx.diagnostics.report("E008", {
            message: `<${lower}> removed: ${embed ? "mail clients don't load embedded documents or plugins" : "mail clients disable or strip form controls"}`,
            hint: embed ? EMBED_HINT : CONTROL_HINT,
            loc: locOf(c),
          });
        }
        detach(kids, c);
        continue;
      }
      cleanAttrs(c, inSvg || lower === "svg");
      const badName = !TAG_NAME.test(c.name);
      if (badName) note("tag", c);
      const outer = guard;
      guard = hint ?? guard;
      const wasSvg = inSvg;
      inSvg ||= lower === "svg";
      walk(c);
      inSvg = wasSvg;
      guard = outer;
      if (lower === "form") {
        ctx.diagnostics.report("E008", { message: "<form> removed, its content kept: mail clients disable or strip forms", hint: CONTROL_HINT, loc: locOf(c) });
        unwrap(kids, c);
      } else if (badName) unwrap(kids, c);
    }
  };
  // <picture> compiles as its <img>: the fallback every client loads anyway
  const pictureSelectors = new Set<string>();
  const stripped = doc.styles.map((s) => s.css.replace(/\/\*[\s\S]*?\*\//g, ""));
  for (const css of stripped) {
    for (const m of css.matchAll(/([^{}]+)\{/g)) {
      for (const sel of m[1]!.split(",").map((x) => x.trim())) {
        if (!sel.startsWith("@") && /(^|[\s>+~(])picture(?![\w-])/.test(sel)) pictureSelectors.add(sel);
      }
    }
  }
  for (const pic of findAllElements(body, (e) => e.name === "picture")) {
    const img = children(pic).find((k): k is DomElement => isElement(k) && k.name === "img");
    const parent = pic.parent;
    if (!img || !parent) continue;
    const sources = children(pic).some((k) => isElement(k) && k.name === "source");
    const own = ["class", "style", "id"].filter((k) => pic.attribs[k] !== undefined);
    const extra = children(pic).filter((k) => k !== img && !isComment(k) && !(isElement(k) && k.name === "source") && !(isText(k) && k.data.trim() === ""));
    if (sources) ctx.diagnostics.report("I007", { message: "<picture> sources dropped, the <img> is used", loc: locOf(pic) });
    if (own.length > 0) {
      ctx.diagnostics.report("W001", {
        message: `<picture> ${own.join("/")} attributes dropped, the <img> is used: what they style is lost`,
        hint: "Put the class or style on the <img> itself.",
        loc: locOf(pic),
      });
    }
    if (extra.length > 0) {
      ctx.diagnostics.report("W001", {
        message: "<picture> content other than <source> and the first <img> is dropped",
        hint: "A <picture> compiles as its first <img>; move anything else out of it.",
        loc: locOf(pic),
      });
    }
    for (const sel of pictureSelectors) {
      ctx.diagnostics.report("W001", {
        message: `selector "${sel}" targets a <picture>, which compiles as its <img>: it no longer matches there`,
        hint: "Select the image itself (img, .hero img) or give the <img> a class.",
        loc: locOf(pic),
      });
    }
    pictureSelectors.clear();
    children(parent).splice(children(parent).indexOf(pic), 1, img);
    img.parent = parent;
    img.prev = pic.prev;
    img.next = pic.next;
    if (pic.prev) pic.prev.next = img;
    if (pic.next) pic.next.prev = img;
  }
  cleanAttrs(body, false);
  walk(body);
  markChains(body, ctx);

  for (const [k, loc] of firstHit) {
    if (k.startsWith("url:")) ctx.diagnostics.report("I001", { message: `Removed ${k.slice(4)}: URL`, hint: URL_HINT, loc });
    else if (k === "tag") ctx.diagnostics.report("I001", { message: `Removed ${WHAT[k]}`, hint: TAG_HINT, loc });
    else ctx.diagnostics.report("I001", { message: `Removed ${WHAT[k]}`, loc });
  }

  const meta = preheader.length > 0 ? { ...doc.meta, preheader: preheader.join(" ") } : doc.meta;
  return { document, body, styles: doc.styles, meta };
};

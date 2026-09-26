import type { Ctx } from "../../ctx.ts";
import { withLoc, type Box, type ButtonNode } from "../../ir/index.ts";
import type { StyledElement } from "../../style/types.ts";
import { buildBox, reportDropped } from "../box.ts";
import { firstStop } from "../box-paint.ts";
import { isLinkBox, looksLikeButton } from "../classify.ts";
import { textStyle } from "../children.ts";
import { lintTree } from "../lint.ts";
import type { Rule } from "../rule.ts";
import { serializeStyled } from "../serialize-styled.ts";

const hasImage = (el: StyledElement): boolean => {
  const bi = el.style["background-image"];
  return bi !== undefined && bi !== "none";
};

const withoutProps = (rec: Readonly<Record<string, string>>, drop: RegExp): Record<string, string> =>
  Object.fromEntries(Object.entries(rec).filter(([p]) => !drop.test(p)));

// Properties the button turns into its own markup (or reports itself).
const HANDLED = /^(background-image|text-decoration)/;

// Everything else on the link (aria, target, id, tracking attrs) rides along on the emitted <a>.
const OWN_ATTRS = new Set(["href", "class", "style", "data-email"]);

// Clients can't paint an image or gradient behind a button: its first stop fills it, else its background-color.
const solidFill = (a: StyledElement, box: Box, ctx: Ctx): Box => {
  if (!hasImage(a)) return box;
  const stop = box.background === undefined ? firstStop(a.style["background-image"]!) : undefined;
  const filled = stop ? { ...box, background: stop } : box;
  const what = /gradient\(/.test(a.style["background-image"]!) ? "gradient" : "background image";
  ctx.diagnostics.report("W001", {
    message:
      filled.background === undefined
        ? `${what} dropped, the button has no background`
        : `${what} dropped, the ${stop ? "first colour stop" : "background-color"} is used`,
    hint: "Email clients can't render gradients or images behind a button; set a solid background-color.",
    loc: a.loc,
  });
  return filled;
};

// An inline-level button sits where its parent's text-align puts it, not its own.
const lineAlign = (a: StyledElement, box: Box): Box => {
  if (box.align || a.style["display"] === "block") return box;
  const own = "text-align" in a.declared;
  const ta = a.parentStyle ? a.parentStyle["text-align"] : own ? undefined : a.style["text-align"];
  if (ta === "center") return { ...box, align: "center" };
  if (ta === "right" || ta === "end") return { ...box, align: "right" };
  return box;
};

const without = (box: Box, key: "maxWidth" | "align"): Box => {
  const { [key]: _drop, ...rest } = box;
  return rest;
};

const buttonWidth = (a: StyledElement, box: Box, ctx: Ctx): Box => {
  const block = a.style["display"] === "block";
  let out = box;
  // A capped block CTA stays fluid (the emitter adds an Outlook ghost table at the cap);
  // a px width under the cap makes the cap moot.
  if (block && out.maxWidth !== undefined) {
    out = out.width && "px" in out.width ? { ...without(out, "maxWidth"), width: { px: Math.min(out.width.px, out.maxWidth) } } : { ...out, width: { pct: 100 } };
  }

  // An inline-level button is content-sized, so a max-width has nothing to cap.
  if (out.maxWidth !== undefined && !block) {
    ctx.diagnostics.report("W001", {
      message: "max-width on an inline button is dropped",
      hint: "Use display: block with max-width, or give the button a width.",
      loc: a.loc,
    });
    out = without(out, "maxWidth");
  }

  // A block link the author wrote fills its container, so auto margins and text-align have nothing
  // left to align. A full-width button that still has an align was shrunk by its flex parent
  // (align-items: center), which the emitter honours. A link that is only block because a flex
  // parent blockified it keeps no width: the flex rule decides how wide it is.
  if (a.declared["display"] === "block" && !out.width) out = { ...out, width: { pct: 100 } };
  if (out.width && "pct" in out.width && out.width.pct === 100 && out.maxWidth === undefined) out = without(out, "align");
  return out;
};

const buildButton = (a: StyledElement, ctx: Ctx): ButtonNode => {
  for (const c of a.children) if (c.type === "element") lintTree(c, ctx);
  // without the hint this link would be lowered as a clickable card
  if (a.attrs["data-email"] === "button" && isLinkBox({ ...a, attrs: { ...a.attrs, "data-email": "" } })) {
    ctx.diagnostics.report("W001", {
      message: 'data-email="button" on a link around layout: the layout inside stays plain markup in the button',
      hint: 'Drop data-email="button" to lower the link as a clickable card, or put only text and inline elements inside the button.',
      loc: a.loc,
    });
  }

  const plain: StyledElement = { ...a, declared: withoutProps(a.declared, HANDLED) };
  const built = buildBox(a, ctx);
  reportDropped(plain, ctx);
  const box = buttonWidth(a, lineAlign(a, solidFill(a, built, ctx)), ctx);

  // A flex parent sizes its items, so an implicit 100% usually ends up content-sized.
  const flexSized = /flex/.test(a.parentStyle?.["display"] ?? "") && !a.declared["width"];
  if (box.radii) {
    ctx.diagnostics.report("W003", {
      message: "Outlook rounds every corner of a button alike, using the largest radius",
      hint: "Its VML shape has one corner radius; give all four corners the same value to match.",
      loc: a.loc,
    });
  }

  if (box.radius && !(box.width && "px" in box.width) && box.maxWidth === undefined) {
    const pct = box.width !== undefined && !flexSized;
    ctx.diagnostics.report("W003", {
      message: pct ? "Outlook shows square corners; give the button a px width" : "Outlook button size is estimated; give the button a px width",
      hint: pct
        ? "Outlook can only round a button of a known pixel size, so a percentage width keeps square corners there."
        : "Outlook draws rounded buttons with a fixed-size shape, so td;dr guesses it from the text.",
      loc: a.loc,
    });
  }

  const decoration = a.style["text-decoration-line"] ?? a.style["text-decoration"] ?? "none";
  const attrs = Object.fromEntries(Object.entries(a.attrs).filter(([k]) => !OWN_ATTRS.has(k)));
  const node: ButtonNode = {
    kind: "button",
    box,
    href: a.attrs["href"] ?? "",
    ...(Object.keys(attrs).length ? { attrs } : {}),
    content: serializeStyled(a.children, a.style),
    style: { ...textStyle(a.style), "text-decoration": decoration },
  };
  return withLoc(node, a.loc);
};

export const buttonRule: Rule = {
  name: "button",
  matches: (el) => looksLikeButton(el),
  analyze: (el, ctx) => buildButton(el, ctx),
};

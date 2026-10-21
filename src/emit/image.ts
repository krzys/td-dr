import { borderX, type ImageNode } from "../ir/index.ts";
import { attrString, borderDecls, escAttr, legacyColor, paddingValue, radiusValue, styleString, type Decls } from "./attrs.ts";
import { onLine } from "./plan.ts";
import { tableOpen, tr, withBody, wrap } from "./serialize.ts";
import { markAttr, type TraceScope } from "./trace.ts";

export const emitImage = (s: TraceScope, n: ImageNode): string => {
  const { box, width: w, height: h } = n;
  const fluid = !!n.fluid;
  // Padding around the image means the paint frames it (an icon in a circle or ring): the cell
  // wears the border and radius, the icon itself stays square.
  const frame = paddingValue(box.padding) !== undefined;
  const imgStyle = styleString([
    // an inline source image keeps the gap its text line leaves under it, like the browser does
    ["display", onLine(n) ? undefined : "block"],
    // CSS float for the clients that read it; Outlook reads the align attribute below
    ["float", n.float],
    ["border", "0"],
    ["outline", "none"],
    ["text-decoration", "none"],
    ["width", fluid ? "100%" : w ? `${w}px` : undefined],
    ["max-width", fluid && w ? `${w}px` : undefined],
    // an author-set height stays fixed on a fluid image too (height:auto in the source clears it)
    ["height", h ? `${h}px` : fluid || w ? "auto" : undefined],
    ...(frame ? [] : borderDecls(box.border)),
    ["border-radius", frame ? undefined : radiusValue(box)],
  ]);
  let img =
    `<img${attrString([["src", n.src]])} alt="${escAttr(n.alt)}"` +
    attrString([["width", w], ["height", fluid ? undefined : h], ["align", n.float], ["style", imgStyle], ...markAttr(s)]) +
    ">";
  if (n.href) img = wrap(s, "a", [["href", n.href], ["target", "_blank"], ["style", "text-decoration:none;"]], img);
  const pad = paddingValue(box.padding);
  if (!pad && !box.background) return img;
  // The paint hugs the image, like the link or box it came from; fluid images fill the slot.
  const outer = !fluid && w ? w + box.padding.left + box.padding.right : undefined;
  const borders = frame ? borderDecls(box.border) : [];
  const frameX = frame ? borderX(box) : 0;
  const cell = wrap(
    s,
    "td",
    [
      ["width", outer],
      ["align", frame ? "center" : undefined],
      ["valign", frame ? "middle" : undefined],
      ["bgcolor", legacyColor(box.background)],
      ["style", styleString([["padding", pad], ["background-color", box.background], ...borders, ["border-radius", radiusValue(box)]])],
    ],
    img,
  );
  const sep: Decls = [["border-collapse", box.radius ? "separate" : undefined]];
  const table = outer
    ? tableOpen(s, String(outer + frameX), [["width", `${outer + frameX}px`], ...sep], box.align)
    : tableOpen(s, "100%", [["width", "100%"], ...sep]);
  return withBody(table, tr(cell));
};

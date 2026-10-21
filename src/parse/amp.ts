// AMP for Email is its own MIME part (text/x-amp-html) with its own runtime; td;dr compiles the
// text/html part (docs/support.md#sanitizing).
import { findElement, type DomDocument, type DomElement } from "./dom.ts";

export const AMP_HINT =
  "td;dr compiles the text/html part of an email. AMP for Email goes in its own text/x-amp-html MIME part next to it; compile a plain HTML version of the message here.";

// <html ⚡4email> or <html amp4email>
const AMP_HTML = ["⚡4email", "amp4email"];
const RUNTIME = /^https?:\/\/cdn\.ampproject\.org\//i;

// The first element that marks the input as AMP: the html flag, an amp-* element or the runtime.
export const ampMarker = (document: DomDocument): DomElement | undefined =>
  findElement(
    document,
    (el) =>
      (el.name === "html" && AMP_HTML.some((a) => el.attribs[a] !== undefined)) ||
      el.name.startsWith("amp-") ||
      (el.name === "script" && RUNTIME.test(el.attribs["src"]?.trim() ?? "")),
  );

// The style that hides the body until the AMP runtime has run; without it, nothing shows.
export const isAmpBoilerplate = (style: DomElement): boolean =>
  style.attribs["amp4email-boilerplate"] !== undefined || style.attribs["amp-boilerplate"] !== undefined;

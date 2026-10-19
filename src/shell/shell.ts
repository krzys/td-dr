import type { Ctx } from "../ctx.ts";
import { ghostClose, ghostOpen, OFFICE_SETTINGS } from "../emit/mso.ts";
import type { Emitted } from "../emit/types.ts";
import type { DocMeta } from "../parse/html.ts";

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const RESET_CSS = `body { margin:0; padding:0; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
table, td { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
a[x-apple-data-detectors] { color:inherit !important; text-decoration:none !important; }
u + #body a { color:inherit; text-decoration:none; }`;

const TABLE = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';

// Hidden in every client; the filler keeps body text out of the inbox preview.
const PREHEADER_STYLE = "display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:transparent;opacity:0";
const preheaderDiv = (text: string): string => {
  const fill = "&zwnj;&nbsp;".repeat(Math.max(0, Math.ceil((140 - text.length) / 2)));
  // text, not an attribute: quotes and > stay as written so template tags survive
  return `<div style="${PREHEADER_STYLE}">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}${fill}</div>`;
};

// The head rules for phones, dark mode and hover (src/responsive); the dark meta is only for pages with dark rules.
export type HeadRules = { css: string; dark: boolean };

export const shell = (emitted: Emitted, meta: DocMeta, ctx: Ctx, fontHead: string, rules?: HeadRules): string => {
  const lang = esc(meta.lang ?? ctx.options.lang ?? "en");
  const dir = meta.dir ? ` dir="${esc(meta.dir)}"` : "";
  const width = ctx.options.width;
  const bg = emitted.background ? esc(emitted.background) : undefined;

  const bodyStyle = `margin:0;padding:0;${bg ? `background-color:${bg};` : ""}`;
  const outerBg = bg ? ` bgcolor="${bg}"` : "";
  // what every cell inherits where the client sets a base line height (docs/support.md#text-styles)
  const outerStyle = `width:100%;line-height:normal;${bg ? `background-color:${bg};` : ""}`;

  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta http-equiv="X-UA-Compatible" content="IE=edge">',
    '<meta name="x-apple-disable-message-reformatting">',
    '<meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">',
    ...(rules?.dark ? ['<meta name="color-scheme" content="light dark">', '<meta name="supported-color-schemes" content="light dark">'] : []),
    `<title>${esc(meta.title ?? "")}</title>`,
    OFFICE_SETTINGS,
    `<style>\n${RESET_CSS}\n</style>`,
  ];
  if (fontHead) head.push(fontHead);
  if (emitted.headCss.length > 0) head.push(`<style>\n${emitted.headCss.join("\n")}\n</style>`);
  if (rules) head.push(`<style>\n${rules.css}\n</style>`);

  return [
    "<!DOCTYPE html>",
    `<html lang="${lang}"${dir} xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">`,
    "<head>",
    ...head,
    "</head>",
    // no class: Roundcube scopes head rules under its body class, which an authored one replaces (docs/support.md#the-email-shell)
    `<body id="body" style="${bodyStyle}">`,
    ...(meta.preheader ? [preheaderDiv(meta.preheader)] : []),
    `<div role="article" aria-roledescription="email" lang="${lang}"${dir}>`,
    `<table ${TABLE} width="100%"${outerBg} style="${outerStyle}">`,
    '<tr><td align="center" style="padding:0;">',
    ghostOpen(width, "center"),
    `<table ${TABLE} width="100%" style="width:100%;max-width:${width}px;table-layout:fixed;">`,
    // LiteHTML (and reportedly Word) carry the centring align into nested tables: the content cell states the document's side (docs/support.md#the-email-shell)
    `<tr><td style="text-align:${meta.dir?.toLowerCase() === "rtl" ? "right" : "left"};">${emitted.html}</td></tr>`,
    "</table>",
    ghostClose(),
    "</td></tr>",
    "</table>",
    "</div>",
    "</body>",
    "</html>",
  ].join("\n");
};

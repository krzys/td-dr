# The email shell

The document every compile is wrapped in (`src/shell/shell.ts`), the text styles every cell
carries, and the client behaviours behind both.

## The document

HTML5 doctype; `<html lang dir>` with the VML and Office namespaces; charset, viewport, Apple and
format-detection metas (colour-scheme metas only with dark rules); the MSO `OfficeDocumentSettings`
block; a fixed reset `<style>`; the hidden preheader as the first body child; a `role="article"`
wrapper; one full-width table centring a fluid content table capped at the design width, with an
Outlook ghost table at that width.

```html
<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">
<title>…</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
body { margin:0; padding:0; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
table, td { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
a[x-apple-data-detectors] { color:inherit !important; text-decoration:none !important; }
u + .body a { color:inherit; text-decoration:none; }
</style>
<!-- then: web fonts, emitter head CSS, responsive / dark / hover rules -->
</head>
<body id="body" class="body" style="margin:0;padding:0;background-color:#f4f4f4;">
<div style="display:none;…">Preview text&zwnj;&nbsp;…</div>
<div role="article" aria-roledescription="email" lang="en">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#f4f4f4" style="width:100%;background-color:#f4f4f4;">
<tr><td align="center" style="padding:0;">
<!--[if mso]><table role="presentation" width="600" align="center" …><tr><td><![endif]-->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;max-width:600px;table-layout:fixed;">
<tr><td>…content…</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</div>
</body>
</html>
```

`lang` comes from `<html lang>`, else the `lang` option (a component's `export const lang`, or
`--lang`), else `en` with I009. `dir` is written when the source sets one. The root container's
background becomes the page background. `<title>` is the source's title (empty otherwise).

Why each piece:

- **Outlook** ignores `max-width` on tables it doesn't size itself, hence the ghost table
  ([outlook.md](outlook.md#ghost-tables)). Without `PixelsPerInch` 96 it scales images and tables
  wrongly on high-DPI displays; the block sits in `<noscript>` so other parsers skip it.
- **Gmail** turns `<body>` into a `<div>` and may replace the doctype, so the page background lives
  on the wrapper table, and `u + .body` targets Gmail. It ignores `color-scheme` and applies its own
  inversion, so the colour-scheme metas appear only with dark rules.
- **Apple Mail and iOS:** `x-apple-disable-message-reformatting` stops iOS shrinking wide emails.
  iOS links phone numbers, dates, addresses and tracking numbers itself (blue, underlined); the
  `a[x-apple-data-detectors]` rule restyles them and `format-detection` suppresses some types (on
  macOS **unverified**). Without `-webkit-text-size-adjust:100%` iOS may enlarge small text; it is
  never `none`, which can block user scaling (**unverified**).
- The viewport meta never carries `user-scalable=no` or `maximum-scale=1`: they block zoom.

## Preheader

One hidden `div` as the first child of `<body>` holds the inbox preview text, followed by
`&zwnj;&nbsp;` pairs so the client has nothing else to pull into the preview line.

```html
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:transparent;opacity:0">Hi {{first_name}}, your order shipped&zwnj;&nbsp;&zwnj;&nbsp;…</div>
```

- `display:none` hides it in every major client; the preview still reads it. `max-height:0`,
  `overflow:hidden`, `opacity:0`, `color:transparent` and 1px text are for clients that ignore
  `display:none` on some elements; `mso-hide:all` hides it in Outlook for Windows. Screen readers
  skip it (**unverified** per client).
- Previews show about 40 to 140 characters. Without padding the client continues with the first
  body text. `&zwnj;&nbsp;` pairs are invisible and not collapsed, so they fill the line; td;dr pads
  to about 140 characters, longer text gets no filler.
- Authoring: any element with `data-email="preheader"`. Sanitize removes it from the body and keeps
  its text (whitespace collapsed); several elements join with a space, in document order. An
  element with no visible text is dropped with W007. No preheader in the input: no div.
- The shell escapes only `&` and `<`, so quotes, `>` and template fields survive. A template hint on
  or inside a preheader is E012: the preheader is one string; send its text as a field.
- Some clients take preview text from the plain-text part, not the HTML.

The same hide is used for content shown on some screens only ([head-styles.md](head-styles.md#show-hide-and-stack)).

## Text styles and defaults

Every element that directly holds text (`td`, `p`, `h1`–`h6`) carries its own text styles:
`font-family`, `font-size`, `line-height`, `color`, and `mso-line-height-rule:exactly` next to a px
`line-height`. A cell whose only content is one text block leaves out the declarations that block
restates (the block keeps them, so Outlook still styles it). Pass-through elements carry every
inherited value spelled out, so client defaults can't change them. Layout tables keep
`role="presentation"`, `cellpadding="0"`, `cellspacing="0"` and `border="0"`; `bgcolor` is 6-digit
hex.

```html
<td style="padding:0 0 16px 0;">
  <p style="margin:0;font-family:Arial,sans-serif;font-size:16px;line-height:24px;mso-line-height-rule:exactly;color:#333333;">Hi</p>
</td>
```

- **Outlook nested tables:** text inside an inner table snaps back to `<body>` styles even when the
  outer cell is styled, so every text-owning cell needs its own set.
- **`mso-line-height-rule`** works only on block elements, on the same element as the px
  `line-height` it modifies; not on cells holding only images. Without it Outlook treats px and em
  line heights oddly.
- **Outlook headings and paragraphs:** Word applies its own paragraph spacing; `margin:0` on `p` and
  `h*` stays (the spacing lives on cells).
- **Gmail** drops body-level font and background; the wrapper cell carries them.
- **`cellspacing="0"`** stays: Word ignores `border-spacing`.
- Not done, and to be enabled only after real-client test sends: dropping `border="0"` on tables,
  3-digit hex in CSS, `0px` → `0`, setting font properties once per run of cells, repeating
  `font-weight` per cell.

## Accessibility

Every layout table, ghost tables included, carries `role="presentation"`, or screen readers
announce data tables. `lang` (and `dir` when known) goes on `<html>` and on the `role="article"`
wrapper, because some clients strip `<html>` attributes. Linked images use their `alt` as the link
name; decorative images get `alt=""`. Reading order is source order. td;dr adds nothing else and
lints only what is decidable from the source.

Yahoo and AOL keep `role` only on tables and drop `lang` on cells, so nothing relies on cell-level
attributes. Some sanitizers strip ARIA; `alt` stays the primary name for images. caniemail data for
these attributes is old; "supported" means the attribute survives sanitizing, not that every screen
reader uses it.

The checks run on the styled input (`src/lint/`), skip hidden content and Outlook-only blocks, and
treat any template field in link text or alt as a valid name. None are errors.

| Code | Check |
|---|---|
| W015 | `<a href>` with no text, no `aria-label` and only images with empty or missing `alt`. |
| W016 | Text contrast under WCAG AA (4.5:1; 3:1 for text ≥ 24px, or ≥ 18.66px bold), against the nearest solid background, else the fallback colour behind an image, else white. One diagnostic per colour pair. |
| I009 | Neither `<html lang>` nor the `lang` option set the language; `en` was used. |
| I010 | Link text that says nothing on its own (`click here`, `read more`, a bare URL). |
| I011 | Skipped heading levels or more than one `h1` (branches of an if / else count as alternatives). A missing `h1` is fine. |
| I012 | Alt text that is a file name, the image's own file name, or a placeholder word (`image`, `photo`, `logo`). |
| I013 | Visible text under 12px, once per size; 1px text and `transparent` colour count as hidden. |

Not linted: alt quality, whether link text matches its target, missing `h1`, text in images,
reading order.

## Right-to-left text

`direction:rtl` goes in the inline style of the cell and the text element that hold the text; no
`dir` attribute on td;dr's tables and cells. caniemail `css-direction` is supported in every target,
Outlook for Windows included (Gmail mobile webmail applies rtl to the whole email when it finds
right-to-left text), while `html-dir` is partial in Outlook for Windows and removed from tables and
cells by some webmails. `direction` inherits, so it goes on the text-owning cell with the other text
styles.

```html
<td style="font-size:14px;direction:rtl;"><p style="font-size:14px;direction:rtl;margin:0">…</p></td>
```

- `dir="rtl"` / `dir="ltr"` sets `direction` unless the author's CSS sets one; `dir="auto"` is not
  resolved. The resolved direction decides where `*-inline-start` / `*-inline-end` land, so padding
  and borders already sit on the physical side.
- `dir` on `<html>` is kept on `<html>` and the article wrapper; an author's `dir` on a text element
  (`<p>`, `<bdi>`) is left as written.
- Flex rows and grids are not mirrored: columns are emitted left to right with W001 on the
  container. Write items in visual order, or stack them.

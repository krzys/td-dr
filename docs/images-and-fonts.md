# Images and fonts

## Images on a text line

An `<img>` (or `<a><img></a>`) that is inline in the source sits on its parent's text line, and the
line's strut leaves a few px under it for descenders. Every client draws that gap;
`display:block` removes it. When the source image was inline, the emitter keeps it inline and gives
its cell the parent's text styles, so the gap is the source's:

```html
<td style="font-family:…;font-size:16px;line-height:24px;"><img src="…" width="20" height="20" alt=""></td>
```

Authored `display:block`, and flex or grid items (blockified), are written as blocks. An image with
padding or a background (a framed icon) is a box either way. The exact gap height per client is
**unverified**.

Images are fluid (`max-width: 100%`) or fixed, always with `width` / `height` attributes: Outlook
sizes from them, and retina images need a `width` attribute and `height:auto`. Linked images get
`border:0` (old Outlook draws a blue border).

## Floated images

`float: left | right` on an `<img>` is the only float with an email equivalent (any other float is
E004). The emitter writes `align="left|right"` and keeps the CSS float: Outlook reads the
attribute, the others either. Text in the same block wraps around it.

```html
<p><img src="a.png" alt="" width="120" height="120" align="left" hspace="16" vspace="8"
        style="float:left;width:120px;height:120px;margin:8px 16px">Text that wraps…</p>
```

- Only text in the same block wraps. An image that is its own block is lowered into its own cell:
  it gets the attribute, nothing wraps (W001). Each block lowers to its own cell, so a floated image
  taller than its paragraph doesn't wrap the next one (W001).
- Outlook ignores margins on images. `hspace` / `vspace` apply to both sides, so they are written
  only for symmetric px margins; uneven or non-px margins stay CSS-only with W005. In a lowered
  image cell the margin becomes cell padding, which Outlook honours.
- Flex and grid items ignore `float` in browsers, so none is written.
- An authored `align` / `hspace` / `vspace` is replaced when a CSS float is set.
- caniemail `html-align`: supported in Gmail, Apple Mail, Yahoo, Outlook 2019 and Outlook.com; some
  smaller clients ignore it on images, which is why the CSS float stays. `hspace` / `vspace` are
  **unverified** outside Outlook.

## `<picture>`

Gmail, Outlook, Yahoo and AOL replace or strip `<picture>` and `<source>`; only Apple Mail, Samsung
and Thunderbird use the sources. So a `<picture>` compiles as its `<img>`, removed by sanitize
before the cascade (I007 when it had sources). Styles on the `<picture>` itself are lost (W001 when
it has a class, style or id), as is anything inside besides `<source>` and the first `<img>`; a
selector through it (`picture img`) stops matching (W001). A `<picture>` without an `<img>` is E008.

## Hosted and embedded images

Images default to an absolute hosted URL. `data:` URIs fail in Gmail (every surface) and in most
Outlook for Windows versions, so they are emitted only when every target client shows them. CID
references are a per-send MIME feature and are passed through untouched.

| Client | `data:` in `<img src>` |
|---|---|
| Gmail (web, iOS, Android, mobile web) | ❌ |
| Outlook for Windows 2007–2016 | ❌ |
| Outlook for Windows 2019 | ⚠️ PNG / JPEG yes, GIF no |
| Windows Mail / new Outlook | ❌ (new Outlook **unverified**) |
| Outlook.com, Outlook iOS / Android / macOS | ✅ |
| Apple Mail, Yahoo, AOL, Samsung, Thunderbird | ✅ |

- `data:` in CSS backgrounds and VML fills has no client data; it is assumed to fail in Gmail and
  Outlook and is never emitted.
- A `data:` URI counts toward Gmail's ~102 KB clip; a hosted image counts only as its URL. Base64
  also adds about a third to the image's size.
- Gmail serves images through its proxy and shows neither `data:` URIs nor SVG.

In folder builds and the dev server (`adapters/vite/assets.ts`):

- Relative URLs (an imported asset, a file in the public folder, any path without a scheme) are
  placed before compiling. Hosted, `data:`, `cid:` and `#` URLs, and fields that fill a whole URL,
  pass through.
- An `<img>` is inlined as a `data:` URI only when every target shows `data:` images (caniemail
  `image-base64` all `y`), it is PNG, JPEG or GIF, and it is at most 32 KB; above 8 KB that is W008.
  The default `broad` targets include Gmail, so by default nothing is inlined.
- Everything else, and CSS backgrounds always, is hosted under `--base-url` as
  `<name>-<hash8>.<ext>` and copied to `<out>/assets`. Without a base URL: E015, and the URL stays
  as it was (the dev preview still shows it).
- A relative URL that isn't a project file (a missing file, a path built from a field) is E015,
  unless there is a base URL, under which it is read as hosted.
- Vite's own asset inlining is off in the email environment, so small imports don't become
  `data:` URIs before this step.

## SVG

`<img src="*.svg">` is rasterized by Gmail and unsupported in older Outlook. Inline `<svg>` works in
Apple Mail and Samsung only, and there is no rasterizer in td;dr, so inline `<svg>` is E008. With
`allowSvg` it is kept with W010 and sanitized: scripts, handlers, `javascript:` / `data:` hrefs,
`<foreignObject>`, `href`-targeting animation and external `<use>` / `<feImage>` references are
removed.

## Web fonts

The author's font loading stays in the head, wrapped in `<!--[if !mso]><!-->…<!--<![endif]-->` so
Outlook for Windows never sees it, plus an `<!--[if mso]>` `<style>` that forces the first non-web
family of the author's own stack. Inline `font-family` always carries the full stack: web font, a
safe named font, a generic family. Clients that don't load the font use the next family.

```html
<head>
<!--[if !mso]><!-->
<!-- one of: a stylesheet link to a known font host, an @import, or @font-face rules -->
<link rel="stylesheet" href="https://FONT-HOST/css2?family=Inter:wght@400;700&display=swap">
<style>@import url('https://FONT-HOST/css2?family=Inter:wght@400;700&display=swap');</style>
<style>@font-face{font-family:'Inter';font-weight:400;src:url(https://example.com/inter-400.woff2) format('woff2');}</style>
<!--<![endif]-->
<!--[if mso]>
<style>body,table,td,th,p,a,li,span,div,h1,h2,h3,h4,h5,h6{font-family:Arial,Helvetica,sans-serif !important;}</style>
<![endif]-->
</head>
…
<td style="font-family:Inter,Arial,Helvetica,sans-serif;font-size:16px;">…</td>
```

The author writes one of the three forms; td;dr emits that form, never a converted one. `@import`
gets its own `<style>`, since it must be the first rule there.

| Client | `<link>` | `@import` | `@font-face` |
|---|---|---|---|
| Gmail | ❌ | ❌ | ❌ (only fonts Gmail ships itself render) |
| Outlook (Windows) | ⚠️ parsed, font not loaded, Times New Roman risk | ⚠️ same | ⚠️ same |
| Outlook.com, new Outlook | ❌ (new Outlook **unverified**) | ❌ | ❌ |
| Apple Mail macOS / iOS | ✅ | ✅ | ✅ |
| Outlook macOS | ❌ in recent versions | ❌ in recent versions | ❌ in recent versions |
| Outlook iOS / Android | ❌ | ❌ | ⚠️ older iOS only |
| Yahoo | ❌ | ❌ | ❌ |
| Samsung Email | ❌ | ❌ | ✅ (not with Outlook.com accounts) |
| Thunderbird | ⚠️ older versions | ⚠️ older versions | ✅ |

- **Outlook for Windows and Times New Roman:** when a font is declared by any of the three forms,
  Word may take it as the family and ignore the rest of the stack. Hiding the loading from Outlook
  and the `!important` override fix it.
- **Gmail** drops `<link>` and `@import`; `@font-face` is kept but never loads. Whether a failed
  `@import` makes Gmail drop the whole `<style>` is **unverified**, hence its own block.
- `<link>` and `<style>` belong in the head; body `<style>` is dropped by several clients.
  Multi-word family names use single quotes inside the double-quoted `style` attribute.

What td;dr does (`src/shell/fonts.ts`):

- Collects author `<link rel="stylesheet">` from known font hosts (`src/parse/font-hosts.ts`),
  `@import url(…)` and `@font-face` in source order, and emits them once in the head block above.
  `@font-face` inside `@media` keeps its query; inside a `@supports` that is false for email it is
  not collected. Other author CSS goes through the normal cascade.
- Only `rel` and `href` are written on a link; `media`, `crossorigin`, `integrity` and `type` are
  dropped (W001).
- The Outlook fallback is the first family in the author's stack that no collected source declares
  and that isn't generic; none found: `sans-serif` / `serif` by the generic. One element-selector
  override is emitted; stacks that would need different fallbacks warn (W001).
- A link or `@import` whose URL names no family is guessed: the first non-web-safe family of a stack
  that names no declared family is taken as the web font (W001, once).
- No stack uses the web font: only the loading block is emitted, no override (I008 says no text
  uses it).
- I008 lists who shows the fallback; W013 when no stack names a web-safe family followed by a
  generic one.
- Not done: fetching a font host's CSS to inline `@font-face`; converting between forms.

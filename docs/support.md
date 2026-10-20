# Support and limits

What td;dr accepts, the email markup each feature becomes, where the result is approximate, and
what it refuses. Every refusal is a [diagnostic](#diagnostic-codes) with a source location and a
hint. Client claims not confirmed in a real client are marked **unverified**.

## Input

- A full document or a body fragment. `<style>` blocks (head or body) and the `css` option take
  part in the cascade; external stylesheets are not fetched (W001), except font host links.
- **Lowered to tables:** layout containers (`div`, `section`, flex and grid elements, anything
  block-level that holds blocks).
- **Passed through** with every inherited style spelled out inline: text-level content (`p`,
  `h1`–`h6`, `span`, `a`, `strong`, lists, `blockquote`, `pre`, real `<table>` markup).
- **Removed** (I001): scripts, event handlers, `javascript:` URLs.
- **Framework output** is cleaned by rule, not per framework: every comment goes except MSO
  conditionals and td;dr's own `tddr:` markers (so Vue's `<!---->`, `<!--[-->` and React's
  `<!-- -->`, `<!--$-->`); `script`, `noscript`, `template`, `link`, `meta`, `title`, `base` and
  `<style>` leave the body after their CSS, fonts and metadata are collected; React 19's hoisted
  image preloads are dropped. `data-*` attributes survive the cascade (scoped CSS selects on them)
  and are dropped at serialization, `data-email` excepted. Unused classes are removed after emission.

### Hints

| Attribute | Effect |
|---|---|
| `data-email="preheader"` | Inbox preview text ([preheader](#preheader)). |
| `data-email="outlook-only"` | Only Outlook for Windows sees it ([Outlook-only content](#outlook-only-content)). |
| `data-email="button"` | Force a [bulletproof button](#bulletproof-buttons). |
| `data-email="raw"` | Emitted as written, no lowering. |
| `data-email-if`, `-unless`, `-else-if`, `-else`, `-each`, `-as` | ESP template blocks ([templates.md](templates.md#hints-in-plain-html)). |

Any other `data-email` value is E011.

## CSS values

| Feature | Handling |
|---|---|
| Selectors, specificity, `!important`, inheritance, shorthands | Full cascade, inlined. |
| `@layer`, nesting, `@property` initial values | Resolved. |
| `@supports` | Evaluated statically for email; false blocks skipped; an unparsable condition is W002. |
| `var()`, `calc()` | Resolved. `calc(P% ± Npx)` stays a width on flex items; other mixed `calc()` is E006. |
| `em`, `rem`, `%` font sizes | px. `rem` is the root's computed font size (16px by default); in media queries `em` / `rem` are 16px. |
| `vw`, `vmin`, `vmax`, `clamp()`, `min()`, `max()` | Resolved at the [design width](#design-width) (I006). Text sizes stay live in a narrow-screen head rule; layout values are fixed. `vh` is E006. |
| `hsl()`, `oklch()`, `color-mix()`, other modern colours (`rgb()` stays, bar a `/` alpha) | Hex or `rgba()`. Translucent colours are flattened over a known solid backdrop; over an image or gradient they stay as written (W001). |
| Logical properties, `dir` | Physical sides by the resolved direction ([right-to-left](#right-to-left-text)). |
| `::before` / `::after` with static `content` | Written as text. Other pseudo-elements warn. |
| `@media` width and `prefers-color-scheme`, `:hover` | [Head styles](#head-styles). Other media features warn. |
| `@import`, `@font-face`, font `<link>` | [Web fonts](#web-fonts). |
| `@container`, other at-rules, rules inside a `style` attribute | Skipped (W001). |
| Invalid values (negative `gap`, unparsable declarations, selectors) | Ignored as a browser would (W002). |
| `box-shadow`, `text-shadow` | Dropped (W001); no email-safe form keeps them. |
| Positioning, transforms, animations and transitions | E002, E003, E009. |

## Layout

Each block is a table row. Vertical margins collapse first, then become cell padding; the emitter
never writes CSS margins. Layout tables carry `role="presentation"`, `cellpadding="0"`,
`cellspacing="0"`, `border="0"`.

### Design width

Outlook needs fixed px widths, so the email is laid out at one width, found from a quiet probe
cascade before anything is lowered (`src/analyze/design-width.ts`):

- The walk starts at `<body>` and descends through blocks made only of layout blocks, plus the
  classic skeleton (`table > tbody > tr >` one `td` holding only layout blocks).
- A candidate is a block with a px width: the smaller of `max-width` and `width`, plus padding and
  border under `content-box`; a table's `width` attribute counts when its style has none. It counts
  when centred (`margin: 0 auto`, `<table align="center">`, a `<center>` or `td align="center"`
  parent) or wider than 600.
- Several candidates: the widest. Text, an unsized block, a narrow left-aligned box or a painted
  wrapper add a 600 floor. None: 600.
- Not candidates: a link (walked through, never a candidate: a centred 200px button must not make
  a 200px email), `%`, `auto`, `vw`, hidden, preheader and Outlook-only blocks.
- A passed `width` option wins; a candidate wider than it is W011 (and not W004 again).

Lengths resolved at the design width (`vw`, `clamp()`) don't flex below it, except text sizes.

### Block flow

In CSS a block is as wide as its container; an auto-layout table grows to its content's minimum
width and pushes every enclosing table wider. So single-column stack tables outside any row column,
and the shell's wrapper, get `table-layout:fixed`; inside a row column (flex item, fluid column,
card) tables keep auto layout, as flex uses min-content too. Tables with a px width are left alone.

A full-width box shares its slot's cell instead of nesting a table, except a box with a left or
right border (in collapsed tables a side border is shared with the column and would move every
sibling row in by half); with several screens the base screen's border decides.

### Flex rows

A non-wrapping row is one table row, one cell per item.

| Feature | Output |
|---|---|
| px, `%` widths | Exact. |
| `calc(P% ± Npx)` | px is `content × P/100 + N`; exact at every width only in the N-up form (`calc(50% - 10px)` with a 20px gap). |
| Grow items | Share the leftover as `%`. |
| Content-sized items | No width: the client picks the font (W003 where it matters). |
| `gap` | px gutter padding in proportion to each column's share, so a `%` column is its exact share of the leftover at any width. |
| `justify-content` | Cell alignment; with `center` / `flex-end` in a box with its own width, a shrink-wrapped table with `align`. |
| `align-items` | `valign`. |
| `flex-shrink: 0` px column | `min-width` on the cell (Outlook ignores it; the `width` attribute holds there). |
| `order` | Reordered at compile time. |
| `align-items: stretch` with painted items | Equal-height cards: the painted child becomes the column cell; gutters are spacer cells (`<td width="W">` with `padding-left:Wpx` as its min-content, `mso-padding-alt:0` for Outlook). |
| `row-reverse`, `column-reverse`, `wrap-reverse`, `align-content` | E007. |

A flex column is a stack; its `gap` becomes padding.

### Wrapping rows

`flex-wrap: wrap` becomes fluid-hybrid columns: inline-blocks with `width:100%` and a px
`max-width` in a row with `font-size:0`. They sit side by side where there is room and stack on
narrow screens without media queries, so the layout holds in clients that drop `<style>`. Outlook
gets a [ghost table](#ghost-tables) per line.

```html
<div style="font-size:0;text-align:left;">
  <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td width="300" valign="top"><![endif]-->
  <div style="display:inline-block;width:100%;max-width:300px;vertical-align:top;"><div style="font-size:16px;">A</div></div>
  <!--[if mso]></td><td width="300" valign="top"><![endif]-->
  <div style="display:inline-block;width:100%;max-width:300px;vertical-align:top;"><div style="font-size:16px;">B</div></div>
  <!--[if mso]></td></tr></table><![endif]-->
</div>
```

- **px basis or width** is the column's cap; lines are cut at the design width as the browser does.
- **Grow items** with a px basis grow into their own line's leftover at the design width. Below it
  the grown width is a cap, so a line can stack earlier than in the source (W003). A grow item
  without a px basis assumes 100px (W003); next to an auto-width item it isn't grown (W003).
- **`%` basis or width** stays a `%` inline-block (two 48% columns stay two-up on a phone). With
  fixed gaps the source stacks at some width and the output never does (W003 above phone width).
- **Gaps** are padding inside the columns. What the row's side padding can't give back comes off
  the overflowing line's first and last column, so lines break where the resolver says (W003).
- Painted items don't stretch to equal height (W003).

### Grids and table display

Grids with px, fr, `%` or `minmax(0, Nfr)` tracks (also `repeat(N, …)`) and gaps become table rows
filled in source order. Grid areas, spans, `auto-fill`, row templates and `subgrid` are E001.
`display: table` / `table-row` / `table-cell` become rows and cells.

### Height and vertical distribution

A flex column with `min-height` and `justify-content: flex-end | center | space-between |
space-around | space-evenly` gets a table exactly as tall as the cell. For `center` and `flex-end`,
and for a lone item of the `space-*` values, its one cell holds the rows with `valign="middle"` /
`"bottom"` (`"top"` for one `space-between` item), which Word honours too. Otherwise each item's
cell is `height="1"`, which the table never grows, and empty spacer rows
(`font-size:0;line-height:0;mso-line-height-rule:exactly`) sit around the items, one per share of
the spare height (two between items for `space-around`). Every engine shares spare height equally
between empty rows; `%` rows it doesn't (Gecko and WebKit fill them first to last). A screen may
switch between `center` and `flex-end`, or between the `space-*` values: then every gap has two
spacer rows, and the end ones a value doesn't use are hidden by the preheader's hide on the row (an
empty row still takes a share). Switching between the two groups changes the structure (E017)
unless there is one item. The rows are counted for the items as written: an item hidden on some
screen, or a loop or an `if` without `else` among them, leaves gaps that aren't spread again
(W003). Taller content grows the table. A one-line flex row with `align-items: center | flex-end`
gives its box cell the same `valign`.

A px `height` on a box that doesn't clip is its `min-height` (taller content grows the cell, with no
diagnostic). Over a VML background Outlook lays content out from the top (W003). How Word shares a
table's spare height between the spacer rows is **unverified**.

### Clipping and rounded corners

`overflow: hidden` is lowered in three shapes only; anything else is W001:

1. A rounded box whose first or last child touches the edge: the child gets the corner radii.
2. One line wider than its box (`white-space: nowrap`): a fixed-layout table whose cell clips.
3. A fixed-size painted box with one smaller centred image (an icon in a circle): the image's cell
   is the box.

In Outlook a clipped one-line strip may wrap or stretch its table (W003). `%` radii become px; the
smaller of horizontal and vertical radius is used. Rounded painted cells use the separate border
model so their corners show.

### Links around blocks

A `<table>` is never wrapped in `<a>` (invalid, and Outlook drops the link). A link box is an
`<a href>` holding real layout (flex, grid, or a child that is painted, padded, sized or holds
blocks); a link whose only `<div>` holds its label (that becomes a [button](#bulletproof-buttons)),
an inline-block link and `data-email="button"` are not. A link box is lowered as the box; each text
run and image inside gets its own `<a>` with the same attributes minus `style`, `id` and
`data-email`, and an explicit `color` and `text-decoration` (I004; the padding between them isn't
clickable). Overlay links (absolute positioning) are never emitted. The same `href` counting as
several links in click tracking is **unverified**.

### Lists, dividers and author tables

- Lists stay `<ul>` / `<ol>` / `<li>` with explicit margins, indent and text styles (Outlook
  doesn't inherit into lists reliably). Spacing around a list lives on the surrounding cells.
  As in browsers, a nested list has no top or bottom margin and circle, then square bullets, and
  `type` on `ol`, `ul` or `li` becomes `list-style-type`.
- In Outlook `margin-left` on `ul` and `li` adds up, and `<li value="n">` is rewritten as a new
  `<ol start="n">`. `reversed` is unsupported in Gmail, Outlook and Yahoo; `list-style-image`
  misrenders in Outlook.
- `<hr>` becomes an empty cell with a top border; gradient dividers fall back to a solid border. A
  `line-height:1px` divider renders thicker in Outlook without `mso-line-height-rule:exactly`.
- An author `<table>` passes through. The shell collapses every table's borders, so an author table
  with cell spacing or a `border` attribute gets `border-collapse:separate` inline.

### Boxes and content

| Source | Output |
|---|---|
| Padding, borders, background colour | On the box's cell (`bgcolor` 6-digit hex and CSS). |
| Background image or gradient | CSS for clients that paint it, a solid fallback colour, [VML](#vml-background-images) for images in Outlook. Gmail paints CSS backgrounds partially (a `url()` background can make it drop the whole `style`; none for non-Google accounts); Yahoo has no multiple backgrounds. |
| `<img>` | Fluid (`max-width:100%`) or fixed, always with `width` / `height` attributes. |
| An `<a>` that looks like a button, or `data-email="button"` | [Bulletproof button](#bulletproof-buttons). |
| `display: none`, the `hidden` attribute, `popover`, a closed `<dialog>` | Dropped (I002), or emitted hidden when another screen shows it; inline in a text line, kept with `display:none`. |
| `<details>` | Shown expanded (W001). |
| Negative margin that exactly cancels the parent's padding | A full-bleed band. Any other is E005. |
| `%` padding or margin | E006: tables can't scale padding with the viewport. |
| `float` on anything but an image | E004. |
| `video`, `audio`, `canvas`, `iframe`, `object`, `embed`, form controls, inline `svg` | E008. |

### Approximations

These compile, with W003 where the difference can show: content-sized columns; fluid-hybrid line
breaks below the design width; `calc()` widths not in the N-up form; what a stacked narrow-screen
row can't express (a px `flex-basis`, an item's `min-height`, alignment of content-sized columns);
template spacing padding can't express ([templates.md](templates.md#spacing-around-blocks)).
Hidden flex or grid items that aren't last leave their slot empty (W014).

## Head styles

The email is complete with inline styles alone: desktop layout, light colours. That is what Outlook
for Windows and Gmail with non-Google accounts show. One flat `<style>` adds overrides: each author
`@media`, `:hover` or dark rule becomes a generated class on the emitted elements it changes and a
rule with ` !important`.

```html
<meta name="color-scheme" content="light dark">            <!-- only with dark rules -->
<meta name="supported-color-schemes" content="light dark">
<style>
:root { color-scheme: light dark; supported-color-schemes: light dark; }
@media screen and (max-width:600px) { .t-0 { padding:12px !important; } }
@media (prefers-color-scheme: dark) { .t-1 { background-color:#111 !important; } }
[data-ogsb] .t-1 { background-color:#111 !important; }
.t-2:hover { background-color:#0a4 !important; }
</style>
```

### Screens

The cascade evaluates `@media` and `:hover` against a screen (viewport, dark, hover). The base is
desktop: wide (an unbounded viewport, so no `max-width` query matches), light, no hover. The
author's rules decide the others: one per width range their queries split (`min-width`,
`max-width`, range syntax, `screen` / `all`, `and`; the screen's viewport is the range's maximum),
one dark and one hover, both at desktop width. Each screen is compiled from the same parse and
diffed with the base tag by tag (`src/responsive/`); the changed declarations become classes
`t-<n>`, width rules widest first.

Every compile has one structure ([how](architecture.md#several-screens-one-structure)): an element
shown on some screens only is kept everywhere and hidden where it is `none`, and a row that stacks
on some screen is compiled as a row and marked where it stacks. A screen reports only diagnostics
the base didn't.

### What a screen may change

- Styles: a changed or added declaration is overridden; one only in the base is reset (inherited
  properties to the nearest ancestor's value, others to an initial value from
  `src/responsive/reset.ts`). A property with no safe reset (`text-align`, `vertical-align`, …)
  must be set explicitly on that screen.
- Presentational attributes count as their CSS (`width`, `height`, `bgcolor`, `valign`, `align`,
  `hspace` / `vspace`); `align` on a table or image must be the same on every screen.
- **Show and hide:** the hidden cell gets the preheader's hide
  (`display:none;max-height:0;overflow:hidden;mso-hide:all`); content hidden on desktop is also in
  `<!--[if !mso]><!-->…<!--<![endif]-->`, as `display:none` doesn't reach nested tables in Outlook.
  A hidden row item lets a grow column take its room; otherwise its cell keeps its width (W014
  unless it is last). In a wrapping row the fluid column is hidden and Outlook keeps an empty ghost
  cell; a column hidden on desktop beside a growing one relies on `mso-hide:all` for Outlook to drop
  the cell (**unverified**). Margins of a hidden block aren't collapsed through it; keep spacing in
  padding when hiding.
- **Vertical distribution:** a min-height column may switch between `center` and `flex-end`, or
  between the `space-*` values ([height and vertical distribution](#height-and-vertical-distribution)).
- **Stack a row:** each column cell becomes `display:block;width:100%`, gutters drop, the column
  gap becomes `padding-top`. Outlook keeps the desktop row. Wrapping rows stack by themselves.
- `mso-*` declarations and comment content are ignored (Outlook never applies `@media`, `:hover`
  or dark rules).

Anything else is **E017** and only that screen is dropped: a different tag sequence (column count,
`column-reverse`, a column turned into a row, stacking a wrapping row), different text, attributes
or element order, or a declaration that can't be taken back. The message names the screen and the
first difference; the location is the author element owning it. To vary content, put each version
in the markup and hide the others per screen.

### Dark mode

td;dr adds no dark-mode markup of its own: author `prefers-color-scheme: dark` rules become dark
head rules with `[data-ogsc]` (colour) / `[data-ogsb]` (background) mirrors for Outlook.com and the
Outlook apps (selectors `[attr] .cls`, never `.cls[attr]`), plus the colour-scheme metas. Apple
Mail may invert pure `#ffffff` when the meta is present without dark styles, hence metas only with
dark rules. Gmail's dark mode can't be controlled from CSS.

| Client | Forced dark without author styles | `prefers-color-scheme` |
|---|---|---|
| Gmail web | no change | ❌ |
| Gmail iOS | full invert, also of dark designs | ❌ |
| Gmail Android | partial or full (reports differ) | ❌ |
| Outlook (Windows) | full invert | ❌ |
| Outlook.com | partial: light backgrounds darkened | ✅ per caniemail (sources conflict); also when only the OS is dark |
| Outlook iOS / Android | partial | ✅ per caniemail (sources conflict) |
| Apple Mail | no change unless opted in | ✅; the `color-scheme` meta / CSS only on the root |
| Yahoo / AOL | no change | ❌ (query rewritten) |
| Samsung, new Outlook | **unverified** | Samsung ✅, new Outlook **unverified** |

Lint, never errors:

- **W017:** a `data:` image with transparency on a solid background lighter than 0.5 luminance.
  Only the file header is parsed, so dark ink is assumed. 1–2px images, hosted and asset-file
  images (no bytes to inspect) and copies shown only on another screen are skipped.
- **W001:** text over a background image without a `background-color` fallback.
- **I014:** most text sits on solid backgrounds darker than 0.2 luminance and there is no dark rule.
- Not linted: per-client colour remapping, remote logos, images of text, mid-grey text. Text over
  images and light image backgrounds behind dark text are the usual forced-dark failures.

### Head style limits

| Feature | Gmail | Outlook (Windows) | Outlook.com | Apple Mail | Yahoo | Samsung |
|---|---|---|---|---|---|---|
| Head `<style>` | ⚠️ 16 KB; ❌ non-Google accounts | ⚠️ must precede use | ✅ | ✅ | ✅ | ✅ |
| `@media` width | ⚠️ flat only; ❌ non-Google accounts | ❌ | ⚠️ nested removed | ✅ | ⚠️ `screen` and width only | ✅ (not with Outlook.com accounts) |
| `:hover` | ✅ web; ❌ iOS | ❌ | ⚠️ type selectors | ✅ | ✅ | ✅ |

- One flat `<style>`: no `@supports`, no nested at-rules, nothing in `<body>`.
- Only simple class selectors, named `[a-z][a-z0-9-]*`: Gmail and Outlook.com prefix class names,
  and escaped names (`sm\:block`) make Gmail drop the rule.
- `!important` is lowercase after a space.
- Hover rules apply per emitted cell: `.card:hover{color:red}` fires only on the hovered cell.
- Input lint runs on the desktop screen only. Each screen costs a full compile.
- Thunderbird drops `@media` rules and Roundcube prefixes head rules ([observed locally](#observed-locally)).

## Images

Images always carry `width` / `height` attributes (Outlook sizes from them; without them Word uses
the file's DPI metadata) and `border:0` when linked. Ship 2x images displayed at 1x. An image that
was inline in the source stays on its parent's text line, in a cell with that line's text styles,
so the gap under it is the source's; authored `display:block` and flex or grid items are blocks.

- **Floats:** `float: left | right` on an `<img>` becomes `align` plus the CSS float, with
  `hspace` / `vspace` for symmetric px margins (uneven ones stay CSS-only, W005). Only text in the
  same block wraps; an image that is its own block gets the attribute and nothing wraps, and a
  floated image taller than its paragraph doesn't wrap the next block (W001).
- **Margins:** Outlook ignores margins on images; in an image cell the margin becomes cell padding,
  which Outlook honours.
- **`<picture>`** compiles as its `<img>` (I007): Gmail, Outlook and Yahoo ignore `<source>`.
  Styles on the `<picture>` are lost and a selector through it (`picture img`) stops matching
  (W001); one without an `<img>` is E008.
- **SVG:** `<img src="*.svg">` is rasterized by Gmail and unsupported in older Outlook. Inline
  `<svg>` is E008 (Gmail and Outlook don't show it). `allowSvg` keeps it with W010, sanitized of
  scripts, handlers, `javascript:` / `data:` hrefs, `<foreignObject>` and external references.

### Hosted and embedded images

`data:` URIs fail in Gmail (every surface) and most Outlook for Windows versions (2019: PNG / JPEG
only), so images are hosted unless every target shows `data:` images. CID references pass through.

In folder builds and the dev server (`adapters/vite/assets.ts`), relative URLs are placed before
compiling: inlined only when every target shows `data:` images and the file is PNG, JPEG or GIF of
at most 32,768 bytes (W008 above 8,192); otherwise hosted under `--base-url` as `<name>-<hash8>.<ext>` and
copied to `<out>/assets`; otherwise E015. CSS backgrounds are always hosted (VML needs a URL). The
default `broad` targets include Gmail, so by default nothing is inlined.

## Web fonts

The author's font loading (a `<link>` to a known font host, `@import` or `@font-face`, emitted in
the form written) stays in the head inside `<!--[if !mso]><!-->…<!--<![endif]-->`. An
`<!--[if mso]>` style forces the first non-web family of the author's stack, because Word may take
a declared web font as the family and fall back to Times New Roman. Inline `font-family` keeps the
full stack.

```html
<!--[if !mso]><!--><link rel="stylesheet" href="https://FONT-HOST/css2?family=Inter:wght@400;700&display=swap"><!--<![endif]-->
<!--[if mso]><style>body,table,td,th,p,a,li,span,div,h1,h2,h3,h4,h5,h6{font-family:Arial,Helvetica,sans-serif !important;}</style><![endif]-->
```

Apple Mail loads all three forms; Samsung and Thunderbird `@font-face`; Gmail, Outlook.com, Yahoo
and the Outlook apps show the fallback (I008). `@import` gets its own `<style>`. A font `<link>`
keeps only `rel` and `href` (`media`, `crossorigin`, `integrity`, `type`: W001). The Outlook
fallback is the first family in the stack that no collected source declares and that isn't
generic, else `sans-serif` / `serif` by the generic; stacks that would need different fallbacks get
W001. W013 when no stack names a web-safe family and a generic one. Font host CSS is never fetched
or inlined.

## The email shell

Every compile is wrapped in the same document (`src/shell/shell.ts`):

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
u + #body a { color:inherit; text-decoration:none; }
</style>
<!-- then: web fonts, emitter head CSS, head style overrides -->
</head>
<body id="body" style="margin:0;padding:0;background-color:#f4f4f4;">
<div style="display:none;…">Preview text&zwnj;&nbsp;…</div>
<div role="article" aria-roledescription="email" lang="en">
<table role="presentation" width="100%" bgcolor="#f4f4f4" style="width:100%;line-height:normal;background-color:#f4f4f4;" …><tr><td align="center">
<!--[if mso]><table role="presentation" width="600" align="center" …><tr><td><![endif]-->
<table role="presentation" width="100%" style="width:100%;max-width:600px;table-layout:fixed;" …><tr><td style="text-align:left;">…content…</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</div>
</body>
</html>
```

- `lang` comes from `<html lang>`, else the `lang` option (or a component's `export const lang`),
  else `en` with I009; it and `dir` go on `<html>` and the article wrapper, as some clients strip
  `<html>` attributes. The root container's background becomes the page background. `<title>` is
  the source's title (empty otherwise).
- Gmail turns `<body>` into a `<div>`, so the background lives on the wrapper table; `u + #body`
  targets Gmail.
- The content cell states the document's side (`right` under `<html dir="rtl">`): browsers stop the
  centring cell's `align` at the next table, but LiteHTML (Claws Mail) carries it into every cell
  below, and Word is reported to.
- `<body>` has no `class`: Roundcube turns it into its `div.rcmBody` and scopes every head rule
  under that class, but an authored `class` replaces it and no head rule matches.
- `x-apple-disable-message-reformatting` stops iOS shrinking wide emails;
  `a[x-apple-data-detectors]` and `format-detection` tame auto-linked phone numbers and dates.
  `-webkit-text-size-adjust` is `100%`, never `none`. The viewport never blocks zoom.

### Preheader

Any element with `data-email="preheader"` (several join with a space) becomes one hidden `div` as
the first body child, padded with `&zwnj;&nbsp;` pairs to about 140 characters so the client pulls
nothing else into the preview:

```html
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:transparent;opacity:0">Your order shipped&zwnj;&nbsp;&zwnj;&nbsp;…</div>
```

Only `&` and `<` are escaped, so quotes and template fields survive. An empty one is dropped with
W007; a template block on or in it is E012 (send its text as a field).

### Text styles

Every element that directly holds text (`td`, `p`, `h1`–`h6`) carries the text styles the source
gives it (`font-family`, `font-size`, `line-height`, `color`, …), and `mso-line-height-rule:exactly`
next to a px `line-height`; a cell whose only content is one text block leaves out what that block
restates. A `line-height` left at `normal` comes from the shell's wrapper table
(`line-height:normal`, against a client's base line height such as Roundcube's 1.5) and is written
on `h1`–`h6`, which clients style directly. Font and colour defaults stay the client's. `margin:0`
stays on `p` and `h*` (Word adds its own paragraph spacing).

### Accessibility

Every layout table has `role="presentation"`; linked images use their `alt` as the link name. The
checks run on the styled input, skip hidden and Outlook-only content, and are never errors: W015
(link without a name), W016 (contrast under WCAG AA: 4.5:1, 3:1 for 24px or 18.66px bold text,
against the nearest solid background, else the fallback colour behind an image, else white; one
diagnostic per colour pair),
I009 (no language), I010 (link text such as "click here"), I011 (skipped heading levels or several
`h1`), I012 (alt text that is a file name or placeholder word), I013 (text under 12px). A template field in link text or alt counts as a
name.

### Right-to-left text

`dir` sets `direction` (unless CSS sets one; `dir="auto"` isn't resolved), written inline on the
text-owning cell and text element; logical properties land on the resolved physical side, and so
does `text-align: start | end` on text (not on inline button placement, which puts `end` on the
right whatever the direction). Text with a direction set states its side, since the shell's content
cell states the document's. Flex rows and grids are not mirrored (W001): write items in visual order.

## Outlook and MSO

Outlook for Windows (2007–2019 and classic 365) renders with Word. The new Outlook is a web engine
close to Outlook.com and reads no MSO conditionals (**unverified**); td;dr has no code for it. All
conditional markup comes from `src/emit/mso.ts`.

### What Word ignores or changes

| Feature | Outlook for Windows |
|---|---|
| `width` / `height` attributes | ✅ authoritative; CSS `width` on `td` / `img` is often ignored |
| `max-width` | ⚠️ `<table>` only (hence ghost tables) |
| `margin` | ⚠️ no negative, no `auto`, not on `span`; background bleeds into it |
| `padding` | ⚠️ table cells only; vertical padding is equalised across a row |
| `line-height` | ⚠️ needs `mso-line-height-rule:exactly` on the same block element |
| `display: inline-block`, `overflow`, `white-space`, `table-layout`, `min-width` | ❌ ignored |
| `border-radius`, background images, gradients | ❌ (VML for rounded buttons and images; gradients fall back to the solid colour) |
| Web fonts | ❌ not loaded; Times New Roman risk without the override |
| `border-spacing` | ❌ (`cellspacing="0"` stays) |
| `@media`, `:hover`, `prefers-color-scheme` | ❌ never applied; a head `<style>` is read (rules must precede the content they style), and the font override relies on it |
| Text style inheritance into nested tables | ❌ snaps back to `<body>` styles; every text cell carries its own |
| `data:` images | ❌ (2019: PNG / JPEG only) |

Other clients ignore `mso-*` properties and conditional comments; Yahoo supports `max-width` only
partially.

How the emitter answers:

- **DPI scaling:** Word reads `width` / `height` attributes as pixels but converts other px values
  (padding, fonts) to points, so on 120 / 144 DPI displays text and padding grow while tables and
  images don't. The `PixelsPerInch` 96 block (in `<noscript>`, which other parsers skip) fixes most
  of it, together with explicit px sizes.
- **`mso-*` properties:** `mso-line-height-rule:exactly` beside every px `line-height` (never on a
  cell holding only images); `mso-table-lspace` / `rspace: 0pt` against gaps beside nested tables;
  `mso-padding-alt` for button and spacer cells; `mso-hide:all` for hidden content.
- **Spacing:** margins become cell padding, `margin: 0 auto` becomes `align="center"`;
  `border-collapse: collapse` avoids white seams around painted cells.
- **Empty cells** render taller than set (and WebKit collapses a cell with no content): spacer and
  filler cells use `font-size:0;line-height:0;mso-line-height-rule:exactly` and `&nbsp;`.
- **Lists:** older versions ignore padding and vertical margin on `ul` / `ol`; spacing comes from
  the surrounding cells.

### Ghost tables

Word ignores `max-width` and inline-block, so every fluid container and column group is wrapped in
an Outlook-only fixed-px table opened and closed by conditional comments; other clients read them
as comments.

```html
<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td width="600"><![endif]-->
<div style="max-width:600px;margin:0 auto;"> …content… </div>
<!--[if mso]></td></tr></table><![endif]-->
```

- Pairs must balance: a missing `</table>` corrupts only Outlook, invisibly in a browser.
- Conditional comments don't nest: the first `<![endif]-->` ends the outer block.
- Ghost widths sum to the container's px width; none is wider than the email, and one at the full
  email width is skipped (the shell has it). A nested row gets its own ghost table.
- No whitespace between the comments and inline-block siblings.
- Minifiers and sending platforms must keep `<!--[if` comments.

Golden lint checks balance and nesting on every golden.

### Outlook-only content

`data-email="outlook-only"` lowers the element like any other, then puts everything it became in
**one** `<!--[if mso]>…<![endif]-->` block; other clients have nothing in its place (no empty row,
cell or gap). Because conditionals don't nest, its content is first reduced to its Outlook side:
`[if mso]` content is kept without markers, `[if !mso]` content is dropped, version-gated
conditions (`mso 12`) are dropped (W001), `gte mso 9` and `mso | IE` count as `mso`, plain
comments are dropped, ESP markers stay.

- **A block:** only the element carrying the hint vanishes elsewhere; a wrapper around it keeps its
  own box. Margins around it collapse as if it weren't there.
- **A text-level element** is written as authored, minus `data-email`, inside one conditional:
  `<p>Hello <!--[if mso]><span>(Outlook)</span><![endif]--> world</p>`. Inside an existing
  `[if mso]` block it is plain content; inside `[if !mso]` it is dropped.
- **In a row or grid:** in a flex row its cell keeps its own width, gets no gutter, and the other
  cells are sized without it; in a wrapping row it joins the line before it; in a grid it is an
  extra cell after the one before it, with no track width, so that row may sit off the other rows'
  tracks in Outlook. Give it a px width that fits, or the row can grow wider than the email.
- **A row or grid of only Outlook-only items:** a bare container belongs to Outlook alone; one with
  a box (padding, background, min-height) keeps a filler cell for other clients.

A rounded button inside keeps only its VML; a square one keeps its table and `<a>`.

### Bulletproof buttons

A block-level `<a>` with padding or a background, or `data-email="button"`, becomes a one-cell
table: the `<td>` has the background (`bgcolor` and CSS), `border-radius` and `mso-padding-alt`,
the `<a>` the padding. A rounded button adds a VML `v:roundrect` for Outlook and hides the table
from it:

```html
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
  href="https://example.com" style="height:44px;v-text-anchor:middle;width:160px;" arcsize="14%" stroke="f" fillcolor="#1a73e8">
  <w:anchorlock/><center style="color:#ffffff;font:600 16px Arial,sans-serif;">Label</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><table role="presentation" …><tr><td align="center" bgcolor="#1a73e8" style="border-radius:6px;mso-padding-alt:12px 24px;">
  <a href="https://example.com" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;border-radius:6px;">Label</a>
</td></tr></table><!--<![endif]-->
```

- `arcsize` is radius / min(width, height) in percent, at most 50. VML needs px sizes: the
  button's width, else estimated from the label (about 0.6em per character, clamped to the slot).
- Alignment comes from the parent's `text-align`. A block button with `max-width` stays fluid
  (`width:100%;max-width:N`), and Outlook gets a ghost table and VML at N; a button a flex column
  shrinks is content-sized.
- A square button is the table alone; in Outlook only its text is clickable. Yahoo has no slash or
  elliptical `border-radius` shorthand.
- Uneven corners: one VML shape (W003). Background images or gradients: the solid fallback colour,
  so an image-only button vanishes with images off. A button inside a text run isn't bulletproofed
  (W003). VML can't nest in another VML shape.
- VML keeps only the `href`; other attributes stay on the `<a>`. A colour from data goes whole into
  `bgcolor`, `background-color`, `fillcolor` and `strokecolor`
  ([colours from data](templates.md#colours-from-data)).

### VML background images

A box with a background image gets the HTML (`background` attribute, CSS, `bgcolor` fallback) and,
for Outlook, a px-sized `v:rect` with a `v:fill` and a `v:textbox` around the content:

```html
<td background="https://cdn.example.com/bg.jpg" bgcolor="#1d3557" width="600" height="300" valign="top"
    style="background:#1d3557 url('https://cdn.example.com/bg.jpg') center/cover no-repeat;height:300px;">
<!--[if mso]><v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;height:300px;">
  <v:fill type="frame" src="https://cdn.example.com/bg.jpg" color="#1d3557" /><v:textbox inset="0,0,0,0"><![endif]-->
  …content…
<!--[if mso]></v:textbox></v:rect><![endif]-->
</td>
```

- `type="frame"` stretches the image (close to `cover`); `type="tile"` repeats.
- The rect needs the box's px width and height; without a height VML is skipped (W001).
- Always a fallback colour, for images off and for Windows Mail (colour only).
- VML needs absolute URLs. Content taller than the rect may be clipped (**unverified**).

## Size limits

Sizes are raw UTF-8 bytes, shown in decimal kilobytes with the exact limit (`src/limits.ts`):

| Limit | Bytes | Diagnostic |
|---|---|---|
| Gmail clips the message behind "View entire message" | 102,000 (`GMAIL_CLIP_BYTES`) | W009 |
| Gmail drops head `<style>` rules past this point, the reset included | 16,384 (`HEAD_STYLE_BYTES`) | W012 |

An inlined `data:` image counts toward the clip (base64 adds about a third); a hosted one only as
its URL.

## Targets and client data

`targets` selects caniemail `(family, platform)` pairs (`src/targets/presets.ts`):

| Preset | caniemail family / platforms |
|---|---|
| `gmail` | gmail / desktop-webmail, ios, android, mobile-webmail |
| `outlook-2019` | outlook / windows, the newest row at or below 2019 |
| `outlook-com` | outlook / outlook-com |
| `outlook-new` | outlook / outlook-com + windows-mail (proxies; **unverified**) |
| `outlook-mobile` | outlook / ios, android |
| `apple-mail` | apple-mail / macos, ios |
| `yahoo` | yahoo / desktop-webmail, ios, android |
| `samsung` | samsung-email / android |
| `broad` (default) | gmail + outlook-2019 + outlook-com + apple-mail + yahoo |

A feature's status is the worst across the pairs (`n` > `a` > `u` > `y`; `a` is partial, with
caniemail's note, and `u` is untested, never unsupported). The Gmail app with non-Google accounts
is not a separate platform; it shows up as `a` with a note. The same table drives
input lint (W005, I003; only CSS that reaches the output) and output self-lint (W006). The data is
a pinned copy in `src/targets/data/` (MIT, attribution in `NOTICE`), never fetched at runtime;
`pnpm caniemail` refreshes it and a test fails once it is 120 days old. Property-to-slug mapping is
an explicit table in `src/targets/features.ts`. The results are community tests at a point in time.

### Observed locally

Seen in a local test of a few mail clients, beyond the caniemail data:

- **Thunderbird 158 (Original HTML view):** removes every `@media`, `@supports` and `@layer` rule and
  CSS nesting from `<style>`; plain rules and `@font-face` stay. It shows the desktop layout from the
  inline styles, so [screens](#screens) never apply. It also caps an image's width to the pane.
- **Roundcube 1.6 (Elastic skin):** prefixes head rules with its message container, which works only
  while `<body>` has no class; the [shell](#the-email-shell)'s has just an id. The skin's body
  `line-height: 1.5`, 14px font and heading line-heights reach text that doesn't set its own (the
  shell sets a normal line height), and Bootstrap's `box-sizing: border-box` applies to cells. It
  corrupts non-base64 SVG `data:` URIs.
- **Evolution (WebKitGTK):** narrows the body to the viewport minus 24px unless the email sets a
  body width; the [shell](#the-email-shell) does.

## Diagnostic codes

Defaults from `src/diagnostics/codes.ts`; codes are never renumbered. With `strict: false`, errors
are reported as warnings and the input is kept as written. Client-support problems are warnings
even in strict mode.

| Code | Meaning |
|---|---|
| E001 | Unsupported `display`: grid areas, spans, `auto-fill`, row templates, `subgrid`, `display: grid` on a link, a malformed `display: table` or one inside text. |
| E002 | `position: absolute`, `fixed`, `sticky`, or `relative` with offsets. |
| E003 | CSS transform. |
| E004 | `float` on anything but an image. |
| E005 | Negative margin that isn't a full-bleed band. |
| E006 | Unsupported length: `%` padding or margin, `vh`, `%` outside widths, `calc()` other than `calc(P% ± Npx)` on a flex item, a `%` width with horizontal padding under `content-box`. |
| E007 | Unsupported flex feature: `row-reverse`, `column-reverse`, `wrap-reverse`, `align-content`, unknown alignment values. |
| E008 | Element with no email-safe equivalent: `video`, `audio`, `canvas`, `iframe`, `object`, `embed`, `svg`, form controls, `<picture>` without `<img>`. |
| E009 | Animation or transition. |
| E010 | No layout rule matched (a td;dr bug). |
| E011 | Unknown `data-email` value. |
| E012 | Template construct where it can't sit (row item, grid cell, broken chain, bad path or condition, hand-written template syntax). |
| E013 | Placeholder in CSS (other than a whole colour value) or in a presentational attribute lowering drops. |
| E014 | Template fields or blocks in the output without a `template` dialect. |
| E015 | Image can't be placed: no `--base-url`, or a relative URL that isn't a project file. |
| E016 | Filled template differs from the HTML render, or a data set doesn't meet a dialect's data needs (folder builds). |
| E017 | A media, dark or hover rule changes the structure, text or attributes ([what a screen may change](#what-a-screen-may-change)). |
| W001 | Dropped or changed: no email-safe way to keep it exactly. |
| W002 | Invalid CSS (a syntax error, or a value such as a negative gap); ignored. |
| W003 | Approximated layout ([approximations](#approximations)). |
| W004 | Fixed width larger than its slot; clamped. |
| W005 | Authored CSS some target clients don't support (names them). |
| W006 | Output uses a feature the targets don't support, or unpaired template markers (a td;dr bug). |
| W007 | Empty preheader. |
| W008 | Inlined image over 8 KB. |
| W009 | Output over Gmail's clip (102,000 bytes). |
| W010 | Inline SVG kept (`allowSvg`). |
| W011 | Root container wider than the `width` option. |
| W012 | Head styles over 16 KB (16,384 bytes); Gmail drops the rest. |
| W013 | Web font without a web-safe fallback and generic family. |
| W014 | Hidden flex or grid item leaves its room empty. |
| W015 | Link without an accessible name. |
| W016 | Text contrast below WCAG AA. |
| W017 | Transparent image on a light background may vanish in dark mode. |
| I001 | Unsafe markup removed. |
| I002 | Hidden content dropped. |
| I003 | Partially supported by some target clients (with caniemail's note). |
| I004 | Link around a block moved onto its contents. |
| I005 | Template not checked against the HTML render (no data set, or no engine installed). |
| I006 | Viewport units resolved at the design width. |
| I007 | `<picture>` sources dropped. |
| I008 | Web font kept; which clients show the fallback. |
| I009 | Language defaulted to English. |
| I010 | Link text doesn't say where it goes. |
| I011 | Heading levels skip or repeat `h1`. |
| I012 | Alt text looks like a placeholder or file name. |
| I013 | Text under 12px. |
| I014 | Dark design without a dark-mode rule. |

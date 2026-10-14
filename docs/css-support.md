# HTML and CSS support

What td;dr accepts, how each feature is lowered, where the result is approximate, and what is
rejected. The markup behind each lowering is in [layout.md](layout.md), [outlook.md](outlook.md),
[head-styles.md](head-styles.md), [images-and-fonts.md](images-and-fonts.md) and
[email-shell.md](email-shell.md).

## Input

- A full document or a body fragment. `<style>` blocks (head or body) and `options.css` take part
  in the cascade; external stylesheets are not fetched (W001), except font host links.
- Text-level content passes through: `p`, `h1`–`h6`, `span`, `a`, `strong`, lists, `blockquote`,
  `pre`, `hr`, real `<table>` markup. Its styles are inlined with every inherited value spelled out,
  so client defaults can't change it. Layout containers (`div`, `section`, flex and grid elements,
  anything block-level that holds blocks) are lowered to tables.
- Removed with I001: scripts, event handlers, `javascript:` URLs.

### Framework output

Server-rendered framework output (React, Vue, or any other) is HTML plus bookkeeping no client
should see. td;dr parses it first (never a regex over a table) and removes the bookkeeping by rule,
not per framework:

- **Comments:** every comment is removed except MSO conditionals (`[if …]`, `[endif]`, in all their
  spellings) and td;dr's own `tddr:` block markers. That covers Vue's `<!---->` and `<!--[-->` …
  `<!--]-->` anchors and React's `<!-- -->` text separators and `<!--$-->` Suspense markers. The
  literal spaces React leaves around its separators are kept.
- **Elements:** `script`, `noscript`, `template`, `link`, `meta`, `title`, `base` and `<style>` are
  taken out of the body after their CSS, fonts and metadata were collected. The React adapter also
  removes the `<link rel="preload" as="image">` React 19 hoists for every image.
- **Attributes:** `data-*` (Vue's scoped `data-v-<hash>`, hydration keys) stays through the cascade,
  because scoped selectors match on it, and is dropped when pass-through markup is serialized
  (`data-email` excepted). Containers never emit source attributes. Classes no rule targets are
  removed after emission.

## The cascade

| Feature | Handling |
|---|---|
| Selectors, specificity, `!important`, inheritance, shorthands | Full cascade; the result is inlined. |
| `@layer`, CSS nesting, `@property` initial values | Resolved. |
| `@supports` | Evaluated statically for email; a false block is skipped, an unparsable condition is W002. |
| `var()`, `calc()` | Resolved. `calc(P% ± Npx)` stays as a width on flex items. |
| `em`, `rem`, `%` font sizes | Resolved to px. `rem` is the root element's computed font size (`html { font-size }`), 16px when the root sets none; in media queries `em` and `rem` are 16px. |
| `oklch()`, `color-mix()` and other modern colours | Lowered to hex or `rgba()`. |
| Translucent colours | Flattened over a known solid backdrop; over an image or gradient they stay as written (W001). |
| Logical properties, `dir` | Mapped to physical sides by the resolved direction ([email-shell.md](email-shell.md#right-to-left-text)). |
| `vw`, `vmin`, `vmax`, `clamp()`, `min()`, `max()` | Resolved at the design width (I006). Text sizes stay live in a narrow-screen head rule. |
| `::before` / `::after` with static `content` | Written as text. `::marker`, `::first-letter` and other pseudo-elements warn. |
| `@media` (width, `prefers-color-scheme`), `:hover` | Compiled per screen into head rules ([head-styles.md](head-styles.md)). Other media features warn. |
| `@import`, `@font-face`, font `<link>` | Kept as web fonts ([images-and-fonts.md](images-and-fonts.md#web-fonts)). |
| `@container`, other at-rules, rules inside a `style` attribute | Skipped with W001. |
| Invalid values (a negative `gap`, unparsable declarations, selectors or `@property`) | Ignored, as a browser would, with W002. |

## Layout

| Source | Output | Details |
|---|---|---|
| Block flow | A table row per block. Vertical margins collapse first, then become padding. | [layout.md](layout.md#block-flow-and-block-width) |
| Centred `max-width` container (`margin: 0 auto`) | Fluid table capped by `max-width`, plus an Outlook ghost table at the px width. | [outlook.md](outlook.md#ghost-tables) |
| A full-width box with a left or right border | Its own table, not the slot's cell, so its siblings don't move in by half the border. | [layout.md](layout.md#block-flow-and-block-width) |
| Flex row | One table row. Widths: px, %, `calc(P% ± Npx)`, grow (shares of what's left), content-sized (no width). `gap` → cell padding. `justify-content` → cell alignment, or a shrink-wrapped aligned table. `align-items` → `valign`. | [layout.md](layout.md#flex-rows) |
| `align-items: stretch` with painted items | Equal-height cards: the card is the cell, gutters are spacer cells. | [layout.md](layout.md#equal-height-cards) |
| `flex-shrink: 0` on a px column | `min-width` on the cell. | [layout.md](layout.md#flex-rows) |
| Flex column | A stack; `gap` → padding. With `min-height` and `justify-content`, spacer rows distribute the spare height. | [layout.md](layout.md#vertical-distribution-inside-a-min-height) |
| `flex-wrap: wrap` | Fluid-hybrid inline-block columns that stack on narrow screens without media queries; Outlook gets ghost rows per line. | [layout.md](layout.md#fluid-hybrid-columns-wrapping-rows) |
| `order` | Items reordered at compile time. | |
| Grid with px, fr, % or `minmax(0, Nfr)` tracks, `repeat(N, …)`, gaps | Table rows filled in source order. | [layout.md](layout.md#grids-and-table-display) |
| `display: table` / `table-row` / `table-cell` on non-table elements | Table rows and cells. | |
| An author `<table>` | Passed through; keeps the separate border model (`border-collapse:separate` inline) when it has cell spacing or a `border` attribute. | [layout.md](layout.md#author-tables) |
| A link around a card | The box is lowered; the link moves onto each text run and image (I004). | [layout.md](layout.md#linked-blocks-clickable-cards) |
| Negative margin that exactly cancels the parent's padding | A full-bleed band. Any other negative margin is E005. | |
| px `height` on a box that doesn't clip | Treated as `min-height`. | [layout.md](layout.md#vertical-distribution-inside-a-min-height) |

## Boxes and content

| Source | Output | Details |
|---|---|---|
| Padding, borders, background colour | On the box's cell (`bgcolor` and CSS). | [outlook.md](outlook.md) |
| `border-radius`, per corner, `%` radii | On the painted cell (separate border model); `%` resolved to px. | [layout.md](layout.md#clipping-overflow-hidden-and-rounded-corners) |
| Background image, gradient | CSS for clients that paint it, a solid fallback colour, VML for images in Outlook. | [outlook.md](outlook.md#vml-background-images) |
| `overflow: hidden` | Three shapes: rounded box with an edge child, one clipped line, an icon frame. Anything else W001. | [layout.md](layout.md#clipping-overflow-hidden-and-rounded-corners) |
| `<img>` | Fluid (`max-width: 100%`) or fixed, `width` / `height` attributes; inline images keep their line's strut. | [images-and-fonts.md](images-and-fonts.md) |
| `float` on an `<img>` | `align` attribute plus CSS float, `hspace` / `vspace` where symmetric. | [images-and-fonts.md](images-and-fonts.md#floated-images) |
| `<picture>` | Its `<img>` (I007). | [images-and-fonts.md](images-and-fonts.md#picture) |
| An `<a>` that looks like a button (own block, padding, background) or `data-email="button"` | Bulletproof button; VML `roundrect` in Outlook when rounded. | [outlook.md](outlook.md#bulletproof-buttons) |
| Lists, `<hr>` | Lists pass through with explicit margins; `<hr>` becomes a divider cell. | [layout.md](layout.md#lists-and-dividers) |
| `display: none` | Dropped (I002), or emitted hidden when another screen shows it. | [head-styles.md](head-styles.md#show-hide-and-stack) |
| `<details>` | Shown expanded (W001). | |
| `box-shadow`, `text-shadow` | Kept; W005 names the clients that drop them. | |
| Inline `<svg>` | E008; with `allowSvg`, kept and sanitized (W010). | [images-and-fonts.md](images-and-fonts.md#svg) |
| Local images (folder builds) | Hosted under `--base-url`, or inlined when every target shows `data:` images. | [images-and-fonts.md](images-and-fonts.md#hosted-and-embedded-images) |

## Head styles and fonts

The inline output is complete on its own; a head `<style>` only adds overrides
([head-styles.md](head-styles.md)):

- `@media` width ranges (`min-width`, `max-width`, range syntax, `screen` / `all`, `and`) become
  `@media screen and (…)` rules on generated classes. A screen may change styles (padding, sizes,
  colours, borders, …), show or hide elements, and stack a flex row or grid; anything that changes
  the structure, the text or the attributes is E017.
- `prefers-color-scheme: dark` becomes a dark rule plus `[data-ogsc]` / `[data-ogsb]` mirrors and
  the `color-scheme` meta.
- `:hover` on the selector's subject becomes `.t-n:hover`.
- Web fonts (`<link>`, `@import`, `@font-face`) stay in the head behind `<!--[if !mso]>`, with an
  Outlook rule forcing the first non-web family of the author's stack (I008, W013).

## Hints

| Attribute | Effect |
|---|---|
| `data-email="preheader"` | Inbox preview text ([email-shell.md](email-shell.md#preheader)). |
| `data-email="outlook-only"` | Only Outlook (Word engine) sees the element ([outlook.md](outlook.md#outlook-only-content-data-emailoutlook-only)). |
| `data-email="raw"` | Emitted as written, no lowering. |
| `data-email="button"` | Force a bulletproof button. |
| `data-email-if`, `-unless`, `-else-if`, `-else`, `-each`, `-as` | ESP template blocks ([templates.md](templates.md)). |

## Approximations

These compile, with W003 where the difference can show:

- **Content-sized columns.** The client picks the font, so a column sized by its content can't be
  computed. Such cells get no width, a grow column takes the rest, and `space-between` becomes cell
  alignment. Grow columns next to content-sized ones stay unresolved.
- **Fluid-hybrid rows.** A grown item's width is a cap below the design width, so a line can stack
  earlier than in the browser; a basis-less grow item assumes 100px; gaps the row's padding can't
  absorb come off the line's edge columns; painted items in a wrapping row don't stretch to each
  other; `%` columns with fixed gaps never stack, unlike the source.
- **`calc(P% ± Npx)` widths** are exact at every width only in the N-up form (for example
  `calc(50% - 10px)` with a 20px gap); other forms scale their px part on phones.
- **Design width.** The email is laid out at one width: the `width` option, else the root
  container's px `max-width` / `width` (the widest of several roots), else 600. A `width` option
  narrower than a root container warns (W011). Lengths resolved at the design width (layout `vw`)
  don't flex below it.
- **Stacked rows.** What a narrow screen's stacked row can't express (a px `flex-basis`, an item's
  `min-height`, packing or alignment of content-sized columns) is reported by the base compile.
- **Template spacing.** Margins around `if` / `each` blocks are split so every outcome has the
  browser's spacing; where padding can't express it, W003 ([templates.md](templates.md#spacing-around-blocks)).
- **px height** grows with taller content instead of overflowing, without a diagnostic.
- **Hidden flex or grid items** that aren't last leave their slot empty (W014).

## Diagnostic codes

Defaults from `src/diagnostics/codes.ts`. With `strict: false`, errors are reported as warnings.

### Errors

| Code | Meaning |
|---|---|
| E001 | Unsupported `display` value: grid areas, spans, `auto-fill`, row templates, `subgrid`, malformed `display: table`. |
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
| E017 | A media, dark or hover rule changes the structure, text or attributes ([head-styles.md](head-styles.md#e017)). |

### Warnings

| Code | Meaning |
|---|---|
| W001 | Dropped or changed: no email-safe way to keep it exactly. |
| W002 | Invalid CSS (a syntax error, or a value such as a negative gap); the declaration or rule was ignored. |
| W003 | Approximated layout (see above). |
| W004 | Fixed width larger than its slot; clamped. |
| W005 | Authored CSS some target clients don't support (names them). |
| W006 | Output uses a feature the targets don't support, or unpaired template markers (a td;dr bug). |
| W007 | Empty preheader. |
| W008 | Inlined image over 8 KB. |
| W009 | Output over Gmail's clip (102,000 bytes). |
| W010 | Inline SVG kept (`allowSvg`). |
| W011 | Root container wider than the `width` option. |
| W012 | Head styles over 16 KB; Gmail drops the rest. |
| W013 | Web font without a web-safe fallback and generic family. |
| W014 | Hidden flex or grid item leaves its room empty. |
| W015 | Link without an accessible name. |
| W016 | Text contrast below WCAG AA. |
| W017 | Transparent image on a light background may vanish in dark mode. |

### Info

| Code | Meaning |
|---|---|
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

## Targets and client data

`targets` selects caniemail `(family, platform)` pairs (`src/targets/presets.ts`):

| Preset | caniemail family / platforms |
|---|---|
| `gmail` | gmail / desktop-webmail, ios, android, mobile-webmail |
| `outlook-2019` | outlook / windows, the newest row at or below 2019 |
| `outlook-com` | outlook / outlook-com |
| `outlook-new` | outlook / outlook-com + windows-mail (proxies: the new Outlook has no key; **unverified**) |
| `outlook-mobile` | outlook / ios, android |
| `apple-mail` | apple-mail / macos, ios |
| `yahoo` | yahoo / desktop-webmail, ios, android |
| `samsung` | samsung-email / android |
| `broad` (default) | gmail + outlook-2019 + outlook-com + apple-mail + yahoo |

A feature's status for a set of targets is the worst across its pairs (`n` > `a` > `u` > `y`). The
same table drives input lint (W005, I003) and output self-lint (W006); input lint reports only CSS
that reaches the output.

The data is a pinned copy of the caniemail API (`src/targets/data/caniemail.json`, MIT, attribution
in `NOTICE`) with a meta file recording the URL, API version, last update, feature count, sha256
and fetch date. It is never fetched at runtime or in tests. `pnpm caniemail` refreshes it; a unit
test checks the hash and fails once the copy is 120 days old. After a refresh, review the diff and
re-run the golden fixtures.

- A status is a letter with optional ` #N` note references: `y` yes, `n` no, `a` partial (the
  diagnostic shows the note; notes that can't apply to the values used are skipped), `u` untested,
  never unsupported.
- A version key is a release (`2019`, `16.80`) or a `YYYY-MM` test date; the latest result wins.
- Slugs don't map 1:1 to properties (`css-margin`, `css-margin-block-start-end`, value slugs such as
  `css-display-flex`); `src/targets/features.ts` holds an explicit table.
- The Gmail app with non-Google accounts is not a separate platform; it shows up as `a` with a note.
- The data is community test results at a point in time; some rows are years old.

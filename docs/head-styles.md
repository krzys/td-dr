# Head styles: responsive, dark mode, hover

The email is complete and correct with inline styles alone: desktop layout, light colours. That is
what Outlook for Windows and Gmail with non-Google accounts show, since they never apply head rules.
One flat `<style>` in the head adds only overrides: each author `@media`, `:hover` or dark rule
becomes a short generated class on the emitted elements it changes and a rule with ` !important`
(which beats inline). Clients that drop the block show the inline version.

Author input, besides the base styles of `.card` and the `.cta` button:
`@media (max-width:600px){ .card{padding:12px} } .cta:hover{background:#0a4}
@media (prefers-color-scheme:dark){ .card{background:#111} }`

```html
<meta name="color-scheme" content="light dark">            <!-- only with dark rules -->
<meta name="supported-color-schemes" content="light dark">
<style>
:root { color-scheme: light dark; supported-color-schemes: light dark; }
@media screen and (max-width:600px) {
  .t-0 { padding:12px !important; }
}
@media (prefers-color-scheme: dark) {
  .t-1 { background-color:#111 !important; }
}
[data-ogsb] .t-1 { background-color:#111 !important; }
.t-2:hover { background-color:#0a4 !important; }
</style>
…
<td class="t-0 t-1" bgcolor="#ffffff" style="padding:24px;background-color:#ffffff;">…</td>
<td class="t-2" align="center" bgcolor="#1a73e8" style="background-color:#1a73e8;mso-padding-alt:12px;">…</td>
```

## How screens are compiled and diffed

The code is in `src/responsive/` and `src/pipeline.ts`.

1. **Screens.** The cascade evaluates `@media` and `:hover` against a screen (`Env`: viewport,
   dark, hover). The base is the desktop screen: wide, light, no hover. The author's rules decide
   the others (`variantsOf`): one per width range their queries split (`min-width`, `max-width`,
   range syntax, `screen` / `all`, `and`; the viewport is the range's maximum), one dark (at the
   desktop width) when there is a `prefers-color-scheme: dark` rule, one hover when there is a
   `:hover` on a selector's subject. Other media features warn.
2. **One structure.** Before any compile, every screen is cascaded and compared with the base:
   - **keep** (`src/responsive/keep.ts`): an element that is `display:none` on some screens and
     shown on others stays in every compile, hidden where it is none.
   - **stacked** (`src/responsive/stack.ts`): a non-wrapping flex row or a grid that stacks on some
     screen (`flex-direction: column`, `display: block`, one grid track; or mobile-first, a row only
     in a `min-width` rule) is cascaded as the row it is elsewhere in every compile, and marked on
     the screens that stack it.
3. **Compile.** The base compile is the output. Each other screen is compiled from the same parse
   on a quiet ctx, with trace markers on every tag.
4. **Diff** (`diffVariant`, `src/responsive/diff.ts`), tag by tag, in three checks:
   - *Structure:* the same tag names in the same order and nesting.
   - *Content:* the same text, the same non-presentational attributes, and the same author element
     at each tag. Element identity is compared only where both tags carry a trace marker naming an
     author element; wrappers the emitter adds carry none and are matched by position alone.
   - *Styles:* per start tag, the declarations the screen changes become its override.
5. **Head rules** (`src/responsive/rules.ts`): one class `t-<n>` per distinct (screen, declaration
   set), numbered in base 36 in document order and merged into an existing `class`. One `<style>`
   after the reset and the fonts: `:root { color-scheme … }` (dark only); width rules widest first
   as `@media screen and (min-width:A) and (max-width:B)` (no min part at 0); the dark rule with its
   `[data-ogsc]` (colour) and `[data-ogsb]` (background) mirrors; `.t-n:hover`.
6. **Diagnostics.** A screen's compile reports only what the base didn't: each new diagnostic once,
   however many screens say it. What a stacked screen can't express is reported as W003 by the base
   compile (a px `flex-basis`, `min-height` on an item, `justify-content: center` with no growing
   column, alignment or an auto margin on a column without its own width, inline children or
   margins that would collapse in a row that turns into `display: block`).

## What a screen may change

The diff compares the CSS each tag carries: its `style` declarations, plus the presentational
attributes read as the CSS they stand for (`width`, `height` as lengths, `bgcolor`, `background`,
`valign`, `align` as `text-align`, and `hspace` / `vspace` as the side and top / bottom margins
they stand for on a floated image). `style` wins over the attribute it duplicates.

- **A changed or added declaration** is overridden with the screen's value.
- **A declaration only in the base** is reset: an inherited property takes the value of the
  nearest ancestor that has one on that screen; anything else takes its initial value from a fixed
  table (`src/responsive/reset.ts`), which covers each margin longhand, padding, sizes, borders,
  backgrounds, `overflow`, `float`, `opacity` and a few text properties. `display` goes back to the
  tag's own display. A property with no safe reset (`text-align`, `vertical-align` and others) is
  E017: set it explicitly on that screen.
- **`align` on a table or image**, and a `width` / `height` attribute that isn't a length, have no
  CSS to take them back: they must be the same on every screen (E017).
- **`mso-*` declarations** and everything inside comments (MSO conditionals, ESP markers) are
  ignored: Outlook never applies head rules.
- **Text** must be the same. Outside a `pre`-like `white-space` a run of whitespace counts as one
  space, and none at a block or table boundary, so the emitter's own line breaks don't count;
  under `pre`, `pre-wrap`, `pre-line` or `break-spaces` text compares exactly.
- **Attributes** other than `style`, `class`, the presentational ones and the trace marker (`href`,
  `src`, `alt`, …) must be the same, as must the order of author elements.

## Show, hide and stack

- **Hidden on some screens.** Where an element is hidden, its cell gets the preheader's hide
  (`display:none;max-height:0;overflow:hidden;mso-hide:all`), so the structure is identical; a
  text-level element hides itself inline. Content hidden on desktop is also wrapped in
  `<!--[if !mso]><!-->…<!--<![endif]-->`, because `display:none` doesn't reach nested tables or
  images in Outlook.
- **Hidden row items.** If another column grows, the item's cell is hidden and the grow column takes
  the room, as in flex. Otherwise (and always in a grid) the cell keeps its width and only its
  content is hidden: exact only for the last item, otherwise W014. In a wrapping row the fluid
  column itself is hidden; Outlook keeps an empty ghost cell.
- **Stacking a row.** The stacking screen writes each column cell as `display:block; width:100%`,
  drops the gutters, and puts the column layout's vertical gap as `padding-top` on every column but
  the first (`margin-top` on painted columns). A column keeps its own px width as `max-width`, its
  `%` width and its side margins; `align-self` / `align-items` centre or end become auto margins.
  Outlook keeps the desktop row. A wrapping row already stacks by itself
  ([layout.md](layout.md#fluid-hybrid-columns-wrapping-rows)).

## E017

A screen whose compile can't be expressed as style overrides of the base is E017, and only that
screen is dropped; the other screens are kept. That happens when the tag sequence differs (a column
becoming a row, `column-reverse`, a change in column count, stacking a wrapping row, any other
structure), when the text, an attribute or the order of author elements differs, or when a
declaration can't be taken back (above).

- **Message:** names the screen (`max-width 600px`, `dark mode`, `:hover`) and the first difference,
  quoting both tags or both texts. When the screen turns a row into `column-reverse`, or a column
  into a row, a note says which container and what to write instead.
- **Location:** the author element that owns the base's tag at the first difference: the nearest
  enclosing tag whose trace marker names an author element, else the nearest marker at all. A
  difference outside any marked tag has no location.
- **Hint:** for a change of text, attributes or element order, how to keep content the same on
  every screen (put each version in the markup and hide the others per screen). For a structure
  change, the code's default hint: what head rules can change, and that fluid rows already wrap on
  phones.

## Dark mode

td;dr emits no dark-mode markup of its own: author `prefers-color-scheme: dark` rules become the
dark head rules above, with the `[data-ogsc]` / `[data-ogsb]` mirrors for Outlook.com and the
Outlook apps, and the `color-scheme` metas. Everything else is lint.

| Client | Forced dark without author styles | `prefers-color-scheme` | `[data-ogsc]` / `[data-ogsb]` |
|---|---|---|---|
| Gmail web | no change | ❌ (sources conflict) | ❌ |
| Gmail iOS | full invert, also of dark designs | ❌ | ❌ |
| Gmail Android | partial or full (reports differ) | ❌ | ❌ |
| Outlook (Windows) | full invert | ❌ | ❌ |
| New Outlook | **unverified**; treated like Outlook.com | **unverified** | **unverified** |
| Outlook.com | partial: light backgrounds darkened | ✅ per caniemail (sources conflict) | ⚠️ partial |
| Outlook iOS / Android | partial | ✅ per caniemail (sources conflict) | ⚠️ partial |
| Apple Mail | no change unless opted in | ✅ | ❌ |
| Yahoo / AOL | no change | ❌ (query rewritten so it never matches) | ❌ |
| Samsung Email | **unverified** | ✅ | ❌ |

What breaks in forced dark mode:

1. A transparent logo with dark ink on a background that turns dark vanishes (Gmail apps, Outlook).
2. Text over a background image: clients invert the text colour but never the image.
3. Dark text on a background that exists only as an image or VML fill: the background stays
   light, the text turns light.
4. Partial and full inverters disagree: a dark brand band stays dark in one and turns light in the
   other. Mid-grey text can lose contrast. Already-dark designs get inverted to light by Gmail iOS
   and Outlook for Windows.
5. Apple Mail honours dark rules when the `color-scheme` meta is present; with the meta and no dark
   styles it may invert a pure `#ffffff`, so the metas appear only with dark rules.
6. Outlook.com applies dark rules while the webmail is light when the OS is dark, and marks the
   elements it recolours with `data-ogsc` / `data-ogsb` (selectors must be `[attr] .cls`, never
   `.cls[attr]`). Gmail's dark mode can't be controlled from CSS.

| Code | Check |
|---|---|
| W017 | A `data:` image with transparency (PNG colour type 4/6 or `tRNS`, GIF transparency, SVG without a full-canvas filled rect) on a solid background lighter than 0.5 luminance. Header parsing only, so dark ink is assumed. 1–2px images are skipped, as are hosted and asset-file images (no bytes to inspect) and copies shown only on another screen or scheme. |
| W001 | Text over a background image without a `background-color` fallback; the message names dark mode. |
| I014 | Most text sits on solid authored backgrounds darker than 0.2 luminance and there is no `prefers-color-scheme: dark` rule. |

Not linted: per-client colour remapping, remote logos, images of text, mid-grey text.

## Client support

| Feature | Gmail | Outlook (Windows) | Outlook.com | Apple Mail / iOS | Yahoo | Samsung |
|---|---|---|---|---|---|---|
| Head `<style>` | ⚠️ 16 KB; ❌ non-Google accounts | ⚠️ must precede use | ✅ | ✅ | ✅ | ✅ |
| `@media` width | ⚠️ flat only; ❌ non-Google accounts | ❌ | ⚠️ nested removed | ✅ | ⚠️ `screen` and width / height only | ✅ (not with Outlook.com accounts) |
| `prefers-color-scheme` | ❌ | ❌ | ✅, also when only the OS is dark | ✅ | ❌ rewritten | ✅ |
| `:hover` | ✅ web; ❌ iOS | ❌ | ⚠️ type selectors only | ✅ | ✅ | ✅ |
| `color-scheme` meta / CSS | ❌ | ❌ | ❌ | ✅ root only | ❌ | ⚠️ |

New Outlook: **unverified** throughout (no caniemail key).

Why the block looks the way it does:

- **Gmail keeps 16 KB of head styles** and drops the rules past that point (W012). Whether one rule
  it dislikes costs the whole block is **unverified**, so the block is one flat `<style>`: no
  `@supports`, no nested at-rules, nothing in `<body>`.
- **Class names are rewritten** with a prefix by Gmail and Outlook.com, in HTML and CSS
  consistently, except `[class="a"]` selectors. So only simple class selectors are emitted: no ID or
  `[class=…]` selectors, and class names match `[a-z][a-z0-9-]*` (escaped names such as `sm\:block`
  make Gmail discard the rule).
- **`!important`** is always written lowercase after a space; some clients drop the declaration
  otherwise.
- **Hiding desktop content inline** would hide it in Outlook too, so only what the narrow screen
  adds is hidden inline.

## Known gaps

- A hidden item that isn't last in its row, without a growing neighbour, leaves its slot empty
  (W014).
- Margins of a hidden block aren't collapsed through it; keep spacing in padding when hiding.
- Hover rules are diffed per element: `.card:hover{color:red}` becomes a rule on each descendant
  cell that carries the colour and fires only when that cell is hovered.
- A column hidden on desktop beside a growing one relies on `mso-hide:all` for Outlook to drop the
  cell (**unverified** in Outlook).
- Input lint runs on the desktop screen only: CSS that appears only in hover or dark rules isn't
  checked against the targets.
- Each screen costs a full compile.

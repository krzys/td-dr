# Layout patterns

How block flow, flex, grid and boxes become tables, and why each table looks the way it does.
Outlook's side of every pattern (ghost tables, VML) is in [outlook.md](outlook.md).

## Design width

Outlook needs fixed px widths, so the email is laid out at one width
([decisions.md §9](decisions.md#9-design-width-comes-from-the-email)). `src/analyze/design-width.ts`
finds it from a quiet probe cascade before anything is lowered:

- The walk starts at `<body>` and descends only through blocks made of nothing but layout blocks,
  plus the classic skeleton (`table > tbody > tr >` one `td` holding only layout blocks).
- A candidate is a block with a px width: the smaller of `max-width` and `width`, plus padding and
  border under `content-box`; a table's `width` attribute counts when its style has none.
- It counts when centred (`margin: 0 auto`, `<table align="center">`, a `<center>` or
  `td align="center"` parent) or wider than 600.
- Several candidates: the widest. Text, an unsized block, a narrow left-aligned box or a painted
  wrapper add a 600 floor. None: 600.
- A `display:block` link is walked through but never a candidate (a centred 200px button must not
  make a 200px email). Percentages, `auto`, `vw`, hidden, preheader and Outlook-only blocks don't
  count.
- A passed `width` wins; a candidate wider than it warns (W011) and isn't warned about again as an
  oversized box (W004).

Lengths resolved at the design width (`vw`, `clamp()`) don't flex below it; text sizes written that
way stay live in a narrow-screen head rule.

## Block flow and block width

Each block of a stack is a table row. Vertical margins collapse first (`collapse-margins`), then
become cell padding (`margin-to-padding`); the emitter never writes CSS margins.

In CSS a block is as wide as its container whatever its content. An auto-layout table does the
opposite: it grows to its content's minimum width, and the growth propagates up through every
enclosing table, so one wide line on a phone widens the whole email. So single-column stack tables,
and the shell's wrapper, get `table-layout:fixed` when they are **outside any row column**: one
column means fixed layout can't redistribute anything, it only stops content from widening the
table. Inside a row column (flex item, fluid-hybrid column, stretched card) tables keep auto layout,
because the content's minimum width is what flex uses too. Tables with a px width are left alone.
(Chromium: measured at 375px. WebKit, Gmail, Outlook.com: long supported, **unverified** here.
Outlook sizes from ghost tables and width attributes, so fixed layout can't widen anything there.)

A full-width box shares its slot's cell instead of nesting a table, so nesting stays shallow. Not a
box with a left or right border: in the collapsed tables of the shell a cell's side border is shared
with the column, so every sibling row would move in by half of it. Such a box gets a table of its
own; with several screens, the base screen's border decides for all of them.

## Flex rows

A non-wrapping flex row is one table row, one cell per item.

- **Widths:** px and % are exact; `calc(P% ± Npx)` is supported on flex items; grow items share
  what's left; content-sized items get no width (the client picks the font, so their width can't be
  computed; W003 where it matters).
- **Gaps** become px cell padding while grow columns are %, so the padding doesn't scale. Each
  column carries gutter padding in proportion to its share (`gap·(n−1)·share`: 12, 6+6, 12 for three
  equal columns) and its % is its exact share, so its content is that share of the leftover at any
  width. A negative gap is invalid CSS: W002, and it is ignored.
- **`justify-content`** becomes cell alignment. With `center` or `flex-end` and px or content-sized
  items inside a box with its own width (a set `width`, or paint that must span the row), the cells
  go in a shrink-wrapped table with `align` set to the justification, inside the box cell.
- **`align-items`** becomes `valign`.
- **`flex-shrink: 0` px columns** get `min-width` equal to their `width`: a cell's `width` is only a
  preference, and a column holding a fluid image has no minimum width of its own, so it would give
  way first. (`min-width` is supported in Gmail, Apple Mail and Yahoo per caniemail; Outlook ignores
  it, but at the design width the `width` attribute already holds.)
- **`order`** reorders items at compile time.

### Equal-height cards

With `align-items: stretch`, a painted full-width child becomes the column cell itself, so all
cards in the row are as tall as the row. Gutters are then spacer cells: an empty `<td width="W">`
whose `padding-left:Wpx` is its min-content, so a squeezed row keeps the gap in Chromium. In % rows
the CSS width is the % share; in px rows it is `box-sizing:border-box;width:Wpx`, never `width:0`
(WebKit ignores it). `mso-padding-alt:0` cancels the padding for Outlook, which uses the `width`
attribute (**unverified** for this use). Spacer cells keep their px, so stretched cards stay 1–2px
apart on a phone.

## Fluid-hybrid columns (wrapping rows)

A wrapping row (`flex-wrap: wrap`) becomes inline-block columns with `width:100%` and a px
`max-width` inside a row with `font-size:0`. They sit side by side where the container is wide
enough and stack on narrow screens without media queries, so the layout holds in clients that drop
`<style>`. Outlook gets a ghost table per line.

```html
<div style="font-size:0;text-align:left;">
  <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td width="300" valign="top"><![endif]-->
  <div style="display:inline-block;width:100%;max-width:300px;vertical-align:top;">
    <div style="font-size:16px;">A</div>
  </div>
  <!--[if mso]></td><td width="300" valign="top"><![endif]-->
  <div style="display:inline-block;width:100%;max-width:300px;vertical-align:top;">
    <div style="font-size:16px;">B</div>
  </div>
  <!--[if mso]></td></tr></table><![endif]-->
</div>
```

| Client | Fluid layout |
|---|---|
| Gmail (including non-Google accounts) | ✅ needs no `<style>` (inline-block with `max-width`: **unverified** per app) |
| Outlook (Windows) | ghost tables only; ignores `max-width` |
| New Outlook, Outlook.com, Apple Mail, Yahoo, Samsung | ✅ (new Outlook **unverified**) |

- Inline-block siblings get a whitespace gap: `font-size:0` on the row, the font size restored in
  each column, and no whitespace between the conditional comments and the columns.
- Inline-block columns are not equal height; painted items in a wrapping row don't stretch (W003).
- Gaps are lowered to padding inside the columns, never margins.

**Widths in a wrapping row:**

- **px basis or width:** the column's cap. The resolver cuts lines at the design width the way the
  browser does.
- **Grow items** with a px basis grow into their own line's leftover at the design width, shared by
  grow factor; the column is `width:100%;max-width:<grown px>` and the ghost cell carries the same
  px. Below the design width the grown width is a cap, so a line of grown items stacks earlier than
  in the source and a stacked item fills the line only up to its grown width (W003 once per row
  when a line with several items grew). An item alone on its line fills it. A grow item without a
  px basis assumes 100px (W003). A grow item next to an auto-width one isn't grown (W003). A grow
  item with a px `max-width` stops there; its line's other grow items share what it leaves.
- **`%` basis or width:** a `%` inline-block (`width:X%`, X its share of the line, gutters
  included), so two 48% columns stay two-up on a phone; with a px `max-width` also `max-width:N`.
  The gutter stays px while the share is %, so with a gap the columns are slightly narrower than the
  source on phones. A `%` line with fixed gaps stacks in the source at some width; the output never
  does (W003 when that width is above a phone).
- **`calc(P% ± Npx)`:** px is `content × P / 100 + N`, unrounded; the emitted share is that px
  over the line. Exact at every width only for the N-up form (`calc(50% - 10px)` with a 20px gap);
  other forms scale their px part on phones.
- `%` columns keep their unrounded share (three 33.3333% columns emit 33.33% and fill the row);
  Outlook's ghost cells round to whole px, never past the row.

**Gap shortfall.** Each column gets half the gutter on both sides and the row's side padding gives
the edge halves back. What that padding can't give back is taken only from a line that would
otherwise outgrow the row, and only by its overflow: the line's first column pays on the left, its
last on the right, a lone column both. Lines that fit keep their full widths, so at the design width
the output breaks lines where the resolver does, up to whole-pixel rounding (W003). A row with an
auto-width column is one ghost line, so there the shortfall comes off the sized first and last
columns. Where a narrower screen's own rules lay the row out differently, no line warning is given
for widths below that screen.

## Grids and table display

A grid with px, fr, % or `minmax(0, Nfr)` tracks (also `repeat(N, …)`) and gaps becomes table rows
filled in source order. Grid areas, spans, `auto-fill`, row templates and `subgrid` are E001.
`display: table` / `table-row` / `table-cell` on other elements become table rows and cells.

## Vertical distribution inside a min-height

A flex column with `min-height` and `justify-content: flex-end | center | space-between |
space-around | space-evenly` places its items in the spare height. A cell can't do that by itself,
so the cell (whose `height` is the min-height minus padding and borders) holds a table of exactly
that height, and spacer rows take the spare height:

```html
<td height="488" valign="top" style="padding:24px 32px 48px;height:488px">
  <table role="presentation" width="100%" height="488" style="width:100%;height:488px">
    <tr><td><!-- first item --></td></tr>
    <tr><td height="100%" style="height:100%;font-size:0;line-height:0;mso-line-height-rule:exactly">&nbsp;</td></tr>
    <tr><td><!-- last item --></td></tr>
  </table>
</td>
```

Spacer shares follow CSS: `flex-end` one 100% row before the items; `center` 50% before and after;
`space-between` 100%/(n−1) between items; `space-around` half shares at the ends; `space-evenly`
n+1 equal rows. Taller content grows the table, as `min-height` does. Chromium: measured (a 100%
row takes all spare height; several % rows share it in proportion). Apple Mail and Outlook:
**unverified** (if Outlook ignores the % rows, the items stay at the top). Yahoo turns `height`
into `min-height`, which is what the box means.

A one-line flex row with `align-items: center | flex-end` (no item with its own `align-self`)
places its items in the full height: the row's cells share one `valign`, so the box cell takes it
too. Wrapping rows and mixed placements keep a W003.

A px `height` on a box that doesn't clip is treated as its `min-height`: they differ only when the
content is taller, where the browser spills it over the next block and a cell grows. No diagnostic
for that case. Boxes that clip still report the height dropped. Over a background photo Outlook
draws the box with VML and lays the content out from the top whatever the cell's `valign`; that
case keeps a W003.

## Clipping: `overflow: hidden` and rounded corners

Outlook for Windows ignores `overflow`, `table-layout`, `white-space` and `border-radius`, so
`overflow: hidden` is lowered only in three shapes:

1. **Rounded box whose first or last child touches the edge.** No clip is emitted; the edge child (a
   full-width `<img>`, or a painted block) gets the box's corner radii (`16px 16px 0 0` for a first
   child, the bottom pair for a last one, minus the box's border).
2. **One line wider than its box** (`overflow:hidden; white-space:nowrap`). The box cell holds a
   fixed-layout table whose single cell clips, so a long line can't widen the email:
   ```html
   <td style="padding:12px 0;">
   <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;">
   <tr><td style="overflow:hidden;white-space:nowrap;">…the one-line content…</td></tr>
   </table>
   </td>
   ```
   The `width` attribute is the box's resolved width minus padding and border, for Outlook.
3. **Fixed-size painted box with one smaller centred image** (an icon in a circle). The image's cell
   is the whole box: padding is the free space around the icon, the paint and radius go on that
   cell, `align="center" valign="middle"`.

Anything else with `overflow: hidden` is not emitted (W001 says what visibly changes). In Outlook a
clipped strip may wrap or stretch its table (W003); the ghost table keeps the rest of the email at
the design width. `%` radii are resolved to px; email corners are circular, so the smaller of the
horizontal and vertical radius is used. Rounded painted cells use the separate border model, so
their corners show.

## Linked blocks (clickable cards)

A `<table>` is never wrapped in `<a>`: it is invalid HTML4 and Outlook for Windows drops the link.
The link goes on the **leaves** inside the card instead: each text run and each image gets its own
`<a>` with the same `href`, each with explicit `color` and `text-decoration`.

```html
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr><td style="padding:16px;background-color:#ffffff;">
    <a href="https://example.com/p" style="color:#111111;text-decoration:none;"><img src="…" alt="Product" width="200" style="display:block;border:0;"></a>
    <p style="margin:0;…"><a href="https://example.com/p" style="color:#111111;text-decoration:none;">Title</a></p>
  </td></tr>
</table>
```

- An `<a href>` whose children include real layout (flex, grid, or a block that is painted, padded,
  sized or holds blocks) is a link box, lowered as the box it is. Not link boxes: a link whose only
  `<div>` holds its label (a button), an inline-block link, `data-email="button"`.
- Each text run gets its own copy of the `<a>` (same attributes minus `style`, `id` and
  `data-email`) with the colour of the text it sits in and the source's `text-decoration`. Text
  blocks get the `<a>` inside them; flex items keep their element and get it inside too. Images that
  become image cells get the href on their own `<a>`.
- I004 says the link moved and that the padding between leaves isn't clickable; a link box with
  nothing to carry the link reports it dropped.
- Outlook doesn't treat `<a>` as a block, so size and padding come from the cell. Clients paint bare
  links blue and underlined, hence colour and decoration on every `<a>`. Overlay links (absolute
  positioning) fail in Outlook and are never emitted; VML hit areas are not done.
- The same `href` on several leaves may count as several links in click tracking (**unverified**).

## Lists and dividers

Lists stay real `<ul>` / `<ol>` / `<li>`, passed through with inline styles: the list keeps its own
indent (`padding-left`) and explicit margins, and text styles are spelled out on the list and its
items, because Outlook doesn't reliably inherit into lists. Spacing around a list lives on the
surrounding cells.

`<hr>` is never emitted. It becomes an empty bordered box, a divider cell:

```html
<ul style="margin:0;padding:0 0 0 20px;list-style-type:disc;font-family:Arial,sans-serif;font-size:16px;line-height:24px;color:#222222;">
  <li style="margin:0 0 8px 0;">First</li>
  <li style="margin:0;">Last</li>
</ul>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr><td style="font-size:0;line-height:0;mso-line-height-rule:exactly;border-top:1px solid #cccccc;">&nbsp;</td></tr>
</table>
```

- Outlook ignores padding and vertical margin on `ul` / `ol` in older versions, `margin-left` on
  `ul` and `li` adds up, and `<li value="n">` is rewritten as a new `<ol start="n">`. Spacing above
  and below a list must come from neighbouring cells or the first / last `<li>`.
- `reversed` on `<ol>` is unsupported in Gmail, Outlook and Yahoo; `list-style-image` misrenders in
  Outlook.
- A divider cell with `line-height:1px` alone can render thicker in Outlook;
  `mso-line-height-rule:exactly` fixes it, but never on a cell that holds images. Gradient dividers
  fall back to a solid border.

## Author tables

A real `<table>` passes through with inline styles. The shell's reset collapses every table's
borders (it avoids white seams in Outlook), so an author table on the separate border model says
so inline (`border-collapse:separate`) where the two models differ: when it has cell spacing (no
`cellspacing` attribute, whose default is 2px, or a non-zero one) or a `border` attribute.

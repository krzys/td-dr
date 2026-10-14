# Outlook: MSO markup and VML

Outlook for Windows (2007–2019 and the classic 365 app) renders with Word. Everything on this page
exists for it. The new Outlook is a web engine close to Outlook.com: none of this applies there, and
MSO conditionals are not read (**unverified**; test-send before relying on it). td;dr has no code
paths specific to the new Outlook.

All conditional markup comes from `src/emit/mso.ts`.

## The rules the emitter follows

Size tables, cells and images with `width` / `height` attributes plus matching CSS; put padding
only on `<td>`; never use margins or `max-width` on non-tables for layout; write px line heights
with `mso-line-height-rule:exactly`; zero `mso-table-lspace` / `rspace`; include the
`PixelsPerInch` 96 head block ([email-shell.md](email-shell.md)).

```html
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;">
  <tr>
    <td width="600" style="width:600px;padding:16px 24px;font-family:Arial,Helvetica,sans-serif;
        font-size:16px;line-height:24px;mso-line-height-rule:exactly;">
      Text
      <img src="…" width="552" height="120" alt="" style="width:552px;height:120px;display:block;border:0;">
    </td>
  </tr>
</table>
```

| Feature | Outlook (Windows) | Elsewhere |
|---|---|---|
| `width` attributes | ✅ authoritative | ✅ |
| CSS `width` on `td` / `img` | ⚠️ often ignored; the attribute wins | ✅ |
| `max-width` | ⚠️ on `<table>` only | ✅ (Yahoo partial) |
| `margin` | ⚠️ no negative, no `auto`, not on `span`; background bleeds into it | mostly ✅ |
| `padding` | ⚠️ table cells only; vertical padding equalised across a row | ✅ |
| `line-height` | ⚠️ needs `mso-line-height-rule:exactly` | ✅ |
| `mso-*` properties, conditional comments | ✅ | ignored |
| `border-radius`, background images, web fonts | ❌ (VML for shapes and images) | ✅ mostly |

- **DPI scaling:** Word treats HTML `width` / `height` attributes as pixels but converts other px
  values (padding, fonts) to points, so on 120/144 DPI displays text and padding grow while tables
  and images don't. `PixelsPerInch` 96 fixes most of it, only together with explicit px sizes.
- **Margins** are never emitted for spacing; they collapse first and become cell padding.
  `margin: 0 auto` becomes `align="center"`.
- **Padding** on `p`, `div`, `a`, `img`, `span` is unreliable; it lives on cells.
- **`mso-table-lspace` / `rspace` 0** removes gaps Word adds beside nested tables.
- **`border-collapse: collapse`** avoids white seams around painted cells.
- **Empty cells** render taller than set: spacer cells use
  `font-size:0;line-height:0;mso-line-height-rule:exactly` and `&nbsp;`.
- **Images:** without `width` / `height` attributes Word uses the file's DPI metadata. Ship 2x
  images displayed at 1x.
- **Fonts:** Word ignores web fonts and falls back to Times New Roman if the first family is
  unknown; web fonts get an Outlook-only override ([images-and-fonts.md](images-and-fonts.md#web-fonts)).
- **Text styles** don't inherit into nested tables in Word, so every text-owning cell carries its
  own ([email-shell.md](email-shell.md#text-styles-and-defaults)).

## Ghost tables

Word ignores `max-width` and inline-block, so every fluid container and fluid column group is
wrapped in an Outlook-only fixed-px table, opened and closed by `<!--[if mso]>…<![endif]-->`
comments around the fluid markup. Other clients read the comments as comments.

```html
<!-- a container -->
<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td width="600"><![endif]-->
<div style="max-width:600px;margin:0 auto;"> …content… </div>
<!--[if mso]></td></tr></table><![endif]-->

<!-- a row of columns: one ghost table, </td><td> between columns -->
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td width="300" valign="top"><![endif]-->
<div style="display:inline-block;width:100%;max-width:300px;vertical-align:top;">A</div>
<!--[if mso]></td><td width="300" valign="top"><![endif]-->
<div style="display:inline-block;width:100%;max-width:300px;vertical-align:top;">B</div>
<!--[if mso]></td></tr></table><![endif]-->
```

| Client | Reads the ghost table | Reads the fluid markup |
|---|---|---|
| Outlook for Windows 2007–2019 / 365 | ✅ | ❌ |
| New Outlook | ❌ (**unverified**) | ✅ |
| Gmail, Outlook.com, Apple Mail, Yahoo, Samsung | ❌ | ✅ |

- Pairs must balance. A missing `</table>` inside a conditional corrupts the subtree only in
  Outlook, invisibly in a browser. Golden lint checks balance on every golden.
- Conditional comments don't nest: the first `<![endif]-->` ends the outer block. Golden lint
  rejects nesting.
- Ghost widths sum to the container's px width; padding goes on cells, never tables. No ghost is
  wider than the email, and one at the full email width is skipped (the shell already has it).
- No whitespace between the comments and inline-block siblings (it renders a gap elsewhere).
- A nested multi-column row inside a ghost cell gets its own ghost table with the inner px widths.
- Minifiers and sending platforms must keep `<!--[if` comments.

## Outlook-only content (`data-email="outlook-only"`)

The element is lowered like any other, then everything it becomes goes inside **one**
`<!--[if mso]>…<![endif]-->` block. Other clients read a comment and have nothing in its place: no
empty row, cell, ghost separator or gap. Since conditionals don't nest, whatever sits inside is
first reduced to its Outlook side (`msoOnly()`), then wrapped once.

- **A block** (a row of the stack): margins around it collapse as if it weren't there.
  ```html
  <tr><td>Visible everywhere.</td></tr>
  <!--[if mso]><tr><td>Only Outlook sees this.</td></tr><![endif]-->
  ```
- **A flex row item:** the `<td>` with its `width` sits inside the conditional. The other cells'
  widths, gutters, `justify-content` and auto margins are worked out without it; it keeps its own
  width (px, %, calc) and no gutter.
- **A wrapping row item:** its ghost separator and its inline-block column are one conditional. The
  ghost table is as wide as all its cells; lines are cut where the visible columns stop fitting,
  and the item joins the line of the column before it (counting as zero width).
- **A grid cell** takes no place in the grid: the visible cells fill the tracks in source order, and
  Outlook gets one extra `<td>` right after the cell before it, without a track width (so that row
  may sit off the other rows' tracks in Outlook).
- **A row or grid of only Outlook-only items:** a bare container is Outlook's alone, like a block.
  One with a box (padding, background, min-height) keeps, for other clients, the filler cell an
  empty box has, and Outlook gets its cells beside it.
- **A text-level element** is written as authored, minus `data-email`, inside one conditional:
  `<p>Hello <!--[if mso]><span>(Outlook)</span><![endif]--> world</p>`. Inside an existing
  `[if mso]` block it is plain content; inside `[if !mso]` it is dropped.
- A rounded button inside keeps only its VML shape; a square one keeps its table and `<a>`.

What `msoOnly()` does with what sits inside:

| Inside | Result |
|---|---|
| `<!--[if mso]>X<![endif]-->` (also `gte mso 9`, `mso \| IE`) | `X` kept, markers removed |
| `<!--[if !mso]><!-->X<!--<![endif]-->` | dropped with its content |
| a version-gated condition (`mso 12`) | dropped, W001 |
| plain comments | dropped |
| ESP block markers | kept |

An extra cell in a row sized for the others can make the row wider than the email in Outlook; give
the item a px width that fits. Only the element carrying the hint vanishes elsewhere; a wrapper
around it keeps its own box. A unit test checks that the markup other clients read equals the
markup of the same source without the item, and that the Outlook side has balanced tables.

## Bulletproof buttons

A block-level `<a>` with padding or a background, or `data-email="button"`, becomes a button: a
one-cell table whose `<td>` carries the background colour (`bgcolor` and CSS), `border-radius` and
`mso-padding-alt`, with the padding on the inner `<a>`. When the button is rounded, a VML
`v:roundrect` is added for Outlook, and the table is hidden from it:

```html
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
  href="https://example.com" style="height:44px;v-text-anchor:middle;width:160px;"
  arcsize="14%" stroke="f" fillcolor="#1a73e8">
  <w:anchorlock/>
  <center style="color:#ffffff;font:600 16px Arial,sans-serif;">Label</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
<table role="presentation" border="0" cellpadding="0" cellspacing="0">
  <tr>
    <td align="center" bgcolor="#1a73e8" style="border-radius:6px;mso-padding-alt:12px 24px;">
      <a href="https://example.com" style="display:inline-block;padding:12px 24px;color:#ffffff;
         text-decoration:none;border-radius:6px;font:600 16px/20px Arial,sans-serif;">Label</a>
    </td>
  </tr>
</table>
<!--<![endif]-->
```

`arcsize` is radius / min(width, height) as a percentage. VML needs px width and height: from the
button's width, else estimated from the label (about 0.6em per character, clamped to the slot).
A square button is the table alone; Outlook gets padding from `mso-padding-alt`, though only the
text is clickable there.

| Client | Table button | `border-radius` | VML |
|---|---|---|---|
| Gmail, Apple Mail / iOS, Samsung | ✅ | ✅ | ignored |
| Outlook (Windows) | ✅ only the text is clickable | ❌ | ✅ the only way to round |
| New Outlook, Outlook.com | ✅ | ✅ | ignored (**unverified** for new Outlook) |
| Yahoo | ✅ | ⚠️ no slash / elliptical shorthand | ignored |

- The button's alignment comes from the parent's `text-align`; non-style attributes (`aria-*`,
  `target`, `id`, tracking attributes) stay on the `<a>`. VML keeps only the `href`.
- A block button with `max-width` stays fluid (`width:100%;max-width:N`); Outlook gets a ghost table
  and VML at N. A button a flex column shrinks is content-sized.
- Uneven corners: one VML shape, W003. Background image or gradient: solid fallback colour (an
  image-only button vanishes with images off).
- A button inside a text run isn't bulletproofed (W003 with a hint to make it its own block).
- VML can't nest inside another VML shape (a background `v:rect`).
- A template field colour goes whole into `bgcolor`, `background-color`, `fillcolor` and
  `strokecolor` ([templates.md](templates.md#colours-from-data)).

## VML background images

A box with a background **image** gets the normal HTML (`background` attribute, CSS
`background-image`, `background-color` / `bgcolor` fallback) and, inside `<!--[if mso]>`, a px-sized
`v:rect` holding a `v:fill` (image and fallback colour) and a `v:textbox` around the cell content.
`xmlns:v` is declared on the `v:rect` and on `<html>`. Plain colours and gradients get no VML;
gradients fall back to the solid colour in Outlook.

```html
<td background="https://cdn.example.com/bg.jpg" bgcolor="#1d3557" width="600" height="300" valign="top"
    style="background:#1d3557 url('https://cdn.example.com/bg.jpg') center/cover no-repeat;height:300px;">
<!--[if mso]>
<v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;height:300px;">
  <v:fill type="frame" src="https://cdn.example.com/bg.jpg" color="#1d3557" />
  <v:textbox inset="0,0,0,0">
<![endif]-->
  …content…
<!--[if mso]></v:textbox></v:rect><![endif]-->
</td>
```

- `type="frame"` stretches the image to the shape (close to `cover`); `type="tile"` repeats.
  `v:textbox inset` acts as padding for the content.
- The `v:rect` is drawn at the box's px width and min-height. Without a height the rect would be a
  guess, so VML is skipped (W001 names the box).
- Always a fallback colour (`bgcolor` and `v:fill color`): images off, and Windows Mail, where
  `v:fill` shows only the colour.
- Content taller than the rect may be clipped or overflow it in Outlook (**unverified**).
- VML needs absolute URLs; local images are hosted, never inlined, for backgrounds
  ([images-and-fonts.md](images-and-fonts.md#hosted-and-embedded-images)).
- Gmail paints CSS backgrounds partially (a `url()` background can make it drop the whole `style`;
  none for non-Google accounts); Yahoo has no multiple backgrounds.
- Text over a background image is a dark-mode risk (W001, [head-styles.md](head-styles.md#dark-mode)).

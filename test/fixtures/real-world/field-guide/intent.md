---
feature: real-world
viewports: [600, 375]
# Measured 0.0281 (chromium), 0.0278 (webkit), 0.0110 (firefox). What is left: the "Seen on the trail" reel's
# photos sit 6px in and leave 6px under the last line (the wrapping-row W003s), and lists and other text with
# the fractional 24.8px line height land 1px off in cells, which moves what is below them.
maxDiffRatio: 0.03
# Measured 0.0149 (chromium), 0.0134 (webkit), 0.0137 (firefox): the same reel and text drift on a longer page.
maxDiffRatio375: 0.017
expect: compile
codes: []
status: active
---
"Pinewick Outfitters" autumn field guide, the stress template as a fixture. The stylesheet uses `@layer`,
`@property`, nesting, `:has()`, `:nth-child`, `light-dark()`, `color-mix()` in oklch and srgb, custom
properties overridden in a media query, a `clamp()`/vw heading, logical properties and a
`prefers-color-scheme: dark` block. The body has a picture/srcset logo with a dark twin, a hero with a
gradient over a photo and a translucent glass panel, a pill button, three product cards (fluid images,
clip-path badges, ellipsis names, line-clamped blurbs) that stack under 420px, a justified article with
a pull quote, `<mark>`, `<abbr>`, Japanese text and text-emphasis, a side label, numbered steps and a
list-style-image checklist, a spec table on the separate border model with `empty-cells`, a
conic-gradient pie beside gradient bars on a grid that stacks under 600px, dated events with
`<details>`, an RTL block with `<bdi>`, a wrapping photo reel, and a footer of flex columns with round
social icons and G06's sr-only text.

Changed from the stress template so the email compiles cleanly and the comparison is fair: ch and lh
units are px; writing-mode, aspect-ratio/object-fit, counters, `::marker` and `::first-letter`, filter,
`@container`, multi-column text, scroll-snap, blend modes, masks, backdrop-filter, `@supports`, outline,
box-shadow, and hover, print and orientation media are gone; `<details>` is open; the preheader is
hidden; the stats grid doesn't centre with `justify-items`; the reel isn't lazy-loaded; the pull quote
breaks long words; the product row doesn't wrap with grow (approximated, W003) but stacks under 420px;
`--space` is 24px with a 16px override under 420px, not `clamp()` with vw (layout lengths are fixed at
the design width, I006); the product images are 3:2 with a 12px gap, so the columns are whole pixels;
the pie's last slice is opaque (the gradient's first colour, Outlook's fallback, shows through a
translucent stop in every client); and the spec table has a 20px line height.

Must stay true: nothing scrolls sideways at 600 or 375px; light-dark() never reaches the output; the
head keeps a width query and a dark block that repaints the body (#121417); no line is longer than 998
bytes; the reel wraps onto a second line inside the viewport; every image has a width attribute, and
every fixed-size one a height; under 420px the cards stack and each fluid image is as wide as its card;
the badges keep their own 17.05px line height; Outlook gets the desktop layout from the width attributes
and MSO tables.

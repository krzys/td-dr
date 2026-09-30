---
feature: background
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Photo hero from the Cartwell invoice: a background-image (cover, centered top) on a section with a fallback colour,
padding and a min-height taller than its text, the headline sitting low on the photo.
Must stay true: the cell paints the photo and keeps the 560px minimum; the headline stays over the photo; Outlook gets
the HTML `background` attribute plus a VML rect (type frame) around the content. No diagnostic: the photo has a colour
fallback and a VML path.

Unverified in real Outlook (no Outlook available here): the v:rect has a fixed height equal to the min-height, so
content taller than that (font fallback, longer copy) may clip or overflow; and a padded table inside v:textbox,
instead of the pattern doc's <div>, is also untested.

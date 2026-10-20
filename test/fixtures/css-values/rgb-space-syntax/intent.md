---
feature: css-values
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
rgb() and rgba() in the space syntax, without an alpha, on a background, text and a border, with a percentage form. Older clients only parse the comma syntax, so each is lowered to #rrggbb.
Must stay true: the green-grey page, the dark text, the green border and the white card keep their colours; no rgb() without commas in the output.

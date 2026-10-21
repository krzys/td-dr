---
feature: css-values
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Space-syntax colours with an alpha, hsl(217 91% 60% / .5) and rgb(0 0 0 / 50%), in a background, a border and text,
and a border from color-mix(in srgb, currentColor 40%, transparent) on a purple-text box.
Must stay true: each becomes the solid #rrggbb you see over the white card (currentColor is the box's own #7c3aed);
no hsl(), rgb() with a slash, color-mix() or W006 in the output.

---
feature: css-values
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Translucent text, background and border colours (Tailwind's /70 opacity modifiers) over solid backgrounds.
Must stay true: every colour comes out as the solid #rrggbb you see in the browser, the tinted box keeps its tint,
and the inherited translucent text blends over each band's own background (dark grey-blue on the dark band, not
the light-page grey). No rgba() reaches the output.

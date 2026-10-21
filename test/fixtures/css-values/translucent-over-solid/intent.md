---
feature: css-values
viewports: [600, 375]
maxDiffRatio: 0.002
skipEngines: [webkit] # WebKit antialiases text in an rgba colour differently from the same colour flattened to hex; glyph edges only, 0.0024 at 375
expect: compile
codes: []
status: active
---
Translucent text, background and border colours (Tailwind's /70 opacity modifiers) over solid backgrounds.
Must stay true: every colour comes out as the solid #rrggbb you see in the browser, the tinted box keeps its tint,
and the inherited translucent text blends over each band's own background (dark grey-blue on the dark band, not
the light-page grey). No rgba() reaches the output.

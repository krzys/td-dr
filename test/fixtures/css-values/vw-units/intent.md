---
feature: css-values
viewports: [600]
maxDiffRatio: 0.002
expect: compile
codes: [I006]
status: active
---
Viewport units. The email is laid out for a desktop viewport as wide as the width option (600), so 5vw is 30px and
2vmin is 12px (vmin and vmax read the width; the height is unknown). One I006 per distinct value (5vw once, though it
is written twice, and 2vmin). Phones see the desktop value, so only the 600px viewport is compared.

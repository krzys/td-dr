---
feature: container
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Appointment confirmation card: max-width 600px with width 100% and border-box padding, so it shrinks on narrow screens.
Must not render at fixed 600px when the viewport is 375; the card keeps its 20px padding on both sides.
Must stay true: the white card is centered at 600 and fills the 375 width minus any page gutter.

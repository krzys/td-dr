---
feature: button
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W001]
status: active
---
An inline-block button with a max-width.
Pinned behaviour: a content-sized button has nothing for max-width to cap, so it is dropped with W001 "max-width on an inline button is dropped" instead of silently vanishing.
Must stay true: the button is content-sized at the left edge.

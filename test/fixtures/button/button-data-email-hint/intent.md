---
feature: button
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
---
Centered call-to-action marked with data-email="button" so the compiler treats it as a bulletproof button, not a generic link.
Must stay true: the button is horizontally centered, keeps its 14px/32px padding and green background, and the heading and paragraph above it are centered too.
The data-email attribute must not appear in the output; the link text and href must survive unchanged.

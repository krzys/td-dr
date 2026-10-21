---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
maxDiffRatio600: 0.03
---
Two painted 260px border-box cards of different heights on one wrapped line, default align-items: stretch.
Must stay true: the cards sit side by side at 600px and stack at 375px. W003 reports that the shorter card's
background won't stretch to the taller one.
Tolerance: at 600px the source stretches the short card to the taller card's height; the output keeps its own height, as the W003 says.

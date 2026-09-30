---
feature: dark-mode
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W017]
status: active
---
A URL-encoded SVG data URI with a raw % in it.
Must stay true: compiles without throwing and still gives W017.

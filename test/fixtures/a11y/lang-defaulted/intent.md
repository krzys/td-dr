---
feature: a11y
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [I009]
status: active
lang: none
---
German copy in a whole document with no lang anywhere, so the shell writes lang="en". Wanted: one I009.

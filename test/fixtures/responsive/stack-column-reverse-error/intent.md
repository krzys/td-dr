---
feature: responsive
viewports: [600, 375]
maxDiffRatio: 0.002
expect: diagnostic
codes: [E017]
status: active
---
A flex row that becomes column-reverse under 480px.
Must stay true: E017 for the max-width 480px rules, saying the container is a row in the base and column-reverse here and that column-reverse can't be stacked (only column or display: block). That variant is dropped, so the output is the desktop row.

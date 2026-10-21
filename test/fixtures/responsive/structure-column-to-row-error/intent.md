---
feature: responsive
viewports: [600, 375]
maxDiffRatio: 0.002
expect: diagnostic
codes: [E017]
status: active
---
A flex column that becomes a row under 480px.
Must stay true: E017 naming the max-width 480px rules, quoting the first differing tag and saying the container is a column in the base and a row here. That variant is dropped, so the output is the desktop column.

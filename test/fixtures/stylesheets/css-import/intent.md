---
feature: stylesheets
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W001]
status: active
---
A non-font @import. One W001 says the external stylesheet is not fetched (not a web-font message), with the inline-it hint.

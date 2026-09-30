---
feature: out-of-scope
viewports: [600, 375]
maxDiffRatio: 0.002
expect: diagnostic
codes: [E004]
status: active
---
A float on a div (a sidebar) is still out of scope: only an image's float has an email equivalent (the align attribute). A diagnostic is reported at float: right with a hint to use a flex row.

---
feature: responsive
viewports: [600, 481, 480, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A plain block (no padding or background on desktop) that gets padding under 480px.
Must stay true: no E017; the block's cell carries a t- class with padding:16px under (max-width:480px). Regression:
the desktop cell is marked with the block's text run and the narrow one with the block, which once read as another
element.

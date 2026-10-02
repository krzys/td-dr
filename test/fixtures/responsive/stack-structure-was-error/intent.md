---
feature: responsive
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Two columns in a flex row that turn into a column under 480px with flex-direction: column (was E017 before rows could stack).
Must stay true: no diagnostics; the 480px rule stacks the two cells as blocks.

---
feature: responsive
viewports: [600, 481, 480, 414, 375, 320]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Two flex:1 columns with a 16px gap that turn into a column under 480px (flex-direction: column).
Must stay true: the base is the desktop row (two cells and the gutter as padding); the 480px rule makes each column cell a block (display:block, width 100%), drops the side gutter and puts the 16px gap above the second column as padding-top. No E017.

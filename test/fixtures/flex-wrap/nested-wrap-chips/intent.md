---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
maxDiffRatio600: 0.015
maxDiffRatio375: 0.022
---
Two 270px border-box option groups in an outer wrapping row, each holding its own wrapping row of chips with a 6px gap.
Must stay true: at 600px the groups sit side by side (556 of 568px), at 375px they stack. Inside each group the chips
wrap like the source, with 6px between them.

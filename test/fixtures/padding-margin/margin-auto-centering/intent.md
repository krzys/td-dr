---
feature: padding-margin
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Address block: 360px wide with margin-left and margin-right set to auto, plus max-width: 100%.
Must stay true: at 600 the block is exactly 360px and centered (equal space on both sides); at 375 it shrinks to the available width with its 16px padding kept.
Auto side margins must lower to centering, not to a left-aligned block.

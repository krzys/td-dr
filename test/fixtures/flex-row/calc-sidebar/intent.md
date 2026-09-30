---
feature: flex-row
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A `flex: 0 0 calc(30% - 8px)` sidebar beside a `flex: 1` column with a 16px gap, not wrapping.
Must stay true: at 600px the sidebar is 172px, the gap 16px and the main column 412px (172 + 16 + 412); the sidebar keeps its share, not a fixed width, at 375px.

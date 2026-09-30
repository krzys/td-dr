---
feature: flex-row
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Two cells in a row with gap: 0: a fixed 160px sidebar (flex: 0 0 160px) and a main cell with flex: 1 taking the rest.
Must stay true: sidebar is exactly 160px at 600px width, main cell fills the remainder with 24px side padding,
no gap between the cells, and at 375px the main text wraps inside its cell without pushing the sidebar narrower.

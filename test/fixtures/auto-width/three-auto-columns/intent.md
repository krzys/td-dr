---
feature: auto-width
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Three sibling columns with no width or flex set, so the sizing is ambiguous: none of them claims free space. The
browser result is the reference. Must stay true: columns are packed from the left at their content widths (no equal
columns, no stretching), each column's text is top-aligned, and at 375px the columns shrink and wrap their text
inside the 12px gutters rather than overflowing the viewport.

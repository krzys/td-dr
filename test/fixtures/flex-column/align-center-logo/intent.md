---
feature: flex-column
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
---
Centered hero column: logo, heading, paragraph and an inline-block button, all horizontally centered with align-items: center
and 12px gaps. Must stay true: every child is centered on the container's axis at both widths, the button keeps its
24px horizontal padding and does not stretch, and the vertical rhythm between children stays 12px.

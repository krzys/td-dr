---
feature: button
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
---
Block-level button with width: 100%, 16px vertical padding, dark background, 8px radius, text centered.
Must stay true: at 600 the button spans the full content width (600 minus 24px padding on each side); at 375 it still spans the full width with the same height.
The label stays centered and the paragraphs above and below keep their left alignment.

---
feature: button
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
---
Outline-style pill button: white background, 2px solid blue border, 20px radius, 10px/22px padding, inline-block.
Must stay true: the 2px border is visible on all four sides and adds to the padding box, so the outer box is 4px wider and taller than the padding alone.
The text stays blue and centered; the grey panel background and its 24px padding are kept.

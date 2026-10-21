---
feature: a11y
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [I012]
status: active
---
One image with a camera file name as alt, one with a real description, one decorative with alt="".
Must stay true: I012 on the first only.

---
feature: a11y
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W016]
status: active
---
Two failing pairs (grey on white at body size, white on pale yellow) and two passing ones (large grey text over
the 3:1 line, white on teal).
Must stay true: W016 for the two failing pairs only, each with the found and needed ratio in the message.

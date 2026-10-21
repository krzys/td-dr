---
feature: gap
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W002]
status: active
---
A flex column with gap: -4px and a flex row with column-gap: -6px. A negative gap is invalid CSS, so the browser
drops the declaration and the items touch. Must stay true: the output has no gap and no negative padding, compiles
without throwing, and says once per gap (W002) that the declaration was ignored.

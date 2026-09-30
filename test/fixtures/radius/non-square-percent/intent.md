---
feature: radius
viewports: [600, 375]
maxDiffRatio: 0.007
expect: compile
codes: [W003]
status: active
---
A 200x100 box with border-radius: 50% (an ellipse in the browser). Tolerance 0.007 (measured 0.0057 at 375): the ellipse becomes a 50px-radius stadium, the loss the W003 reports.
Must stay true: email corners are circular, so the smaller radius (50px) is used and one W003 says so. The 100px height is kept (as a min-height).

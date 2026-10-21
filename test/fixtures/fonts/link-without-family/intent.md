---
feature: fonts
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W001, I008]
status: active
---
A Typekit link names no family. The first family of the stack is taken as the web font with a W001; the mso override is Arial, never proxima-nova.

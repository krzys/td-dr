---
feature: fonts
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W013, I008]
status: active
---
The web font is followed only by a generic family, so W013 asks for a web-safe font; the mso override falls back to sans-serif.

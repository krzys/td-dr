---
feature: dark-mode
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A logo swapped for a dark copy by a prefers-color-scheme rule: the light img is hidden in dark mode, the dark one is
written with display:none and shown there. Must stay true: the dark copy is emitted with display:none;mso-hide:all,
the hide is the documented one and not a W006, and only the light logo shows on the light screen.

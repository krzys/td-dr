---
feature: responsive
viewports: [600]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A light and a dark logo toggled with display under prefers-color-scheme: dark (visual can't show dark; the golden is the assertion).
Must stay true: both carry a t- class, the dark rule shows one and hides the other, and the hidden one is guarded from Outlook.

---
feature: responsive
viewports: [600, 481, 480, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A width rule, a dark rule and a hover rule in one email (visual shows the width rule only: light, no hover).
Must stay true: one flat head block with the (max-width:480px) rule, then the prefers-color-scheme: dark rule with
its [data-ogsc] / [data-ogsb] mirrors, then `.t-n:hover` on the button; the color-scheme metas are present; the
480 render has the narrow padding and the 481 render the desktop one.

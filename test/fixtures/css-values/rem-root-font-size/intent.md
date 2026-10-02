---
feature: css-values
viewports: [600, 375]
maxDiffRatio: 0.003
expect: compile
codes: []
status: active
---
rem is the root element's computed font-size: html { font-size: 62.5% } makes 1rem 10px in padding, width, font-size,
line-height, letter-spacing, calc()/clamp()/max() and a custom property holding rem. The width query in em stays on the
initial 16px (30em = 480px), as browsers evaluate it, so the 375px screen gets its head styles and 600px doesn't.

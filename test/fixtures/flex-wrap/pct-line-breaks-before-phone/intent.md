---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
maxDiffRatio375: 0.037 # the source stacks the 48% columns at 375 (gap 20px > the 4% they leave), the output stays two-up, ~0.0354
---
Two flex: 0 0 48% columns with gap: 20px and padding: 0 10px. One line at 600px. The source's line stops fitting once the row is narrower than 520px (gap / (1 - 0.96)), so at 375px it stacks while the output keeps the % columns side by side. The W003 'stop sharing a line once the row is narrower than 520px' reports exactly that.

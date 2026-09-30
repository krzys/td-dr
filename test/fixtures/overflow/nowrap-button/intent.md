---
feature: overflow
viewports: [600, 375]
maxDiffRatio: 0.012
maxDiffRatio375: 0.019
expect: compile
codes: [W001]
status: active
---
A button link with white-space: nowrap, overflow: hidden and a fixed 80px width.
A button cell cannot clip, so the W001 (overflow: hidden is dropped) stays and no W003 claims a clip. Tolerance (measured 0.0103 / 0.0164): the button grows to its text instead of being cut at 80px, which is the reported loss.

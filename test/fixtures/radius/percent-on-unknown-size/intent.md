---
feature: radius
viewports: [600, 375]
maxDiffRatio: 0.015
expect: compile
codes: [W001]
status: active
---
A box with border-radius: 50% whose size depends on its text (no width or height), so the percentage has no px value.
Tolerance 0.015 (measured 0.0117): the four corners stay square where the source is a stadium, which is the loss the W001 reports.
Must stay true: exactly one W001 for the element (not one per corner) saying to use px; the box keeps its colour and padding with square corners.

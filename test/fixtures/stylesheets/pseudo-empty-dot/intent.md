---
feature: stylesheets
viewports: [600]
maxDiffRatio: 0.002 # the red dot is skipped (W001), so the render differs by its few pixels
expect: compile
codes: [W001]
status: active
---
An empty `::before` that draws a dot (width, height, background, border-radius) can't be inserted, so it is reported with W001 and a hint to write the dot as a real element. This is the ::before side of what pseudo-empty-decorative covers for ::after.

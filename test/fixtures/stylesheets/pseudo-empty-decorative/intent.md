---
feature: stylesheets
viewports: [600]
maxDiffRatio: 0.0004 # the red bar is skipped (W001), so the render differs by its few pixels, ~0.00025
expect: compile
codes: [W001]
status: active
---
An empty ::after that only clears floats stays quiet. One that draws a bar (width, height, background) can't be inserted, so it is reported with W001 and a hint to write the bar as a real element.

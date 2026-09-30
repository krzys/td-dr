---
feature: flex-wrap
viewports: [600]
maxDiffRatio: 0.004 # the auto item sits 8px in from the left edge (the edge-inset W003 says so), ~0.0029
expect: compile
codes: [W003]
status: active
---
An auto-width item (about 50px), a 300px item and a 200px item in a wrapping row with a 16px gap and no side padding.
Must stay true: one line at 600px; the auto end item cannot give back the edge shortfall, so the nearest sized item on that side does.

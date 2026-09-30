---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
maxDiffRatio375: 0.025 # stacked grown cells fill the line only up to 300px, ~0.0224
---
Three items with flex: 1 1 180px and 12px padding (204px each) in a 600px wrapping row.
Must stay true: two items share line 1 and grow to 300px each, the third wraps to line 2 and fills all 600px (Outlook's ghost
cells carry 300 / 300 and 600). At 375px each item stacks on its own line. The W003 says grown items keep their design-width size as a cap.

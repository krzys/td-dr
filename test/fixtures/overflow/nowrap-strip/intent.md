---
feature: overflow
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
---
A strip of six icon + word pairs (display:flex, white-space: nowrap, overflow: hidden) that is wider than the 600px email, on a dark band.
Must stay true: the page is 600 wide at 600 and 375 wide at 375 (the strip is cut off, not wider than the page, so no horizontal scroll); the strip keeps one line and its bottom rule. Outlook ignores overflow, so W003 says the strip may wrap or widen there.

---
feature: overflow
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
---
A heading and a product name (`<p>`) with white-space: nowrap and overflow: hidden, each on a line wider than its box; the name also has text-overflow: ellipsis. The cards are a 181px flex row.
Must stay true: both text elements get the clip (fixed-layout inner table, overflow:hidden cell), so the cards stay 181px and the page is 600 wide at 600 and 375 wide at 375 (no horizontal scroll); the name keeps its ellipsis inline. W003 for Outlook, which ignores overflow.

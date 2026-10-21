---
feature: background
viewports: [] # no pixel diff: the gap below the cards is the loss W003 reports, far above any honest tolerance
expect: compile
codes: [W003]
status: active
---
A flex row with a min-height and two painted cards. Browsers stretch the cards to 300px; the table cells only reach
their content, so W003 says so.

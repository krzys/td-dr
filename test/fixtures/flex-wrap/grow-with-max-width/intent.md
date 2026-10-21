---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
maxDiffRatio375: 0.004 # the 350px sibling stops at 350 on a 375px screen where the source fills it, ~0.0033
---
Two flex: 1 1 200px items in a 600px wrapping row, the first with max-width: 250px.
Must stay true: the capped item stops at 250px and its sibling takes the rest (350px), as in the browser; Outlook's ghost cells carry
250 / 350. The W003 says grown items keep their design-width size as a cap on phones.

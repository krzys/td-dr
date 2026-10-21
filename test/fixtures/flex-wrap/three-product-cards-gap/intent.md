---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
---
Three 180px border-box product tiles in a wrapping row with a 12px gap and 12px outer padding.
Must stay true: at 600px all three share one line (3*180 + 2*12 = 564 of 576px); at 375px one tile fits per line
(two would need 372 of 351px) and they stack with 12px between them. No gap at the outer edges.

---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.006 # the row padding covers only 4px of the 8px edge half-gap, so the outer items sit inset
maxDiffRatio375: 0.008 # same inset on every stacked item, ~0.0073
expect: compile
codes: [W003]
status: active
---
Two 290px items, gap 16px, row padding 0 4px 0 0. The line is 290 + 16 + 290 = 596, exactly the content box, so the browser keeps both on one line. The output adds half the gap to each side of each column, which needs 8px of padding at both edges where the row gives 0 on the left and 4 on the right: the first cell loses 8px (298) and the last 4px (302), and the ghost table is 600.

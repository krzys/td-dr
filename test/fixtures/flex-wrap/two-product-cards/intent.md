---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
---
Two 270px border-box product cards in a wrapping row with a 16px gap and 16px padding around the grid.
Must stay true: at 600px both cards share one line (270+16+270 = 556 of the 568px line); at 375px the second card
wraps below the first with the 16px gap between them, and each card stays 270px wide. Cards are left-aligned.

---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
---
Two border-box 264px cards in a wrapping row with a 16px gap and 16px padding around the grid.
Must stay true: 264+16+264 = 544px fits the 568px line, so at 600px the cards sit side by side with a 16px gap;
at 375px the second card drops below the first, stays 264px wide, and keeps the 16px gap vertically.

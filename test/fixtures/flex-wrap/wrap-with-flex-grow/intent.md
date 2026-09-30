---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W001, W003]
status: active
maxDiffRatio375: 0.045 # stacked grown cells fill the line only up to their grown width, ~0.040
---
Four perk cells in a wrapping row: three at flex 1 1 160px and one wide cell at flex 2 1 320px, 8px gap, 16px padding.
Must stay true: at 600px line 1 holds the first two cells, each grown to fill the line (288px with its gutter), and line 2 holds
the wide and the last cell grown 2:1 (373px and 203px). Outlook's ghost cells carry those widths. At 375px the cells stack, each
filling the line up to its grown width. The W003 says grown items keep their design-width size as a cap.

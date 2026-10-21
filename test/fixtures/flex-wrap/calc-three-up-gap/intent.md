---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Five `flex: 0 0 calc(33.3333% - 8px)` tiles in a wrapping row with a 12px gap and 6px side padding.
Must stay true: three tiles on the first line (3 x 188 + 2 x 12 = 588 of 588px), two on the second, and the same three-up at 375px. Ghost tables 600 and 400. The row padding absorbs the half gaps and the row gap, so no diagnostics.

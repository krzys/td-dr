---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W001, W003, W005]
status: active
---
Linnet product grid: four cards (rounded image tile, name left and price right, category below) as `flex: 0 0 calc(50% - 10px)` in a wrapping row with `gap: 32px 20px` and `padding: 0 10px`.
Must stay true: two cards per line at 600px (280 + 20 + 280 = 580 of 580) and still two per line at 375px, 32px between the lines. The calc columns are % inline-blocks (width:50%) with a 300px Outlook ghost cell, the row's side padding gives back the half gaps at the edges.

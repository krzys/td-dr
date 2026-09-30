---
feature: flex-row
viewports: [600, 375]
maxDiffRatio: 0.002
expect: diagnostic
codes: [E006]
status: active
---
Lengths calc() can't carry here: a vh mix in flex-basis (vw resolves at the design width, see css-values/vw-units), min() of a % and a px (no single calc(P% ± Npx) for it),
and calc(P% - Npx) in padding, where only widths take a share of the row.
Each is E006 at the item's source location; the calc() flex-basis has the hint "use calc(P% - Npx) or calc(P% + Npx)".
Forms that fold to calc(P% ± Npx), like calc((100% - 20px) / 2), are in css-values/calc-mixed-basis.

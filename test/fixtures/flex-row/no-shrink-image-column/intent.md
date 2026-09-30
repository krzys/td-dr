---
feature: flex-row
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Text next to a `flex: 0 0 176px` photo column (Larch's feature rows). The photo is fluid, so its cell has no
min-content of its own: at 375 the headline's longest word used to squeeze it to about 150px. Must stay true:
the photo stays 176px at both widths. At 375 the row overflows the phone, as it does in the source.

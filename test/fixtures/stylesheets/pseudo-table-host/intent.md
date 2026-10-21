---
feature: stylesheets
viewports: [600]
maxDiffRatio: 0.002
expect: compile
codes: [W001]
status: active
---
tr::after and table::before with literal text can't be lowered: a table row or table can't hold text, so browsers and
webmail move it out of the table. Each reports W001 and nothing is inserted inside the table structure.

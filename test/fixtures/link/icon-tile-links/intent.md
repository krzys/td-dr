---
feature: link
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [I004]
status: active
---
Two tiles side by side, each a link that is itself a flex row: an icon in a tinted square and a label.
Must stay true: the tiles are lowered as flex rows (not treated as buttons, not passed through with
flex intact). The icon and the label each carry the link; no `<a>` wraps a table.

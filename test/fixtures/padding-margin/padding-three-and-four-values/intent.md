---
feature: padding-margin
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Three order line items with different padding shorthands: 3 values (top, sides, bottom), and 4 values (top, right, bottom, left) in a different order to test the mapping.
Must stay true: each line's top, right, bottom and left padding match the declaration order (CSS order is top, right, bottom, left), and text left edges differ per line as declared.

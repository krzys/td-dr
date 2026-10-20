---
feature: background
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W001, W005]
status: active
---
Dark conic-gradient banner with white text and no background-color; the gradient opens with `from 45deg at 50% 40%`.
Must stay true: the cell gets the first colour stop, not the from angle, as bgcolor and background-color, so Outlook
shows dark behind the white text. W001 names that colour; W005 says which target clients don't paint conic gradients.

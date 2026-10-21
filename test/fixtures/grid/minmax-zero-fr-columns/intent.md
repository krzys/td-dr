---
feature: grid
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Ship-to and bill-to side by side with Tailwind's grid-cols-2, which is grid-template-columns: repeat(2, minmax(0, 1fr)).
minmax(0, 1fr) is an fr track with no content minimum, so it lowers like 1fr.
Must stay true: two equal grey columns with a 24px gap inside the white grid's 16px padding, at both 600 and 375.

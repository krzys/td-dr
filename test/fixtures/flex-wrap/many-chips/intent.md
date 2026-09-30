---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
---
Thirty auto-width chips that do not fit on one line at 600px.
Must stay true: chips wrap in the browser at the same places as the source. W003 reports that Outlook can't wrap auto-width items; its ghost table has no width, so it does not stretch the chips.

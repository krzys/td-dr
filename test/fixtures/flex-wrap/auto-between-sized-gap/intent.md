---
feature: flex-wrap
viewports: [600]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
---
A 300px item, an auto-width item (about 50px) and a 200px item in a wrapping row with a 16px gap and no side padding.
Must stay true: one line at 600px (the table measures the auto item, so the sized end items give back the 8px edge shortfall each: 308 + auto + 208). The W003s are the trailing row gap, the edge inset and Outlook not wrapping auto items.

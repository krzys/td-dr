---
feature: block-flow
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [I002]
status: active
---
Blocks the browser hides through markup alone: the hidden attribute, a popover and a closed dialog. Each is dropped with I002, and a hidden span inside the text line gets display:none, as Gmail, Outlook and Yahoo ignore the attribute.
Must stay true: none of the hidden text shows, and the two visible paragraphs keep their 12px gap.

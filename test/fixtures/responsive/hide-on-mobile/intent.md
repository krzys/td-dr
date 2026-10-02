---
feature: responsive
viewports: [600, 481, 480, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A note that display:none hides under 480px, between two lines that stay.
Must stay true: the note is shown in the base output, on a cell whose class has a narrow rule that hides it
(display:none, max-height:0, overflow:hidden); no I002 (it is not dropped), and the 375 render has no gap where it was.

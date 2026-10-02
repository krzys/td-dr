---
feature: responsive
viewports: [600, 481, 480, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A floated image whose margin shrinks under 480px. Outlook gets hspace/vspace for the desktop margin.
Must stay true: no E017; the img carries a t- class with the four margins at 6px under (max-width:480px); hspace and
vspace stay 12 (Outlook ignores head rules).

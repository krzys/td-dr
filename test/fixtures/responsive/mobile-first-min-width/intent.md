---
feature: responsive
viewports: [600, 481, 480, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A box that is 300px wide by default and 100% wide under 480px, written as a (min-width: 481px) rule.
Must stay true: the desktop compile has the 300px width, and the phone range (0 to 480px) gets a max-width:480px rule
that puts the full width back; no min-width in the output.

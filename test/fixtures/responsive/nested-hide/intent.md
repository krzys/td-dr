---
feature: responsive
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A base-hidden inline span inside a base-hidden block, revealed at two different breakpoints. Must stay true: one Outlook guard, no [if !mso] inside another; under 480px the block shows, under 380px the span shows too.

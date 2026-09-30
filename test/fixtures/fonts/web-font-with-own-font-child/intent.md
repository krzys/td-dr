---
feature: fonts
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [I008]
status: active
---
A child with its own font stack keeps it: the Outlook override does not name strong, so there is no also-shown-as warning. I008 only.

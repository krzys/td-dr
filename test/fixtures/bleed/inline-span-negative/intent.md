---
feature: bleed
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [I003]
status: active
---
An inline span with a negative margin inside a padded card. Inline boxes are not lowered, so the I003 note (a negative margin is dropped by Gmail/Outlook) stays.

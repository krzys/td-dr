---
feature: responsive
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A span and an inline img that swap in a paragraph.
Must stay true: the inline hide carries mso-hide:all and sits inside an [if !mso] guard, so Outlook, which ignores display:none on an img, never gets the hidden element.

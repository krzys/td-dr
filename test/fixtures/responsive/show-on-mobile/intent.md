---
feature: responsive
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A note that is display:none by default and display:block under 480px.
Must stay true: the note stays in the structure, emitted hidden in the base (display:none;max-height:0;overflow:hidden;
mso-hide:all on its cell, so Outlook hides it too), and the narrow rule resets display, max-height and overflow.

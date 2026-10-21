---
feature: background
viewports: [600]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
---
A flex row centred with align-items inside a min-height over a background photo.
Must stay true: browsers centre the row (the box cell is valign="middle"); Outlook draws the photo with VML and lays
the content out from the top, so a W003 says so.

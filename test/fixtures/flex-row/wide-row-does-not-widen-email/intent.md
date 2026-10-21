---
feature: flex-row
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A header row (logo + nav) whose content is wider than a 375px phone, above ordinary text.
Must stay true: like the source, the header row overflows on its own and the rest of the email keeps the
phone's width, so the heading and paragraph wrap at 375px instead of at the header's width.

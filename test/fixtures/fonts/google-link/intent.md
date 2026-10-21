---
feature: fonts
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [I008]
status: active
---
A Google Fonts <link>. It is kept in the head inside the non-Outlook comment, with the mso override (Arial).
Must stay true: the inline stack stays Inter, Arial, sans-serif.

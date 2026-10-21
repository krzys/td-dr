---
feature: button
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Block call-to-action capped with max-width: 200px (content box, so 240px outer with the 20px side padding) and centered with margin: 0 auto.
Must stay true: the button is 240px wide and horizontally centered at both widths, not stretched to the container; the label is centered.
The table is width:100% with max-width:240px; Outlook ignores max-width, so it gets a 240px ghost table and a 240px VML roundrect. No W003.

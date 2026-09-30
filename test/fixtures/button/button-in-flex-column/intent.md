---
feature: button
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
---
Two inline-block buttons stacked as children of a flex column container, with a 12px spacer between them.
Must stay true: both buttons are stretched to the full content width (a flex column's default align-items: stretch blockifies them), labels centered, with the 12px gap intact.
Primary button is blue with white text; secondary is light grey with dark text.

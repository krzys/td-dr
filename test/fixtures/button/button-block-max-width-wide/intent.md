---
feature: button
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Block CTA capped at max-width: 400px (440px outer) and centered with margin: 0 auto, inside a 24px padded container.
Must stay true: at 600 the button is 440px wide and centered; at 375 the container is only 327px, so the button
shrinks to 327px instead of overflowing. Outlook gets the 440px cap from a ghost table and a 440px VML roundrect.

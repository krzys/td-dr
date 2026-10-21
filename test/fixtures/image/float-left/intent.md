---
feature: image
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W001]
status: active
---
A lone image floated left (W001: nothing wraps around it). It becomes align="left" on the img (plus CSS float): Outlook honours the attribute. Text only wraps when the image sits inside the text block, see float-in-text.

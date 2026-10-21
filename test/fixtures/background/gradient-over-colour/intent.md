---
feature: background
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W005]
status: active
---
Gradient card from the Velra feedback email, over an explicit background-color.
Must stay true: the author's colour is the bgcolor/background-color fallback and the gradient is written as
background-image on the same cell. No W001: nothing is guessed, Outlook shows the author's own colour. W005 stays,
because Outlook, Outlook.com and Yahoo don't paint gradients and the author should know.

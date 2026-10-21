---
feature: grid
viewports: [600]
maxDiffRatio: 0.005 # measured 0.0041: the bordered box fills its column (W003); the sized one is centred exactly
expect: compile
codes: [W003]
status: active
---
justify-items: center with an unsized bordered item and a 120px painted item.
Must stay true: the sized item is centred in its column; the unsized bordered one fills its column, with a W003.

---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
maxDiffRatio375: 0.06 # the grow item gets its own line instead of sharing the 375px one, ~0.0566
---
Two px columns that fill line 1 and a flex-grow item without a basis.
Must stay true: the grow item wraps onto line 2 and fills the full row width (not 0px wide). W003 says the item needs a px basis.
Tolerance: at 375px the source puts the 200px cell and the shrunken grow item on one line (the grow item fills the 175px left), while the hybrid column wraps the grow item to its own line.

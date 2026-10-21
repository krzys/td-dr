---
feature: flex-wrap
viewports: [375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
maxDiffRatio375: 0.003 # the % shares are of the row without its side padding, so each column is 4.5px narrower than the source at 375, both alike, ~0.0023
---
A `flex: 0 0 40%; max-width: 150px` item beside a plain `flex: 0 0 40%` item, `gap: 20px`, side padding 10px.
Must stay true: at 375px both columns are 40% of the row (142px); the capped one must not come out narrower than its neighbour.

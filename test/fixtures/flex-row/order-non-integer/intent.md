---
feature: flex-row
viewports: [600, 375]
maxDiffRatio: 0.002
expect: diagnostic
codes: [E007]
status: active
---
order: 1.5 is not a valid CSS integer, so the browser ignores it and keeps source order. td;dr reports it (E007, with a hint) instead of silently reordering by 1.5.

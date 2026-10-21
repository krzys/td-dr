---
feature: flex-row
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Three painted, equal-height cards with a 16px gap whose content (nowrap numbers) is wider than a phone: flex items don't shrink below min-content, so the source overflows with the gaps intact.
The 16px gutter cells must not be squeezed below their authored width when the row is squeezed.

---
feature: flex-row
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Auto-width painted cards with short content and a 6px gap: the row hugs its content (`align=left` table), so there is no leftover width.
Guards the px-row gutter (`box-sizing:border-box;width:6px` with padding); the leftover-width case is flex-row/flex1-and-auto-cards-gap. Only Chromium is rendered here.

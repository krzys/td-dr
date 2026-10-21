---
feature: margin-collapse
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Refund card whose parent has 16px top padding. The h2 margin-top (24px) does not collapse through the card,
so the heading sits 40px from the card top (16px padding + 24px margin) and the white card edge is kept.
Must stay true: the top 40px space is inside the white card, and the last paragraph's 16px bottom margin stays inside the card.

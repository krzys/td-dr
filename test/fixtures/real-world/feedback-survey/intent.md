---
feature: real-world
viewports: [] # out of scope by design: the overlapping avatars and the watermark change the layout, no honest pixel tolerance
expect: diagnostic
codes: [E002, E005]
status: active
---
Velra product feedback request (SaaS transactional/marketing hybrid), 600px centered column on white.
Uses flexbox (centered column, avatar row), gap, CSS grid 2x2 points with top border rules,
border-radius cards, linear-gradient backgrounds, gradient text (background-clip: text),
negative margin-left avatar stack, and an absolutely positioned low-opacity "Velra" watermark.
Must stay true: browser bar on top, wordmark and headline centered, pill CTA centered,
dark gradient card with five centered stars, points in two columns at 600px,
avatars overlapping in one row, legal text readable above the watermark.
Must stay true: the avatar stack (negative margin-left) reports E005 per avatar and the watermark E002, each at its
source line. Without strict mode the watermark stays in flow inside the footer with a solid colour (W001), not
positioned against a containing block that no longer exists.

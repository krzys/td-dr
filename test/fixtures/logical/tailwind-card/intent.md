---
feature: logical
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Shipping card written with logical properties, the way Tailwind v4 emits mx-auto, px-*, py-*, border-b and max-w-*:
max-inline-size, margin-inline: auto, padding-block/-inline, border-block-end, border-inline-start, margin-block(-start).
The note sets padding-left before padding-inline (the logical one wins); the last line sets padding-left: 0 after padding-inline (the physical one wins).
Must stay true: the 480px card is centred at 600 and shrinks at 375 keeping its 32px side padding; indigo bottom rule;
the amber note has a left amber bar and 12px padding on both sides; the last line is flush left with a grey rule above it.

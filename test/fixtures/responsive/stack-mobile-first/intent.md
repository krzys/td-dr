---
feature: responsive
viewports: [1024, 768, 767, 600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Tailwind-style mobile-first row: column with a 12px gap by default, a row from 768px up (flex flex-col md:flex-row).
Must stay true: the base is the desktop row (the widest screen); the stack comes from the max-width 767px rule. No E017.

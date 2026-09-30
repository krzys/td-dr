---
feature: container
viewports: [600, 375]
maxDiffRatio: 0.002
expect: diagnostic
codes: [E006]
status: active
---
Outer frame with 4% 5% percentage padding wrapping an inner 480px centered card with a 1px border.
Percent padding mixes with px max-width and border; the inner card is narrower than the outer content box.
Must stay true: inner card stays centered and 480px at 600; percentage padding scales with the container width at 375.
Out of scope (docs/decisions.md §5): percentage padding is reported as E006.

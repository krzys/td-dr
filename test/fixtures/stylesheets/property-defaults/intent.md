---
feature: stylesheets
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Tailwind v4-style utilities that read `--tw-*` custom properties nobody sets, relying on `@property` (written at the end
of the sheet, as Tailwind does). Must stay true: `--tw-border-style` resolves to its initial `solid` for the heading's
bottom border, a utility that sets it (dashed) still wins, the non-inherited `--tw-font-weight` set on a parent doesn't
reach the child (which falls back to 400), and an inherited registered colour flows down from the root. No diagnostics.

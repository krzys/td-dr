---
feature: target-lint
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W005]
status: active
---
Shipping update that keeps a column's space with `visibility: hidden` on one cell and hides an internal note the same
way. Gmail and Outlook on Windows ignore `visibility`, so both texts show there; the compiler keeps the property as
written and warns instead of dropping the elements, which would close up the space they hold. Must stay true: the
output renders like the input, one W005 names the clients that show the hidden text, and the hidden flex cell does not
trip the output self-lint (no W006).

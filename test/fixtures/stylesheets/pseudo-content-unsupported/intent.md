---
feature: stylesheets
viewports: [600, 375]
maxDiffRatio: 0.002
maxDiffRatio375: 0.003 # the attr() and open-quote text the browser shows is skipped (W001), ~0.00242
expect: compile
codes: [W001]
status: active
---
::before / ::after whose content is not a plain string (attr(), open-quote, none) and a state pseudo-class combined with a
pseudo-element (:hover::before) keep the skipped-selector warning, one per rule that lands on something. The counter()
rule lands on nothing, so it stays quiet. Nothing is inserted.

---
feature: button
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A button link with id, target and aria-label.
Pinned behaviour: the link keeps its id, target and aria-label on the emitted <a> (ButtonNode.attrs, docs/architecture.md#layout-ir), so anchors and accessibility survive.

---
feature: button
viewports: [] # a solid fill can't match a gradient (~0.015 @600), so this checks the diagnostics only
expect: compile
codes: [W001, W003]
status: active
---
Call-to-action button whose background is a linear-gradient via background-image. Email clients have no gradient support, so this is out of scope for bulletproof buttons.
Decision: it compiles (expect: compile, not diagnostic). The gradient is reported as W001 ("gradient dropped, the first colour stop is used") and the button is emitted as a solid bulletproof button in the first stop (#f97316). The 8px radius without a width also gives W003 (Outlook size estimated). The rule's unit test covers this.
Why there is no visual check: a solid fill cannot match a gradient pixel for pixel; the diff is about 0.0145 at 600 and 0.023 at 375, and the cap for 600 is 0.01. So the fixture checks the compile and its diagnostics, not pixels.
The paragraph above the button stays centered.

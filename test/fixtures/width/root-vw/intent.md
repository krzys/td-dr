---
feature: width
viewports: [600]
maxDiffRatio: 0.002
expect: compile
codes: [I006]
status: active
---
A root container with `width: 80vw; margin: 0 auto`. A viewport unit never sets the design width, so the email is
laid out at 600 (the default); the box itself still resolves to 480px at that width, reported once as I006. The fixed 480px box overflows a 375px phone while the input's 80vw is 300px there, which is what I006 warns
about, so only the 600px viewport is compared.

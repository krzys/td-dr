---
feature: stylesheets
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Static ::before / ::after text with content: "literal" (also the single-colon :before form, and several strings joined).
The text becomes a span (a div when display:block lands in a div or cell) at the start or end of the element, styled by the pseudo rule and inheriting from the element;
display: block makes it a block span. Declarations spread over two pseudo rules cascade together. Inserted text is HTML-escaped
("&" and "<b>" show as text). No diagnostics.

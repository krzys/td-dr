---
feature: templates
template: [handlebars, liquid]
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W005]
status: active
---
A realistic receipt: preheader, logo, a paid badge or a "pay now" button (if / unless on blocks), line items with an
optional discount row (each + if inside the loop), a totals block, a two-column address grid and a footer link, all
filled from props.json (paid) or props.due.json (unpaid, no discount, one item).
Must stay true: a design written once is a template whose blocks keep the email's layout whichever way the data goes.
The W005 is the card's rounded corners in Outlook.

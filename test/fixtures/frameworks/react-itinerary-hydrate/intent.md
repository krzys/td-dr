---
feature: frameworks
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Flight itinerary email as React 19 components rendered with renderToString: header, two flight segments, passengers, price breakdown, upgrade banner, CTA, footer.
Same email as react-itinerary but with renderToString, so text nodes are separated by <!-- --> hydration markers td;dr must strip.
Uses props mapping, reduce and Intl.NumberFormat(en-GB, GBP) for money, conditional rendering, children composition, inline style objects and a plain styles.css import.
CSS uses :root custom properties, rem/em, nested flex rows in columns, gap, pill chips with radius, letter-spacing, text-transform, an inline-block link styled as a button.

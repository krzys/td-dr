---
feature: frameworks
viewports: [600, 375]
maxDiffRatio: 0.002
maxDiffRatio375: 0.003 # masthead: align-items: baseline lands at top (W003), so the issue line sits a few px higher
expect: compile
codes: [W003, W005]
status: active
---
Garden club newsletter as Vue 3 SFCs rendered with renderToString: masthead, featured story, three story cards, upcoming events with date badges, sign-off.
Scoped styles use CSS nesting (& .title, &:hover, &.featured, bare nested selectors), @layer order statement and blocks, oklch() colours, color-mix(in oklch), custom properties redefined per component, and calc(var(--space) * n) spacing.
Keeps SSR markers (comment fragments, data-v-*). Vue's scoped compiler keeps the nesting and splits each parent into &[data-v-*] plus nested children, so td;dr sees nested rules, some inside @layer.
Must stay true: 600px centred column; masthead brand and issue line on one row; story cards stack full width with even gaps; each event row keeps its date badge left of the text.
The :hover rule on .more becomes a class on each link and one `.t-0:hover` head rule. Measured 0.0023 at 375, all of it the masthead's issue line and anti-aliasing on the card corners.

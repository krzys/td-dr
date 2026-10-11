---
feature: frameworks
viewports: [600, 375]
maxDiffRatio: 0.003
expect: compile
codes: []
status: active
maxDiffRatio375: 0.011
---
Weekly team digest as real Vue 3 SFCs rendered with renderToString: header, KPI tiles, task list by status, avatars, top contributor, footer.
Uses script setup (JS and TS), defineProps, computed, v-for, v-if/v-else, :class and :style bindings, v-bind object spread, a default slot and scoped styles.
Keeps SSR markers (comment fragments, data-v-*) for td;dr to strip itself. CSS uses :root custom properties, rem/em, nested flex, gap, max-width container.
375 tolerance 0.011 (measured 0.0092).

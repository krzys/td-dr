---
feature: frameworks
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003, W005]
status: active
---
Order receipt as React 19 components rendered with renderToStaticMarkup, styled only with Tailwind v4 utility classes: logo and nav row, headline, line items, totals box, CTA button, two-column addresses, footer.
CSS is what @tailwindcss/vite builds for the classes in the components (`source(".")` keeps the scan to this email): @layer theme/base/utilities, preflight, @property fallbacks under @supports, theme variables in oklch, color-mix() for opacity modifiers.
Uses arbitrary values (max-w-[600px]), opacity modifiers (bg-indigo-600/10, text-slate-900/70), line-height shorthands (text-base/7, text-sm/6), tracking-*, font-semibold, border-b, gap-*, flex and grid-cols-2.
Must stay true: 600px white card centred on grey; logo left and nav right on one row; qty and price columns right-aligned and lined up across rows; totals box tinted with rounded corners; CTA is a centred indigo button; ship-to and bill-to side by side.
Tailwind's text-decoration-line on the links has no Outlook equivalent (W005); the CTA's VML size is estimated (W003).

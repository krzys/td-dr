# Decisions

The design decisions behind td;dr, grouped by theme. Each records the context, the decision and its
consequences.

## 1. Platform and dependencies

**Context.** The supported layout subset (blocks, flex rows and columns, simple grids, px / % / grow
widths) needs arithmetic, not a layout engine; text widths can't be known anyway because the client
picks the font. The compiler should be small to install and predictable.

**Decision.** TypeScript strict ESM on Node 22+, pnpm, vitest, tsup. No layout engine, no headless
browser at runtime: width resolution is arithmetic behind a `WidthResolver` interface. Core runtime
dependencies are limited to `parse5`, `parse5-htmlparser2-tree-adapter`, `css-select`,
`dom-serializer`, `postcss` (rule walking) and `lightningcss` (syntax and colour lowering). Vite,
React, Vue, Handlebars and liquidjs are optional peers. Dev dependencies that decide test output
(Playwright, matched to the installed Chromium; frameworks; template engines; Tailwind for captured
fixtures) are pinned exactly. The human name is td;dr; package, binary and identifier are `tddr`.

**Consequences.** Any new runtime dependency needs a decision here. A different resolver could be
plugged in later without touching rules or emitters.


## 2. Strict by default, diagnostics as the contract

**Context.** Silent breakage in Outlook destroys trust faster than a clear error.

**Decision.** Input that can't be lowered faithfully is an error with a source location and a hint
(`strict: true`). `strict: false` (`--allow-unsupported`) turns errors into warnings and emits the
input as written. One code table (`src/diagnostics/codes.ts`) holds severity, title and hint; codes
are never renumbered. Client-support problems are warnings, never errors: strict mode is about what
td;dr can lower, not what every client renders. A feature whose absence still leaves a correct email
(`box-shadow`, dark mode, hover, web fonts, responsive overrides) compiles with W005 naming who won't
show it.

**Consequences.** Every approximation needs a W003 or W001. One deliberate exception: content taller
than a px `height` grows the cell without a diagnostic, since the content height isn't known at
compile time and the browser's overflow is almost always an authoring slip.


## 3. Pipeline of pure stages, parse before sanitize

**Context.** Diagnostics must point at the author's input, and parallel work on stages needs stable
boundaries.

**Decision.** The pipeline is parse → sanitize → style → analyze → passes → emit → shell → post →
template. Parsing (parse5 with locations) runs first; sanitize works DOM to DOM and copies, so no
string rewrite shifts locations. Every stage is `(input, ctx) => output` and doesn't mutate its
input. `data-*` attributes survive until serialization, because scoped framework CSS selects on
them. Classification, child grouping and pass-through serialization are written once and shared by
all rules. The emitter keeps per-call state in one object, never in module variables.

**Consequences.** No regex-on-HTML; no stage reads another's internals; framework markers are
removed by rule, not per framework.


## 4. The Layout IR

**Context.** Analyzers and emitters must evolve independently: analyzers know CSS but not tables,
emitters know tables but not flexbox.

**Decision.** A small IR (`stack`, `row`, `image`, `button`, `inline`, `raw`, `conditional`,
`template`) in px, with no CSS syntax and no tables. Margins are lifted out of pass-through text so
collapsing and margin-to-padding are IR passes; the emitter never writes CSS margins. Extensions are
additive fields with one meaning each: `Column.stretch`, `Column.noShrink`, `Box.radii`,
`Box.backgroundImage` and `minHeight`, `StackNode.justify`, `ButtonNode.attrs`, `ImageNode.line`,
`WidthSpec.calc` (its own key, so no `"px" in` check reads it as a fixed width). Styled elements
carry their parent's computed style so rules can see inherited alignment. One exception to "no CSS
syntax": a background image's `css`, `size`, `position` and `repeat` pass through verbatim.

**Consequences.** Changing an existing field's meaning needs a new entry here. Pass order is part of
the contract: bleed → collapse-margins → margin-to-padding → resolve-widths → gap-to-padding →
flatten-stacks.


## 5. Layout lowering choices

**Context.** Several CSS behaviours have no exact table equivalent; each needed one rule that holds
across fixtures.

**Decision.**
- **Equal-height cards:** with `align-items: stretch`, a painted full-width child becomes the column
  cell itself; gutters are spacer cells, all in % in % rows.
- **Wrapping rows** are fluid-hybrid: a px basis is the item's cap, grow items grow into their own
  line's leftover at the design width, `%` items stay `%` inline-blocks, gaps the row's padding
  can't absorb come off the overflowing line's edge columns. W003 where the result differs.
- **Fixed table layout** for single-column stack tables outside row columns, so one wide line can't
  widen the whole email; row columns keep auto layout (flex min-content behaviour).
- **Inline images** keep their parent's line; `display: block` is written only when authored.
- **`flex-shrink: 0` px columns** get `min-width`.
- **A link around layout** is lowered as the box; the link is copied onto each text run and image
  (I004). A `<table>` is never wrapped in `<a>`.
- **px `height`** on a box that doesn't clip is its `min-height`; one-line rows are placed inside it.
- **`%` padding and margin** are E006: tables can't scale padding with the viewport.

**Consequences.** Each choice is described in [layout.md](layout.md) and has fixtures; changes to
them are behaviour changes with golden updates.


## 6. Client support data

**Context.** Input lint and output self-lint need one capability table, and tests must be
deterministic.

**Decision.** The caniemail data (MIT, attribution in `NOTICE`) is vendored in `src/targets/data/`
with a meta file (API version, date, hash). It is never fetched at runtime. `pnpm caniemail`
refreshes it; a test fails when it is over 120 days old. Presets map to caniemail
`(family, platform)` pairs; support is the worst status across a preset's pairs. Input lint reports
only CSS that reaches the output.

**Consequences.** Diagnostics name the failing clients and caniemail's notes. Stale or proxied data
(`outlook-new`) is a known source of wrong warnings.


## 7. Output size and progressive CSS

**Context.** Gmail clips messages over about 102 KB of raw HTML and drops head styles past 16 KB.
Repeated inherited declarations and wrapper tables made up a large share of the output.

**Decision.** Size changes must not change rendering: visual diffs stay within tolerance and a size
budget test keeps the gains. W009 when the output passes 102,000 bytes, W012 when head styles pass
16,384 bytes; sizes are raw UTF-8 bytes, shown in decimal kilobytes with the exact byte limit. Text
cells drop declarations their only text element restates; boxless nested stacks merge into their
parent. Inline `<svg>` stays E008 (no rasterizer); `allowSvg` keeps it with W010 and leaves every
other error an error.

**Consequences.** The output is larger than hand-written email HTML but stable. Default attributes
and font hoisting are only dropped where research shows no client needs them
([email-shell.md](email-shell.md#text-styles-and-defaults)).


## 8. Head styles by compiling each screen and diffing

**Context.** An author `@media`, `:hover` or dark rule must end up as a class on whichever emitted
cell carries the property, but the passes move properties around. Carrying overrides through the
IR would make every pass handle them.

**Decision.** The cascade evaluates `@media` and `:hover` against an environment. The base compile
is the desktop one (wide, light, no hover): what Outlook and clients without head styles show. For
each other environment the author's rules distinguish, the pipeline compiles again and diffs the
emitted HTML with the base; changed declarations become a generated class and an `!important` rule
in one head `<style>`. Variant compiles report only what the base didn't. A variant that changes the
table structure is E017, except the shapes the diff knows: show / hide, and stacking a row on
narrow screens. Web fonts stay in the head, hidden from Outlook, with a fallback from the author's
own stack.

**Consequences.** No pass knows about media queries. Each variant costs a full compile.


## 9. Design width comes from the email

**Context.** Outlook needs fixed px widths, so a design width always exists. A fixed default of 600
silently shrank a 640px design.

**Decision.** Without a `width` option the design width is the root container's px `max-width` (or
`width`); with several roots, the widest; with none, 600. A passed `width` wins, and a root
container wider than it warns (W011). Values resolved at the design width (`vw`, `clamp()`) keep
their authored form in a narrow-screen head rule for text properties.

**Consequences.** What the reader sees matches what the author wrote; everything after the cascade
sees one resolved width.


## 10. ESP templates: placeholders and dialects

**Context.** The same components must also export as ESP templates whose fields are filled at send
time, not by td;dr.

**Decision.** Props become placeholders (private-use tokens) that survive rendering, sanitizing and
lowering; lists and branches become block markers and IR `template` nodes that know paths, not
dialects. The last step writes them in a dialect. A dialect is a table of writers; Handlebars and
Liquid exist. Fields are always escaped. The ESP sends ready values: arithmetic or methods on a
field are errors. A placeholder may also be the whole value of a colour property; anywhere else in
CSS it is E013. Conditions take paths, string and number comparisons, field-to-field comparisons,
`!`, `&&`, `||` and parentheses, written with each dialect's own else / else-if and operators where
it has them and lowered exactly otherwise. Template tests run the real engines; the compiler never
calls one.

A condition means what it means in JS on the JSON data: truthiness, null-or-missing, list
emptiness and strict equality with a string, number, boolean or field. Each dialect writes it
exactly, or exactly under a data need it states (Handlebars: `[]` is false, comparisons need typed
values, `equals` is relied on only for two strings or two numbers; Liquid: `.size` / `.first` /
`.last` built-ins). `preview()` evaluates conditions as JS and refuses a data set that doesn't meet
a need (TemplateDataError); what has no exact form is refused at the source. Details:
[templates.md](templates.md#condition-semantics).

**Consequences.** A new ESP family is a new writer table plus real-engine tests. Uploading to an ESP
and per-ESP subject / preheader outputs are out of scope.


## 11. Native template authoring

**Context.** Hint attributes read badly in components; authors write `?:`, `&&`, `.map`, guard
clauses and `switch`.

**Decision.** In a template render props are symbolic. The `tddr()` Vite plugin rewrites `===`,
`!==`, `==`, `!=`, `!`, `&&`, `||`, `?:`, early-return `if`, `switch` with returning cases and
branch-assigned variables in email modules (never dependencies) into calls that behave exactly like
JS on plain values and record conditions on symbolic ones. The rewrite is syntactic: no sample runs,
every arm rendered once, the same template every build. What can't be rewritten exactly stays an
error at the statement with a hint. `If` / `ElseIf` / `Else` / `Each` components remain as an escape
hatch, and `<tddr-*>` elements and `data-email-*` hints remain the input syntax adapters produce.

**Consequences.** Component code reads like normal JS. Impure functions called in arms can't be
detected by the rewrite; the equivalence check catches them when data sets exist.


## 12. Equivalence check

**Context.** The rewrite and the writers must be checked on the author's own emails, not only in
td;dr's tests. The HTML render and a filled template spell the same spacing differently (one keeps a
padding-only wrapper table, the other puts the gap on the next row).

**Decision.** Every folder build fills each template email with each of its data sets using the
real engine and compares it with the HTML render. Both sides are normalized: plain full-width
padding-only wrappers dissolve into the surrounding cell (or become the outside gap of a painted
cell), and gaps between stacked single-cell rows are summed onto the upper row. Painted and hidden
boxes, columns, widths, alignment and MSO markup must match exactly. A difference is E016 naming the
email, data set, dialect and first differing line; so is a data set that doesn't meet a dialect's
data needs (§10), which is reported instead of compared.

**Consequences.** Rejected alternatives: an allow-list of known mismatches (hides regressions),
pixel-diffing (needs a browser in the build), making both paths emit identical wrappers (couples the
template path to the HTML path; it added more mismatches than it removed).


## 13. Build and dev tooling

**Context.** Authors need to view, edit, compare and fill emails while writing them, and to get
templates and images out of a project.

**Decision.** Adapters live in `adapters/` (`react`, `vue`, `vite`, `dev`) and are exported as
`tddr/react`, `tddr/vue`, `tddr/vite`; core never imports them and the CLI loads them lazily. An
email is a folder or file default-exporting a component; its CSS is its module graph; JSON files
beside it are data sets. The dev server is Vite in middleware mode behind `node:http` with a static
page, reloads over Server-Sent Events, and compares source and output side by side or as a
difference overlay, without a headless browser. `tddr build <dir>` writes each template email per
dialect; output names come from a `[name]` / `[dialect]` pattern checked before anything is written.
Images are inlined only where every target shows `data:` images (≤ 32 KB, W008 above 8 KB),
otherwise hosted under `--base-url` with a content hash and copied to `<out>/assets`, otherwise
E015. CSS backgrounds are always hosted (VML needs a URL).

**Consequences.** With the default targets every local image needs `--base-url`. Plain emails are
not built from a folder yet.


## 14. The email's language

**Context.** The shell writes `lang` on `<html>` and the article wrapper; screen readers pick a
voice from it. Components render a fragment, so they couldn't set it.

**Decision.** A `lang` compile option and `--lang` flag; a component sets its own with
`export const lang = "de"`, read from the source like `template`. Order: `<html lang>`, the
component's export, `--lang`, else `en` with I009.

**Consequences.** An email always declares a language; a wrong default is reported rather than
left out.

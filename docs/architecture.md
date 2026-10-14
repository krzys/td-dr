# Architecture

td;dr is a compiler with one job: string in, string out. `compile(html, options)` runs a fixed
pipeline of pure stages and returns the email HTML and a list of diagnostics.

## Pipeline

```
input HTML (+ options.css)
  │ parse      parse5 with source locations → DOM; collects <style>, options.css and font links
  │ sanitize   DOM → DOM: scripts, handlers, framework markers, unsafe URLs, template chains, preheader
  │ style      cascade per screen → StyledElement tree (computed + declared styles)
  │            design width, input lint (client support, accessibility, dark mode)
  │ analyze    ordered rule registry: StyledElement → Layout IR
  │ passes     IR → emit-ready IR, through the phase chain
  │ emit       IR → tables, MSO ghost tables, VML, inline styles
  │ responsive the other screens compiled and diffed into head rules
  │ shell      doctype, head, MSO settings, reset, head <style>, preheader, centring wrapper
  │ post       dead class removal, output self-lint
  │ template   (with options.template) markers and placeholders → Handlebars / Liquid
  ▼
{ html, diagnostics, trace? }
```

`src/pipeline.ts` wires the stages together; nothing else calls more than one of them.

| Stage | Module | Contract |
|---|---|---|
| parse | `src/parse/` | `parse(html, ctx) → ParsedDoc`. Every element keeps its source location. Runs before sanitize so locations point at the author's input. Font host links are recognized here (`src/parse/font-hosts.ts`). |
| sanitize | `src/sanitize/` | `sanitize(doc, ctx) → ParsedDoc`, a copy. Removes scripts, `on*` handlers, `javascript:` URLs, framework comments and hydration attributes; compiles `<picture>` to its `<img>`; turns template chains and `<tddr-*>` elements into marker comments; extracts the preheader. `data-*` attributes stay (scoped CSS selects on them) and are dropped at serialization. |
| style | `src/style/` | `computeStyles(doc, ctx, env, keep?, stacked?) → { body, fonts, conditions }`. Specificity, `!important`, `@layer`, nesting, inheritance, shorthands, `var()`, `calc()`, unit and colour lowering, a minimal UA sheet. Each element carries `style` (computed, for decisions), `declared` (authored, for re-serialization) and `parentStyle`. `@media` and `:hover` are evaluated against one screen (`env`); `conditions` says which screens the author's rules tell apart. |
| design width | `src/analyze/design-width.ts` | `widthDecision(body, ctx) → WidthDecision`, from a quiet probe cascade, before anything is lowered ([layout.md](layout.md#design-width)). |
| input lint | `src/lint/` | `lintInput(styled, ctx, …)` reads the styled tree only: client support for CSS that reaches the output (`src/lint/input.ts`), accessibility and dark-mode checks. |
| analyze | `src/analyze/` | `analyze(body, ctx) → Node`. The first rule in the registry whose `matches` is true lowers the element. Rules see styled elements, never tables. |
| passes | `src/passes/` | `runPasses(ir, ctx) → EmitReady` ([IR phases](#ir-phases)). |
| emit | `src/emit/` | `emit(ir: EmitReady, ctx) → { html, headCss, background? }`. Emitters see IR, never CSS layout properties. All MSO conditional markup comes from `src/emit/mso.ts`. |
| responsive | `src/responsive/` | Compiles each other screen and diffs it with the base ([head-styles.md](head-styles.md)). |
| shell | `src/shell/` | `shell(emitted, meta, ctx, fontHead, head?) → string`. The document around the body ([email-shell.md](email-shell.md)). |
| post | `src/post/` | `post(html, ctx) → string`. Removes classes no rule targets, then self-lints the output against the targets (W006 means a compiler bug). `src/post/trace.ts` reads the trace markers into the trace and strips them. |
| template | `src/template/write.ts` | `writeTemplate(html, dialect, report) → string`. The last step; nothing before it knows a dialect ([templates.md](templates.md)). |

### Contracts every stage keeps

- A stage is a pure function `(input, ctx) => output`. It does not mutate its input and does not
  read another stage's internals.
- `ctx` (`src/ctx.ts`) holds the resolved options, the capability table for the targets and the
  diagnostics sink. Reporting a diagnostic is the only side effect. The pipeline sets two more
  fields: `widthDecision` (the design width, and the root containers already reported as wider
  than the `width` option, so no later stage reports them again) and `otherScreens` (below).
- `SrcLoc`, `locKey` and `withLoc` live in `src/loc.ts`, below every stage, so any stage can carry
  and compare source positions.
- **Only layout containers are lowered.** Text-level content (`p`, `h1`–`h6`, `span`, `a`, lists,
  `blockquote`, `pre`, real `<table>`s) passes through with its styles inlined.
- **No silent best-effort.** Input that can't be lowered faithfully produces a diagnostic with a
  location and a hint. In strict mode (the default) it is an error.
- Core (`src/`) never imports a framework, Vite or a template engine. Those live in `adapters/`.

### Size limits

`src/limits.ts` holds the size policy: sizes are raw UTF-8 bytes, shown in decimal kilobytes with
the exact byte limit beside them. The pipeline checks the final string: W009 above Gmail's clip
(`GMAIL_CLIP_BYTES`, 102,000 bytes) and W012 when the head `<style>` blocks together pass
`HEAD_STYLE_BYTES` (16,384 bytes).

## Several screens, one structure

Author `@media`, `prefers-color-scheme` and `:hover` rules can't be carried through the IR: the
passes move properties between elements (margins become padding, gaps become cell padding). So the
pipeline compiles once per screen and compares the outputs instead:

1. The input is parsed and sanitized once; every screen cascades the same document.
2. A quiet probe cascade finds the design width and which screens the author's rules distinguish
   (every width range their queries split, dark, hover).
3. Each other screen is cascaded too. From those cascades the pipeline derives what every compile
   must share: elements shown on some screens only (`keep`), rows that stack on some screens only
   (`stacked`), and `ctx.otherScreens`: the elements a narrower screen lays out differently
   (`relaidBelow`, so the desktop layout doesn't warn about line breaks that screen replaces) and
   the boxes with a side border on the base screen (`sideBorders`, so every compile gives them a
   table of their own).
4. The base compile (desktop: wide, light, no hover) produces the output. Each other screen is
   compiled on a quiet ctx and diffed with it tag by tag; the changes become classes and head
   rules.

Every compile that is diffed is written with trace markers (below), so each tag says which author
element it came from. Details: [head-styles.md](head-styles.md).

## Layout IR

`src/ir/types.ts` is the source of truth. The IR describes boxes and their arrangement, in px,
with no CSS syntax and no tables.

| Node | Meaning |
|---|---|
| `stack` | Children top to bottom. `gap`, `collapse` (block flow collapses margins, flex columns don't), `justify` inside a min-height. |
| `row` | Columns side by side. `wrap` selects fluid-hybrid; `stacked` marks a screen where the columns become blocks. |
| `image` | `src`, `alt`, rendered size, `fluid`, `href`, `float`, and `line` (text styles of the line an inline image sits on). |
| `button` | A bulletproof button: `href`, label html, text style, kept attributes. |
| `inline` | Pass-through text-level html with its inherited text `style` and lifted outer `margin`. |
| `raw` | Emitted as is (`data-email="raw"`, or unsupported input in non-strict mode). |
| `conditional` | Content only Outlook (`mso`) or only other clients (`not-mso`) read. |
| `template` | `each` (a path and loop variable) or `if` (branches with conditions, `otherwise`). Paths, never dialect syntax. |

`Box` carries padding, margin, per-side borders, background colour, background image, min-height,
radius (and per-corner `radii`), clip, `maxWidth`, `width` (`{px}` or `{pct}`, border-box), `align`
and `hide`. A `Column` carries a `WidthSpec` (`px`, `pct`, `calc`, `grow`, `auto`), vertical and
horizontal alignment, gutter `padding`, `stretch`, `noShrink`, `hidden` and, after width
resolution, `resolved`.

One deliberate exception to "no CSS syntax": a background image's `css`, `size`, `position` and
`repeat` are the author's values, passed verbatim to the clients that paint CSS backgrounds.

### IR phases

The IR is one `Node` type from analyze to emit. A brand on the root says which pass contracts hold
for the whole tree (`src/ir/phase.ts`):

| Phase | Built by | Holds |
|---|---|---|
| `Node` | `analyze` | Margins and gaps as authored (non-negative, except bands that cancel the parent's padding), column `WidthSpec`s, no geometry. |
| `Padded` | `margin-to-padding` | Every margin is 0: collapsed first, then moved into padding. |
| `Resolved` | `resolve-widths` | Every stack and row has its `resolvedWidth`; every column has a `resolved` width (`{ px, pct }`), or `null` where the table sizes it on purpose (auto and grow columns only). |
| `EmitReady` | `gap-to-padding` | Every gap is 0: row gaps are column padding, stack gaps are padding on transparent wrapper stacks. |

`runPasses` (`src/passes/index.ts`) chains them in order: `bleed` and `collapse-margins` on the
analyzed tree, then `margin-to-padding` (Node → Padded), `resolve-widths` (Padded → Resolved),
`gap-to-padding` (Resolved → EmitReady) and `flatten-stacks` (EmitReady → EmitReady, merging
boxless nested stacks into their parent). Each pass is a `Pass<In, Out>`, and only the pass that
builds a phase brands a tree with it (`src/passes/brand.ts`).

`emit()` takes `EmitReady` only, so the emitters can count on margins and gaps being padding and
every width being resolved. `runPasses` ends with `checkEmitReady`, which walks the tree and throws
an internal error when a pass broke its contract, before any table is written. A hand-built tree
(in tests) goes through `checkEmitReady` too.

## The emitter

`emit()` creates one `EmitContext` per call (`src/emit/context.ts`) and passes it down explicitly:
the compile's `ctx`, the page width (no ghost table is ever wider than the email), whether the
markup sits inside a row column (where tables keep auto layout), and the head CSS that fluid rows
ask for. A nested scope is a copy, so nothing is restored on the way out and two compiles never
share state.

`EmitContext` is also a `TraceScope`: the author element the tags being written belong to. With the
`trace` option, and for every compile the head-style diff compares, each start tag gets a marker
attribute holding its element's source position. The markers are defined in `src/emit/trace.ts`
(`TRACE_ATTR`, `traceValue`, and `markTree`, which marks the styled tree so pass-through html
carries them too); `src/post/trace.ts` only reads them into the `trace` array and strips them, so
they never reach the output.

The emitter only produces markup documented in these pages: ghost tables, fluid-hybrid columns,
bulletproof buttons, VML backgrounds, the shell and the other patterns. A table structure that isn't
described there is a bug. Client claims not checked in a real client are marked **unverified**.

## Extension points

| To add | Where | Rule |
|---|---|---|
| A layout rule | one file in `src/analyze/rules/`, one line in `src/analyze/registry.ts` | `Rule = { name, matches(el, ctx), analyze(el, ctx, recurse) }`. `matches` reports nothing. First match wins. |
| An IR pass | one file in `src/passes/`, one line in `src/passes/index.ts` | `Pass<In, Out> = { name, run(ir, ctx) }`. It takes the phase the pass before it builds. |
| A diagnostic code | `src/diagnostics/codes.ts` | One table with default severity, title and hint. Codes are never renumbered. |
| A template dialect | `src/template/dialects.ts` | A table of writers and data needs, not new code paths. |
| A client preset | `src/targets/presets.ts` | A list of caniemail `(family, platform)` pairs. |
| A framework | `adapters/<name>/` | `render(Component, props)` for HTML and a symbolic render for templates. Core stays untouched. |

Registry order: `template` → `hint` → `unsupported` → `image` → `button` → `grid` →
`table-display` → `flex` → `block` → `inline`. Pass order: `bleed` → `collapse-margins` →
`margin-to-padding` → `resolve-widths` → `gap-to-padding` → `flatten-stacks`.

Shared analysis helpers (classification, child grouping, pass-through serialization) live once in
`src/analyze/{classify,children,serialize-styled}.ts`. Width arithmetic sits behind the
`WidthResolver` interface (`src/passes/pass.ts`); the implementation is arithmetic over the row's
content box, not a layout engine.

Additions to the IR are additive fields with a documented meaning; changing an existing field's
meaning needs an entry in [decisions.md](decisions.md).

## Diagnostics

Every diagnostic has a code (`E###` error, `W###` warning, `I###` info), a message and, where it
helps, a hint and a source location (`line`, `col`, and `file` for component sources). The CLI
prints `file:line:col: severity CODE: message` followed by the hint. With `strict: false` the sink
downgrades errors to warnings. Client-support problems are warnings even in strict mode: strict
mode is about what td;dr can lower, not about what every client renders. The code table is in
[css-support.md](css-support.md#diagnostic-codes).

## Module map

```
src/
  parse/ sanitize/ style/ analyze/ passes/ emit/ shell/ post/   pipeline stages
  responsive/   other screens: variants, diff, head rules
  lint/         input lint: client support, accessibility, dark mode
  targets/      vendored caniemail data, presets, capability lookup
  template/     placeholders, conditions, dialects, preview(), writer
  ir/           Layout IR types, helpers, phases
  diagnostics/ ctx.ts loc.ts limits.ts pipeline.ts index.ts cli.ts
adapters/
  react/ vue/   renderers, If/ElseIf/Else/Each, symbolic renders
  template/     the operator rewrite and the runtime transformed email modules import
  vite/         plugin, email discovery, CSS collection, assets, build, equivalence check
  dev/          dev server and its static UI
test/
  fixtures/<feature>/<case>/   input.html, intent.md, expected.html, diagnostics.json
  harness/ unit/               runners, golden lint, size budget, visual diff
```

## Code conventions

TypeScript strict, ESM, Node 22. Small named exports, no default exports, no classes unless state
requires one, data tables over branching. One rule or pass per file. Comments are short and say
why. Every behaviour change comes with a fixture or unit test. No new runtime dependency without a
decision entry.

# Architecture

td;dr is a compiler: string in, string out. `compile(html, options)` runs a fixed pipeline of pure
stages and returns the email HTML and a list of diagnostics. No layout engine and no browser run at
compile time.

## Pipeline

```
input HTML (+ options.css)
  │ parse      parse5 with source locations → DOM; collects <style>, options.css and font links
  │ sanitize   DOM → DOM: scripts, handlers, framework markers, unsafe URLs, template chains, preheader
  │ style      cascade per screen → StyledElement tree; unsafe CSS dropped; design width; input lint
  │ analyze    ordered rule registry: StyledElement → Layout IR
  │ passes     IR → emit-ready IR, through the phase chain
  │ emit       IR → tables, MSO ghost tables, VML, inline styles
  │ responsive the other screens compiled and diffed into head rules
  │ shell      doctype, head, MSO settings, reset, head <style>, preheader, centring wrapper
  │ post       dead class removal, output self-lint
  │ template   (with options.template) markers and placeholders → Handlebars / Liquid
  │ wrap       lines over 900 bytes broken where a line break means what was there
  ▼
{ html, diagnostics, trace? }
```

`src/pipeline.ts` wires the stages; nothing else calls more than one of them. Stages recurse over the tree,
so input nested deeper than the stack holds ends the compile with E018 and an empty `html`,
located at the deepest element.

| Stage | Module | Contract |
|---|---|---|
| parse | `src/parse/` | `parse(html, ctx) → ParsedDoc`. Every element keeps its source location; font host links are recognized (`font-hosts.ts`). |
| sanitize | `src/sanitize/` | `sanitize(doc, ctx) → ParsedDoc`, a copy. Removes unsafe and framework markup, compiles `<picture>` to its `<img>`, turns template chains and `<tddr-*>` into markers, extracts the preheader. Removed radios and checkboxes stay in place as `stateOnly`, for `:checked` to match; the style stage reports and skips them. |
| style | `src/style/` | `computeStyles(doc, ctx, env, keep?, stacked?) → { body, fonts, conditions }`. Each element carries `style` (computed), `declared` (authored, for re-serialization) and `parentStyle`. `conditions` says which screens the author's rules tell apart. |
| design width | `src/analyze/design-width.ts` | `widthDecision(body, ctx)` from a quiet probe cascade, before anything is lowered ([support.md](support.md#design-width)). |
| input lint | `src/lint/` | Client support for CSS that reaches the output, accessibility and dark-mode checks, on the styled tree only. |
| analyze | `src/analyze/` | `analyze(body, ctx) → Node`. The first registry rule whose `matches` is true lowers the element. Rules see styled elements, never tables. |
| passes | `src/passes/` | `runPasses(ir, ctx) → EmitReady` ([IR phases](#ir-phases)). |
| emit | `src/emit/` | `emit(ir, ctx) → { html, headCss, background? }`. Emitters see IR, never CSS layout properties. |
| responsive | `src/responsive/` | Compiles each other screen and diffs it with the base ([support.md](support.md#head-styles)). |
| shell | `src/shell/` | The document around the body ([support.md](support.md#the-email-shell)). |
| post | `src/post/` | Removes classes no rule targets, says four written-out sides (padding, margin, border, radius) as their shorthand, self-lints the output (W006 means a compiler bug), reads and strips trace markers. |
| template | `src/template/write.ts` | `writeTemplate(html, dialect, report)`. Nothing before it knows a dialect ([templates.md](templates.md)). |
| wrap | `src/post/wrap.ts` | `wrapLines(html, ctx)`. The last step: keeps every line under SMTP's 998 bytes without changing what renders, or reports W019 ([support.md](support.md#size-limits)). |

### Stage contracts

- A stage is a pure function `(input, ctx) => output`: it doesn't mutate its input or read another
  stage's internals. Parsing runs before sanitize, which works DOM to DOM, so locations point at
  the author's input and no regex ever runs over HTML.
- `ctx` (`src/ctx.ts`) holds the resolved options, the targets' capability table and the
  diagnostics sink; reporting is the only side effect. The pipeline adds `widthDecision` and
  `otherScreens`. `src/loc.ts` (source positions) sits below every stage.
- **Only layout containers are lowered**; text-level content passes through with styles inlined.
- **No silent best-effort:** input that can't be lowered faithfully is a diagnostic with a location
  and a hint; in strict mode an error.
- Core (`src/`) never imports a framework, Vite or a template engine; those live in `adapters/`.

### Several screens, one structure

Author `@media`, dark and `:hover` rules and `light-dark()` values can't be carried through the
IR, because passes move properties between elements. So the pipeline compiles once per screen and
compares outputs:

1. The input is parsed and sanitized once; every screen cascades the same document.
2. A quiet probe cascade finds the design width; the screens the author's rules distinguish are
   then derived at that width.
3. Every screen is cascaded to derive what all compiles share: elements shown on some screens only
   (`keep`), rows stacked on some screens only (`stacked`), and `ctx.otherScreens` (elements a
   narrower screen lays out differently, so the base doesn't warn about breaks that screen
   replaces; boxes with a side border on the base, which get their own table everywhere; columns
   another screen spaces with another `space-*` value, which get the same spacer rows everywhere;
   boxes with a fill or a border on some screens only, or padded on some only while painted, which
   keep their cell everywhere, unpainted where a screen paints nothing (`Box.keepCell`); text
   blocks painted or padded on some screens only, which keep that box everywhere instead of passing
   through as text). Structure is decided from all screens at once, so a screen that only adds,
   changes or drops paint or padding differs from the base in styles alone, and a box styled alike
   on every screen is emitted as if there were no other screen.
4. The base compile (wide, light, no hover) is the output. Each other screen compiles on a quiet ctx
   with trace markers and is diffed tag by tag; changes become classes and head rules. What a screen
   says that the base doesn't is reported once for all the screens saying it, led by them (`scopeOf`
   in `src/responsive/variants.ts`). The page colour sits in the shell, outside the diffed html, so
   a width or dark screen that changes it gets rules for the body and the page table's class.

## Layout IR

`src/ir/types.ts` is the source of truth: boxes and their arrangement in px, with no CSS syntax and
no tables.

| Node | Meaning |
|---|---|
| `stack` | Children top to bottom: `gap`, `collapse` (block flow collapses margins, flex columns don't), `justify` inside a min-height. |
| `row` | Columns side by side; `wrap` selects fluid-hybrid; `stacked` marks screens where the columns become blocks. |
| `image` | `src`, `alt`, size, `fluid`, `href`, `float`, `line` (text styles of an inline image's line). |
| `button` | Bulletproof button: `href`, label, text style, kept attributes. |
| `inline` | Pass-through text-level html with its inherited text style and lifted outer margin. |
| `raw` | Emitted as is. |
| `conditional` | Content only Outlook (`mso`) or only other clients (`not-mso`) read. |
| `template` | `each` or `if` with paths and conditions, never dialect syntax. |

A `Box` carries padding, margin, per-side borders, background colour and image, min-height,
radius and per-corner `radii`, clip, `maxWidth`, `width` (`{px}` or `{pct}`, border-box), `align`
and `hide`. A `Column` carries a `WidthSpec` (`px`, `pct`, `calc`, `grow`, `auto`), alignment,
gutter padding, `stretch`, `noShrink`, `hidden` and, after width resolution, `resolved`. The one
exception to "no CSS syntax": a background image's `css`, `size`, `position` and `repeat` pass
through verbatim. Additions are additive fields with one meaning; changing a field's meaning is a
behaviour change that needs its own rationale here.

### IR phases

One `Node` type runs from analyze to emit; a brand on the root says which pass contracts hold
(`src/ir/phase.ts`):

| Phase | Built by | Holds |
|---|---|---|
| `Node` | `analyze` | Margins and gaps as authored, column `WidthSpec`s, no geometry. |
| `Padded` | `margin-to-padding` | Every margin is 0: collapsed first, then moved into padding. |
| `Resolved` | `resolve-widths` | Every stack and row has `resolvedWidth`; every column a `resolved` width, or `null` where the table sizes it on purpose (auto and grow columns). |
| `EmitReady` | `gap-to-padding` | Every gap is 0: row gaps are column padding, stack gaps padding on wrapper stacks. |

Pass order: `bleed` → `collapse-margins` → `margin-to-padding` → `resolve-widths` →
`gap-to-padding` → `flatten-stacks`. Only the pass that builds a phase brands a tree with it.
`emit()` takes `EmitReady` only; `checkEmitReady` walks the tree and throws an internal error when a
pass broke its contract, before any table is written. Width arithmetic sits behind the
`WidthResolver` interface (`src/passes/pass.ts`): arithmetic over the row's content box.

## The emitter

`emit()` creates one `EmitContext` per call (`src/emit/context.ts`) and passes it down: the
compile's `ctx`, the page width (no ghost table is wider than the email), whether the markup sits
in a row column (where tables keep auto layout), and the head CSS fluid rows need. Nested scopes are
copies, so two compiles never share state. It is also a `TraceScope`: with the `trace` option, and
for every compile the head-style diff compares, each start tag gets a marker naming its source
element (`src/emit/trace.ts`); `src/post/trace.ts` reads them into `trace` and strips them.

The emitter writes only the patterns in [support.md](support.md#outlook-and-mso): ghost tables,
fluid-hybrid columns, bulletproof buttons, VML backgrounds, the shell. Any other table structure is
a bug. All MSO conditional markup comes from `src/emit/mso.ts`.

## Extension points

| To add | Where | Rule |
|---|---|---|
| A layout rule | a file in `src/analyze/rules/`, a line in `src/analyze/registry.ts` | `{ name, matches(el, ctx), analyze(el, ctx, recurse) }`; `matches` reports nothing; first match wins. |
| An IR pass | a file in `src/passes/`, a line in `src/passes/index.ts` | `Pass<In, Out> = { name, run(ir, ctx) }`, taking the phase the previous pass builds. |
| A diagnostic code | `src/diagnostics/codes.ts` | Severity, title and hint; codes are never renumbered. |
| A template dialect | `src/template/dialects.ts` | A table of writers and data needs, plus real-engine tests. |
| A client preset | `src/targets/presets.ts` | A list of caniemail `(family, platform)` pairs. |
| A framework | `adapters/<name>/` | `render(Component, props)` and a symbolic render; core untouched. |

Registry order: `template` → `hint` → `unsupported` → `image` → `button` → `grid` →
`table-display` → `flex` → `block` → `inline`. Classification, child grouping and pass-through
serialization live once in `src/analyze/{classify,children,serialize-styled}.ts`.

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
  template/     the operator rewrite and its runtime
  vite/         plugin, email discovery, CSS collection, assets, build, equivalence check
  dev/          dev server and its static UI
test/
  fixtures/<feature>/<case>/   input.html, intent.md, expected.html, diagnostics.json
  harness/ unit/               runners, golden lint, size budget, visual diff
```

TypeScript strict, ESM, Node 22. Small named exports, no default exports, no classes unless state
needs one, data tables over branching, one rule or pass per file. Every behaviour change comes with
a fixture or unit test.

## Design decisions

| Decision | Why |
|---|---|
| Arithmetic, no layout engine or headless browser at runtime; six runtime dependencies (`parse5`, its htmlparser2 adapter, `css-select`, `dom-serializer`, `postcss`, `lightningcss`); frameworks and engines are optional peers. | The supported subset needs arithmetic, text widths can't be known anyway (the client picks the font), and the install stays small. A new runtime dependency needs a stated reason. |
| Strict by default: what can't be lowered faithfully is an error; `strict: false` keeps it as written with a warning. Client-support gaps are warnings (W005), never errors. | Silent breakage in Outlook costs more trust than a clear error. Strict mode is about what td;dr can lower, not what every client renders. Every approximation carries W003 or W001; the one exception is a px `height` that taller content grows. |
| A small Layout IR between analyzers and emitters. | Analyzers know CSS but not tables, emitters know tables but not flexbox; margins and gaps become padding in IR passes, so the emitter never writes CSS margins. |
| Design width from the email: the `width` option, else the root container's px width, else 600. | Outlook needs fixed px widths; a fixed 600 would shrink wider designs. Everything after the cascade sees one resolved width. |
| Head styles by compiling each screen and diffing the output. | Passes move properties between elements; carrying overrides through the IR would make every pass handle them. The base compile is what Outlook and clients without head styles show. Each screen costs a full compile. |
| Fixed table layout for single-column stacks outside row columns; equal-height cards as column cells; wrapping rows as fluid-hybrid columns. | Each is the one table form that holds across fixtures ([support.md](support.md#layout)); changing one is a behaviour change with golden updates. |
| Vendored caniemail data, never fetched; support is the worst status across a preset's pairs. | Deterministic lint and tests; stale or proxied data (`outlook-new`) is a known source of wrong warnings. |
| Size changes must not change rendering. | A size budget keeps the gains; visual diffs keep the rendering. Defaults clients may need (`border="0"`, per-cell font styles) stay until real-client sends show otherwise. |
| Templates as placeholders and markers written in a dialect at the end; conditions mean what they mean in JS; the native rewrite is syntactic. | The same components export as HTML and as ESP templates; nothing before the writer knows a dialect, and what has no exact form is refused at the source ([templates.md](templates.md)). |
| An equivalence check of every template against its data sets with the real engines. | The rewrite and the writers must hold on the author's own emails, not only td;dr's tests. Identical wrappers from both paths would couple them, an allow-list of known mismatches would hide regressions, and pixel diffs would need a browser in the build. |
| The email always declares a language (`<html lang>` or `xml:lang`, the component's `export const lang`, `--lang`, else `en` with I009). | Screen readers pick a voice from it; a wrong default is reported rather than left out. |

## Verification

| Command | Runs |
|---|---|
| `pnpm check` | `tsc --noEmit`, then `vitest run` (`test/unit/`, `test/harness/`, without visual tests). |
| `pnpm test:visual` | Every `test/harness/*.visual.test.ts` in Playwright Chromium; `TDDR_ENGINE=firefox` or `webkit` runs it in that engine ([Engines](#engines)). |
| `pnpm build` | `tsup`, declarations and `scripts/dts-extensions.ts`. |
| `pnpm smoke` | Builds, packs and installs the tarball in a scratch project (`KEEP=1` keeps it). |
| `pnpm gallery` | A static page of every compiled fixture, for test sends to real clients. |
| `pnpm caniemail` | Refreshes the vendored caniemail data. |

Targeted runs: `npx vitest run test/unit/<file>.test.ts`,
`npx vitest run test/harness/fixtures.test.ts -t "<feature>/<case>"`,
`npx vitest run --config vitest.visual.config.ts -t "<feature>/<case>"`.

The visual tests need the engine for the installed Playwright (`pnpm exec playwright install
chromium`, `firefox` or `webkit`) and the **Inter** font (`fonts-inter` on Debian and Ubuntu). The
harness starts each engine with `test/harness/fonts.conf`: Inter for the system and generic
sans-serif names, grayscale antialiasing, no hinting, so renders don't depend on the machine's font
setup (Chromium also gets `--disable-lcd-text`). It refuses to run if Inter is missing.

### Engines

`TDDR_ENGINE=chromium|firefox|webkit` picks the engine for a visual run (default `chromium`);
diff images go to `test/.visual/<engine>/`. An engine renders the source and the output itself and
the two are compared with the same tolerances, so a pass means the output looks like the source in
that engine, not that the engines agree. `visual`, `examples` and `inferred-width` run in all three;
`dev-ui` runs in Chromium only, as it tests our page's script, not an email render.

A fixture opts an engine out with `skipEngines: [webkit] # reason` in `intent.md`; the reason is
required (the parser refuses without it) and has to show that the engine renders the *source*
differently or wrongly. What td;dr gets wrong in one engine stays a failing test. WebKit skips the
`supports-conditions` source (it supports `margin-trim`, so the `@supports` block td;dr leaves out
applies there), the image `flex-column-stack` source (it sizes a `width:100%;height:auto` image in a
column flex 552x239 instead of 552x220) and two sources whose translucent text it antialiases
differently from the flattened colour (0.0024 and 0.0028 at 375). `examples.visual.test.ts` has the
same list for `react-order-template` in WebKit (a unitless line height times a fractional font size
lays out 1px short, in the source only).

### What is checked

| Layer | Where | Guarantees |
|---|---|---|
| Unit tests | `test/unit/` | Each rule, pass, emitter, cascade feature, template writer, adapter and CLI path; `contracts.test.ts` holds the stage contracts. |
| Golden fixtures | `test/fixtures/`, `test/harness/fixtures.test.ts` | `input.html` compiles to exactly `expected.html` with exactly `diagnostics.json`, and no line over 998 bytes without a W019. |
| Golden lint | `test/harness/golden-lint.test.ts` | What Chromium renders fine but Outlook or Gmail don't: unbalanced or nested conditionals, tables without rows, margins on cells, non-hex `bgcolor`, a table inside a link, `<hr>`, `currentcolor`, unsized images. |
| Output self-lint | `src/post/self-lint.ts`, every compile | The output uses only features the targets support (W006 otherwise). |
| Size budget | `test/harness/output-size.test.ts` | Real-world, framework and complex goldens stay within 1% of `size-budget.json`; growing needs `UPDATE_SIZE_BUDGET=1` and a reason. |
| Visual diff | `test/harness/visual.visual.test.ts` | Input and output rendered in each engine at 600 and 375 px (or the intent's `viewports`) and compared with pixelmatch (threshold 0.02) within `maxDiffRatio` (default 0.002; `maxDiffRatio<width>` for one viewport); mutation tests prove the oracle sees faint fills and hairlines. Diff images go to `test/.visual/<engine>/`. |
| Real template engines | template fixtures, `test/unit/template-*.test.ts`, `test/unit/adapters/` | Each dialect's output filled by `handlebars` / `liquidjs` renders like `preview()` of the source on the same data; the condition writers are checked against both engines over value combinations. |
| Examples and dev page | `examples/`, `test/harness/examples.visual.test.ts`, `dev-ui.visual.test.ts` | The React and Vue examples build through the Vite adapter and, filled, look like their HTML render; the dev UI links source and output. |
| Package | `scripts/smoke.ts` | The tarball holds only `dist`, `NOTICE`, `README.md`, `package.json`; without peers every export and the CLI load; with peers all entries type-check, both adapters render, a folder build and `tddr dev` work. |
| caniemail freshness | `test/unit/targets/caniemail-data.test.ts` | The data matches its hash and is under 120 days old. |
| caniemail coverage | `test/unit/targets/features.test.ts` | Every CSS and image feature in the data is mapped from a property, value, selector or image type, or excluded with a reason. |

A fixture's `intent.md` front matter says how it runs: `status`, `expect` (`compile` or a
diagnostic case), `codes`, `feature`, `viewports`, `maxDiffRatio` (with a reason when loosened),
`allowSvg`, `lang`, `template` (one or several dialects, one `expected.<dialect>.html` each),
`skipEngines` (see [Engines](#engines)).

CI (`.github/workflows/ci.yml`) runs two jobs on every push and pull request: `check`
(`pnpm install --frozen-lockfile`, `pnpm check`, `pnpm build`, `pnpm smoke`) and `visual`
(a matrix of Chromium, Firefox and WebKit with `fonts-inter`, `pnpm test:visual`, and each engine's
diff images uploaded on failure).

### What it does not prove

- **Chromium, Firefox and WebKit are not email clients.** Visual checks say nothing about Word,
  Gmail's sanitizer, webmail rewriting or dark modes; golden lint and the pattern-only emitter cover
  the structural risks.
- **caniemail data is community test data**, point-in-time, some of it years old; presets such as
  `outlook-new` use proxies.
- **Real-client checks are manual:** build the gallery, send it to test inboxes (Outlook for
  Windows, Gmail web and apps, Apple Mail, Outlook.com, Yahoo), compare. Every real-client bug
  becomes a fixture.
- **Ratio-based diffs miss small structural losses** such as a lost corner radius; goldens cover
  structure.
- **Equivalence is per data set**, with reference engines that may differ from a platform's build.

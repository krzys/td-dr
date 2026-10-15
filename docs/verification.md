# Verification

What the test suite checks, how, and what it can't tell you.

## Commands

| Command | Runs |
|---|---|
| `pnpm check` | `tsc --noEmit`, then `vitest run` (`vitest.config.ts`: `test/unit/` and `test/harness/`, without the visual tests). Must pass before a commit. |
| `pnpm test:visual` | `vitest run --config vitest.visual.config.ts`: every `test/harness/*.visual.test.ts`, in Playwright Chromium. |
| `pnpm build` | `tsup`, declarations (`tsconfig.build.json`) and `scripts/dts-extensions.ts`. |
| `pnpm smoke` | `scripts/smoke.ts`: builds, packs and installs the package the way a user would (below). `KEEP=1` keeps the scratch project. |
| `pnpm gallery` | A static page of every compiled fixture (source, output, diagnostics) for test sends to real clients. |
| `pnpm caniemail` | Refreshes the vendored caniemail data. |

Targeted runs: `npx vitest run test/unit/<file>.test.ts`,
`npx vitest run test/harness/fixtures.test.ts -t "<feature>/<case>"`,
`npx vitest run --config vitest.visual.config.ts -t "<feature>/<case>"`. The visual tests need a
Chromium for the installed Playwright (`pnpm exec playwright install chromium`) and the Inter font
(`fonts-inter` on Debian and Ubuntu). The harness starts Chromium with its own font setup,
`test/harness/fonts.conf`: Inter for the system and generic sans-serif names, grayscale
antialiasing and no hinting, so a render doesn't depend on the machine's font configuration.

## What is checked

| Layer | Where | Guarantees |
|---|---|---|
| Unit tests | `test/unit/` | Each rule, pass, emitter, cascade feature, template writer, adapter and CLI path in isolation. `test/helpers` builds styled nodes without the style stage; `contracts.test.ts` holds the stage contracts together. |
| Golden fixtures | `test/fixtures/<feature>/<case>/`, `test/harness/fixtures.test.ts` | `input.html` compiles to exactly `expected.html` with exactly `diagnostics.json`. |
| Golden lint | `test/harness/golden-lint.test.ts` | Every golden is checked for things Chromium renders fine but Outlook or Gmail don't: balanced `[if]` / `[endif]`, tables without rows, margins on cells, non-hex `bgcolor`, a table inside a link, `<hr>`, `currentcolor`, images without a width and no diagnostic, nested conditionals. |
| Output self-lint | `src/post/self-lint.ts`, every compile | The output only uses features the targets support (W006 otherwise: a compiler bug). |
| Size budget | `test/harness/output-size.test.ts` | The real-world, framework and complex goldens stay within 1% of their size in `size-budget.json`. Shrinking is free; growing needs `UPDATE_SIZE_BUDGET=1` and a reason. |
| Visual diff | `test/harness/visual.visual.test.ts` | Each compile fixture's input and output rendered at 600 and 375 px (or the intent's `viewports`) with the same reset, compared with pixelmatch (threshold 0.02). The tolerance is the intent's `maxDiffRatio` (default 0.002), `maxDiffRatio<width>` for one viewport, with a reason when loosened. Mutation tests prove the oracle notices faint fills and hairlines. Diff images land in `test/.visual/`. |
| Real template engines | template fixtures in the visual run; `test/unit/template-*.test.ts`, `test/unit/adapters/` | A template fixture is compiled per dialect, filled by `handlebars` or `liquidjs` with each `props*.json`, and its render compared with `preview()` of the source on the same data. Handlebars runs with `equals` / `notEquals` helpers that throw on a call outside the stated contract. Condition writers and the semantics contract are checked against both engines over combinations of values, also with a strict and a coercing helper pair. |
| Example emails | `examples/`, `test/harness/examples.visual.test.ts` | The React and Vue template examples build through the Vite adapter; each, filled by the real engines with each data set, must look like the same component rendered as HTML. |
| Dev page | `test/harness/dev-ui.visual.test.ts` | The dev server on `examples/` in Chromium: source and output linking, panels at phone and desktop width, the size readout. |
| Equivalence | `adapters/vite/equivalence.ts`, every folder build | On the author's own emails: each data set filled into each dialect equals the HTML render after normalization ([templates.md](templates.md#the-equivalence-check)). |
| Package | `scripts/smoke.ts` | The packed tarball holds only `dist`, `NOTICE`, `README.md` and `package.json`. Installed in a scratch project without the optional peers, every export target and the bin exist and the CLI and `compile` work; with `react`, `react-dom`, `vue`, `vite`, `handlebars` and `liquidjs`, all entries type-check, both adapters render, a folder build writes one file per dialect and `tddr dev` serves. |
| caniemail freshness | `test/unit/targets/caniemail-data.test.ts` | The vendored data matches its recorded hash and is less than 120 days old. |

A fixture's `intent.md` front matter says how it runs: `status: active` to run, `expect: compile`
or a diagnostic case, `codes:` the diagnostics it is about, `feature`, `viewports`, `maxDiffRatio`,
`allowSvg`, `lang`, `template` (one dialect or a list; with several, one `expected.<dialect>.html`
each), and a description of what it proves.

CI (`.github/workflows/ci.yml`) runs two jobs on every push and pull request: `check`
(`pnpm install --frozen-lockfile`, `pnpm check`, `pnpm build`, `pnpm smoke`) and `visual`
(Playwright's Chromium, `pnpm test:visual`, the diff images uploaded on failure).

## What it does not prove

- **Chromium is not an email client.** Every visual check is a browser render. It shows that the
  tables reproduce the source layout in a browser engine and says nothing about Outlook's Word
  engine, Gmail's CSS sanitizer, webmail rewriting or any client's dark mode. Golden lint and the
  pattern-only emitter cover the structural risks Chromium can't see.
- **Client support data is community test data.** caniemail results are point-in-time and some are
  years old; presets such as `outlook-new` use proxies. The docs mark every client claim that hasn't
  been confirmed as **unverified**.
- **Real-client checks are manual.** Build the gallery, send it to test inboxes (Outlook for
  Windows, Gmail web and apps, Apple Mail, Outlook.com, Yahoo) and compare. Every real-client bug
  becomes a fixture and a note on the relevant docs page.
- **Ratio-based diffs miss small structural losses** such as a lost corner radius; structure is
  covered by goldens and golden lint instead.
- **Equivalence is per data set.** Branches no data set reaches are not compared, and the reference
  engines may differ from a sending platform's build of them.

# Contributing

Issues and pull requests are welcome. For anything larger than a fix, open an issue first so the
approach can be agreed before the work.

## Setup

Node.js 22.18 or later and pnpm (the version in `package.json` `packageManager`).

```sh
pnpm install
pnpm check   # typecheck, unit tests and golden fixtures
```

[Verification](docs/architecture.md#verification) lists every command and what each one proves;
[architecture.md](docs/architecture.md) describes the pipeline.

To try a local build in another project, `pnpm build && pnpm pack`, then add the `.tgz` there. The
tarball holds `dist/`, `LICENSE`, `NOTICE`, `README.md` and `package.json`. The
`@krzys_s/tddr/react`, `@krzys_s/tddr/vue` and `@krzys_s/tddr/vite` types import their framework's
types (`@types/react`, Vue with the `DOM` lib, `@types/node`).

## Changing output

Every fixture in `test/fixtures/` compiles to exactly its `expected.html` and `diagnostics.json`.
When a change is meant to alter output, regenerate the goldens and read the diff before committing:

```sh
pnpm exec vitest run test/harness/fixtures.test.ts -u
git diff test/fixtures
```

A bug report becomes a fixture: `input.html`, an `intent.md` saying what it checks, and the goldens.

Output that changes how an email looks needs the visual tests too (`pnpm test:visual`; set
`TDDR_ENGINE=firefox` or `webkit` for the other engines). They need Playwright's engine and the
Inter font, see [Verification](docs/architecture.md#verification).

Tolerances, size budgets and assertions are part of the contract: a change fixes the output rather
than loosening them, and doesn't skip a test to get green.

## Commits

One change per commit, its subject `area: what it does now`, lower case, no full stop, for example
`text: keep a tag that closes beside an inline tag on that line`. The area is the part of the code
it touches (`style`, `emit`, `text`, `cli`, `dev server`, `docs`, …).

## License

Contributions are released under the [MIT License](LICENSE), as the project is.

# Changelog

td;dr follows [semantic versioning](https://semver.org/); while it is at 0.x, a minor version may
change options, diagnostics or output.

## 0.1.0

The first release.

- `compile()` from HTML and CSS to email-safe HTML: nested tables, inline styles, Outlook
  conditional markup and VML, a head `<style>` for clients that read one, with a diagnostic for
  everything it can't lower faithfully.
- Targets from caniemail data, responsive variants for `@media`, template dialects
  (Handlebars and Liquid) checked for equivalence against their real engines, and a plain-text part.
- The `tddr` command line: `build`, `check` and `dev`, with `--watch`, `--text`, JSON and SARIF
  diagnostics and a `tddr.config.ts`.
- `@krzys_s/tddr/react`, `@krzys_s/tddr/vue` and `@krzys_s/tddr/vite` for component emails.

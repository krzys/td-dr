# td;dr

**too divvy; didn't render** — a compiler from ordinary HTML and CSS to email-safe HTML.

You write markup the way you would for a browser: flex, grid, gap, `max-width`, `var()`, `@layer`,
modern colours, `@media`, or the server-rendered output of React and Vue components. td;dr turns it
into what email clients render: nested tables, inline styles, Outlook conditional (MSO) markup and
VML, plus a small head `<style>` for clients that read one. Anything it cannot lower faithfully is
reported as a diagnostic with a source location and a hint, never dropped silently.

The package, binary and import name is `tddr`.

## Install

Requires Node.js 22 or later and pnpm. td;dr is not published to a registry; build and pack it
from this repository, then add the tarball to your project:

```sh
pnpm install && pnpm build && pnpm pack   # writes tddr-0.0.0.tgz
cd ../your-project && pnpm add ../td-dr/tddr-0.0.0.tgz
```

The core has six runtime dependencies. Everything framework-related is an optional peer; install
only what you use:

| Peer | Needed for |
|---|---|
| `vite` | `tddr dev`, folder builds, `tddr/vite` |
| `react`, `react-dom` | React email components (`tddr/react`) |
| `vue` | Vue single-file-component emails (`tddr/vue`) |
| `handlebars`, `liquidjs` | the equivalence check and engine-filled previews of templates |

## Compile HTML

```ts
import { compile } from "tddr";

const { html, diagnostics } = compile(source, { targets: ["gmail", "outlook-2019"] });
for (const d of diagnostics) console.log(d.severity, d.code, d.message, d.loc);
```

`source` is a full document or a body fragment. Options:

| Option | Default | Meaning |
|---|---|---|
| `css` | `[]` | Extra stylesheets (strings), applied after the document's `<style>` blocks. |
| `targets` | `["broad"]` | Client presets for support lint: `broad`, `gmail`, `outlook-2019`, `outlook-com`, `outlook-new`, `outlook-mobile`, `apple-mail`, `yahoo`, `samsung`. |
| `width` | from the email | Design width in px. Without it: the root container's px `max-width`/`width`, else 600. |
| `strict` | `true` | Unsupported input is an error. `false` turns those errors into warnings and keeps the input as written. |
| `allowSvg` | `false` | Keep inline `<svg>` with warning W010 instead of error E008. |
| `lang` | from the source | The email's language when the document has no `<html lang>`; else `en` with I009. |
| `template` | none | `"handlebars"` or `"liquid"`: write fields and blocks for an ESP template. |
| `trace` | `false` | Also return which input element each output tag came from (used by the dev server). |

A `Diagnostic` is `{ code, severity: "error" | "warning" | "info", message, hint?, loc?: { line, col, file? } }`.
`E…` codes are errors (input td;dr can't lower faithfully; with `strict: false` they become
warnings), `W…` warnings (approximations, client-support gaps, size limits) and `I…` notes; the
table is in [docs/support.md](docs/support.md#diagnostic-codes).
The package also exports `preview(html, props)` (evaluate template hints against sample data),
`field(path)` (a placeholder for a data field) and `writeString(text, dialect)` (write a subject or
preheader string for a dialect). See [docs/templates.md](docs/templates.md).

## Command line

```sh
tddr build email.html -o out.html --targets gmail,outlook-2019
tddr build email.html --css extra.css --width 640 --lang de
tddr build emails --base-url https://cdn.example.com/emails   # every template email in a folder
tddr dev emails                                                # preview server
```

`tddr build <file>` writes to stdout without `-o`. The exit code is 1 when any error diagnostic is
reported (the output is still written) and 2 for usage errors.

| Flag | Applies to | Meaning |
|---|---|---|
| `-o, --out <path>` | build | Output file; for a folder, the output folder (default `dist/emails`). |
| `--targets <a,b>` | build | Comma-separated presets. |
| `--width <px>` | build | Design width. |
| `--css <file>` | file build | Extra stylesheet, repeatable. |
| `--lang <tag>` | build | Language tag (`de`, `pt-BR`). |
| `--allow-unsupported` | build | Same as `strict: false`. |
| `--allow-svg` | build | Same as `allowSvg: true`. |
| `--file-name <pattern>` | folder build | Output name inside `--out` from `[name]` and `[dialect]` (default `[name].[dialect].html`). |
| `--no-verify` | folder build | Skip the equivalence check. |
| `--base-url <url>` | folder build, dev | Where images are hosted; a build copies them to `<out>/assets`. |
| `--port <n>`, `--host <h>` | dev | Default `localhost:3100`. |

### Folder builds

An emails folder holds one email per subfolder (`index.jsx` / `index.tsx` for React, `App.vue` for
Vue) or per file (`welcome.jsx`, `digest.vue`). Each entry default-exports its component. Every
`*.json` in an email's folder, or `<name>.json` / `<name>.*.json` beside a single file, is a data set.

`tddr build emails` builds every email that declares `export const template = ["handlebars", "liquid"]`,
once per dialect. For each data set it fills the template with the real engine and compares the
result with the component rendered as HTML; a difference fails the build (E016). Local images are
inlined only when every target shows `data:` images (not with the default targets), otherwise hosted
under `--base-url`, otherwise E015. Plain (non-template) emails are listed as skipped.

### Dev server

`tddr dev [dir]` (default `./emails`) shows each email's source next to its compiled output, side by
side or as a difference overlay, at 600, 375 or any width. Data sets can be edited live and saved;
diagnostics link into the source and the compiled page; the size is shown against Gmail's clip
limit; pages reload on save. A Vite config in the working directory is used when there is one;
otherwise the Vue and Tailwind Vite plugins are added when installed.

## Authoring with React and Vue

Components render a body fragment; td;dr owns the document shell. The email's CSS is whatever its
module graph imports: plain CSS, SFC `<style scoped>`, Tailwind through its Vite plugin.

```jsx
import "./styles.css";
export const template = ["handlebars", "liquid"]; // omit for a plain email
export const lang = "en";

export default function Receipt({ customer, order }) {
  return (
    <div className="card">
      <h1>Thanks, {customer.firstName}.</h1>
      {order.paid ? <p>Paid in full.</p> : <p>Payment due {order.dueDate}.</p>}
      {order.items.map((item) => (
        <p key={item.sku}>{item.name}: {item.price}</p>
      ))}
    </div>
  );
}
```

In a template render the props are symbolic: printing one writes a field, `.map` writes a loop, and
`?:`, `&&`, `||`, `!`, comparisons, early returns and `switch` write conditional blocks. Vue
templates use `v-if` / `v-else-if` / `v-else` / `v-for` the same way. `tddr/react` and `tddr/vue`
also export `If`, `ElseIf`, `Else` and `Each` components and `render(Component, props)` for plain
HTML. `tddr/vite` exposes the Vite plugin and the programmatic API (`buildEmails`, `renderEmail`,
`createEmailServer`, `findEmails`).

## What it supports

- **Layout:** block flow with margin collapsing; centred `max-width` containers; flex rows and
  columns (px, %, `calc(P% ± Npx)`, grow and content-sized items, `gap`, `justify-content`,
  `align-items`, equal-height cards, `order`); `flex-wrap` as fluid-hybrid columns that stack on
  phones without media queries; simple grids (px / fr / % tracks); `display: table` / `table-cell`.
- **Boxes:** padding, borders, per-corner radius, background colours, images and gradients (VML
  images for Outlook), `min-height` with vertical distribution, a few `overflow: hidden` shapes.
- **Content:** text passes through with inlined styles; fluid, fixed and floated images,
  `<picture>`; bulletproof buttons; links around cards moved onto their text and images; lists and
  dividers; static `::before` / `::after` text.
- **CSS:** the full cascade with `@layer`, nesting, `var()`, `@property`, static `@supports`,
  logical properties and `dir`; `calc()`, `clamp()` and `vw` resolved at the design width; modern
  colours lowered to hex / rgba.
- **Progressive head styles:** author `@media` width rules, `prefers-color-scheme: dark` and
  `:hover` become generated classes with `!important` rules; web fonts are kept for clients that
  load them, with a fallback for Outlook.
- **Lint:** client support per target from caniemail data, accessibility checks (link names,
  contrast, headings, alt text, language), forced dark-mode risks, Gmail's clip size.
- **ESP templates:** Handlebars and Liquid output from hints, `<tddr-*>` elements or native
  component code, checked against the HTML render with the real engines.

Details and every diagnostic code: [docs/support.md](docs/support.md).

## Limitations

- Visual checks run in Chromium only. Outlook, Gmail and the other clients are checked by hand; the
  docs mark which client behaviours are unverified.
- Content-sized columns can't be measured (the client picks the font), and fluid-hybrid rows can
  stack at a different width than the browser does. Both are reported as W003.
- Errors, by design: positioning, transforms, animations, floats other than on images, negative
  margins (except a full-bleed child), `%` padding, grid areas and spans, inline SVG (unless
  allowed), media and form elements.
- Folder builds write ESP templates only; plain emails can't be built from a folder yet.
- Two template dialects: Handlebars (with `equals` / `notEquals` helpers) and Liquid.

## Development

```sh
pnpm install
pnpm check          # typecheck, unit tests and golden fixtures
pnpm test:visual    # Chromium renders of input and output at 600 and 375 px, pixel diff
pnpm build          # ESM bundles and type declarations in dist/
pnpm smoke          # pack, install the tarball in a scratch project, use it with and without peers
pnpm gallery        # static page of every compiled fixture, for test sends to real clients
pnpm caniemail      # refresh the vendored caniemail data
```

### Packaging

The tarball holds `dist/` (bundles, `dist/types` declarations for every export, `dist/ui` for the
dev server), `NOTICE`, `README.md` and `package.json`. `tddr/react`, `tddr/vue` and `tddr/vite`
types import their framework's types: `@types/react` for React, `@types/node` for Vite, and Vue's
declarations need the `DOM` lib. `pnpm smoke` installs offline from the pnpm store when its metadata
cache allows, otherwise it fetches only metadata (`--prefer-offline`).

## Documentation

- [Support and limits](docs/support.md): HTML and CSS support, layout, head styles and dark mode, images, fonts, the email shell, Outlook and MSO, size limits, every diagnostic code.
- [Templates](docs/templates.md): ESP templates, native authoring, dialects, condition semantics, the equivalence check.
- [Architecture](docs/architecture.md): pipeline, stage contracts, the Layout IR, design decisions, verification.

## License

See `NOTICE`. Contains data from caniemail.com (MIT License).

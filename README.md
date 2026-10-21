<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.png">
    <img src="docs/assets/logo.png" alt="td;dr" width="420">
  </picture>
</h1>

**too divvy; didn't render** — a compiler from ordinary HTML and CSS to email-safe HTML.

Write markup as for a browser (flex, grid, gap, `max-width`, `var()`, `@layer`, `@media`, or the
server-rendered output of React and Vue components). td;dr turns it into nested tables, inline
styles, Outlook conditional (MSO) markup and VML, plus a small head `<style>` for clients that read
one. Anything it can't lower faithfully is a diagnostic with a source location and a hint, never
dropped silently. The package, binary and import name is `tddr`.

## Install

Node.js 22 or later and pnpm. td;dr isn't published to a registry; build and pack it, then add the
tarball:

```sh
pnpm install && pnpm build && pnpm pack   # writes tddr-0.0.0.tgz
cd ../your-project && pnpm add ../td-dr/tddr-0.0.0.tgz
```

Optional peers, only for what you use: `vite` (`tddr dev`, folder builds, `tddr/vite`), `react` and
`react-dom` (`tddr/react`), `vue` (`tddr/vue`), `handlebars` and `liquidjs` (the template
equivalence check and engine-filled previews).

## Compile

```ts
import { compile } from "tddr";

const { html, diagnostics } = compile(source, { targets: ["gmail", "outlook-2019"] });
for (const d of diagnostics) console.log(d.severity, d.code, d.message, d.loc);
```

`source` is a full document or a body fragment.

| Option | Default | Meaning |
|---|---|---|
| `css` | `[]` | Extra stylesheets, applied after the document's `<style>` blocks. |
| `targets` | `["broad"]` | Client presets for support lint: `broad`, `gmail`, `outlook-2019`, `outlook-com`, `outlook-new`, `outlook-mobile`, `apple-mail`, `yahoo`, `samsung`. |
| `width` | from the email | Design width in px; without it, the root container's px width, else 600 ([details](docs/support.md#design-width)). |
| `strict` | `true` | Unsupported input is an error; `false` makes it a warning and keeps the input as written. |
| `allowSvg` | `false` | Keep inline `<svg>` with W010 instead of E008. |
| `lang` | from the source | Language when there is no `<html lang>`; else `en` with I009. |
| `template` | none | `"handlebars"` or `"liquid"`: write fields and blocks for an ESP ([templates](docs/templates.md)). |
| `trace` | `false` | Also return which input element each output tag came from. |

A diagnostic is `{ code, severity, message, hint?, loc?: { line, col, file? }, locs? }`: `E…` errors,
`W…` warnings, `I…` notes ([all codes](docs/support.md#diagnostic-codes)). One said the same way at
several places comes once, as "… (N places)" at the first, with every place in `locs`. The package also exports
`preview(html, props)`, `field(path)` and `writeString(text, dialect)` for templates, and
`toText(html)`, which turns a compiled email into its plain-text part ([how](docs/support.md#plain-text-part)).

## Command line

```sh
tddr build email.html -o out.html --targets gmail,outlook-2019 --width 640 --lang de
tddr build emails --base-url https://cdn.example.com/emails   # every template email in a folder
tddr dev emails                                                # preview server, localhost:3100
```

| Flag | Meaning |
|---|---|
| `-o, --out <path>` | Output file; for a folder, the output folder (default `dist/emails`). Without it a file build writes to stdout. |
| `--targets`, `--width`, `--lang` | As the options above. |
| `--css <file>` | Extra stylesheet (file builds, repeatable). |
| `--allow-unsupported`, `--allow-svg` | `strict: false`, `allowSvg: true`. |
| `--format text\|json\|sarif` | How diagnostics are said (default `text`). |
| `--file-name <pattern>` | Folder builds: output name from `[name]` and `[dialect]` (default `[name].[dialect].html`). |
| `--no-verify` | Folder builds: skip the equivalence check. |
| `--base-url <url>` | Folder builds and dev: where images are hosted; a build copies them to `<out>/assets`. |
| `--port <n>`, `--host <h>` | Dev server address. |

A file build prints each diagnostic to stderr as `file:line:col: severity CODE: message`, then
`  hint: …`. A folder build adds the dialect after the place, and says a Vue email's diagnostic on
an element at that element's `.vue` line; any other is said at the email's file, as its line is in
the rendered page, not the component. The exit code is 1 when an error is reported (the output is
still written, empty after E018, bar a folder build's template that fails its equivalence check or
loses a field: E016, E012, E013) and 2 for usage errors.

`--format json` prints the diagnostics to stdout instead, as a list of
`{ file, line?, column?, code, severity, message, hint?, count, places, dialect? }`, and
`--format sarif` as a SARIF 2.1.0 log for code scanning; anything else the build says moves to
stderr, so a file build needs `-o`.

**Folder builds.** An emails folder holds one email per subfolder (`index.jsx` / `index.tsx`,
`App.vue`) or per file (`welcome.jsx`, `digest.vue`), each default-exporting its component. Every
`*.json` in an email's folder, or `<name>.json` / `<name>.*.json` beside a single file, is a data
set. `tddr build emails` builds every email that declares
`export const template = ["handlebars", "liquid"]`, once per dialect, and fills each data set with
the real engine to compare against the HTML render (E016 on a difference). Local images are hosted
under `--base-url` (E015 without one) unless every target shows `data:` images. Plain emails are
skipped.

**Dev server.** `tddr dev [dir]` (default `./emails`) shows source and compiled output side by side
or as a difference overlay at any width, with editable data sets, diagnostics linked into both
panes, the size against Gmail's clip and reload on save. It uses the project's Vite config when
there is one; without one it adds the Vue and Tailwind Vite plugins when they are installed. A `.vue`
email no Vue plugin compiled fails with a message saying so.

## React and Vue

Components render a body fragment; td;dr owns the document. The email's CSS is whatever its module
graph imports (plain CSS, `<style scoped>`, Tailwind through its Vite plugin).

```jsx
import "./styles.css";
export const template = ["handlebars", "liquid"]; // omit for a plain email
export const lang = "en";

export default function Receipt({ customer, order }) {
  return (
    <div className="card">
      <h1>Thanks, {customer.firstName}.</h1>
      {order.paid ? <p>Paid in full.</p> : <p>Payment due {order.dueDate}.</p>}
      {order.items.map((item) => <p key={item.sku}>{item.name}: {item.price}</p>)}
    </div>
  );
}
```

In a template render props are symbolic: printing one writes a field, `.map` a loop, and `?:`,
`&&`, `||`, `!`, comparisons, early returns and `switch` write conditional blocks; Vue's `v-if` /
`v-for` work the same way. `tddr/react` and `tddr/vue` also export `If`, `ElseIf`, `Else`, `Each`
and `render(Component, props)`; `tddr/vite` exports the Vite plugin and `buildEmails`,
`renderEmail`, `createEmailServer`, `findEmails`.

## Support and limits

- **Layout:** block flow with margin collapsing, centred `max-width` containers, flex rows and
  columns (px, %, `calc(P% ± Npx)`, grow and content-sized items, `gap`, alignment, equal-height
  cards, `order`), `flex-wrap` as fluid-hybrid columns that stack without media queries, simple
  grids, `display: table`.
- **Boxes and content:** padding, borders, radii, background colours, images and gradients (VML in
  Outlook), bulletproof buttons, fluid and floated images, links around cards, lists, dividers.
- **CSS:** the full cascade with `@layer`, nesting, `var()`, `@supports`, logical properties;
  `calc()`, `clamp()` and `vw` resolved at the design width; modern colours lowered.
- **Head styles:** `@media` width rules, `prefers-color-scheme: dark` and `:hover` become
  `!important` class rules; web fonts stay, with an Outlook fallback.
- **ESP templates:** Handlebars and Liquid output from the same React or Vue components, checked
  against their data sets with the real engines ([templates](docs/templates.md)).
- **Lint:** client support per target from caniemail data, accessibility, dark-mode risks, Gmail's
  102,000-byte clip and 16 KB head-style limit.
- **Refused by design:** positioning, transforms, animations, floats other than on images, negative
  margins (except full-bleed bands), `%` padding, grid areas and spans, inline SVG (unless allowed),
  media and form elements.
- **Limits:** visual checks run in Chromium, Firefox and WebKit, real clients are checked by hand;
  content-sized columns and fluid line breaks are approximations (W003); folder builds write ESP
  templates only.

## Development

`pnpm check` typechecks and runs the unit tests and golden fixtures; `pnpm test:visual`, `pnpm build`
and `pnpm smoke` are described with the other commands in
[architecture.md](docs/architecture.md#verification).

The tarball holds `dist/`, `NOTICE`, `README.md` and `package.json`. The `tddr/react`, `tddr/vue`
and `tddr/vite` types import their framework's types (`@types/react`, Vue with the `DOM` lib,
`@types/node`).

## Documentation

- [Support and limits](docs/support.md): layout, CSS, head styles, images and fonts, the email
  shell, Outlook and MSO, size limits, client data, every diagnostic code.
- [Templates](docs/templates.md): authoring, dialects, condition semantics, the equivalence check.
- [Architecture](docs/architecture.md): pipeline, IR phases, modules, design decisions,
  verification.

## License

See `NOTICE`. Contains data from caniemail.com (MIT License).

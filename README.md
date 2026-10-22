<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.png">
    <img src="docs/assets/logo.png" alt="td;dr" width="420">
  </picture>
</h1>

**too divvy; didn't render** — write an email like a web page, send HTML that email clients render.

- **You write** ordinary HTML and CSS: flex, grid, `gap`, `max-width`, `var()`, `@media`, or React
  and Vue components.
- **You get** the HTML email clients need: nested tables, inline styles, Outlook-only markup, and a
  small `<style>` for the clients that read one.
- **When something can't be converted faithfully**, you get a diagnostic with the line, the reason
  and a hint. Nothing is dropped silently.

## Quick start

Node.js 22.18 or later.

```sh
npm install @krzys_s/tddr
```

Write `email.html` the way you would for a browser:

```html
<style>
  .row { display: flex; gap: 16px; max-width: 600px; margin: 0 auto; }
  .col { flex: 1; padding: 16px; background: #f4f4f5; border-radius: 8px; }
</style>
<div class="row">
  <div class="col">Fast</div>
  <div class="col">Safe</div>
</div>
```

Compile it:

```sh
npx @krzys_s/tddr build email.html -o out.html
```

```
email.html:6:3: warning W005: border-radius isn't supported in Outlook Windows; partly in Yahoo! Mail … (2 places)
  hint: Round corners can be used in VML with the `RoundRect` element. …
email.html: info I009: Language defaulted to English
  hint: Screen readers pick a voice from lang. Set <html lang>, the lang option (--lang), …
```

`out.html` is a complete email document. The flex row became a table, with the styles inline:

```html
<table role="presentation" width="100%" … style="width:100%;max-width:600px;margin:0 auto;border-collapse:separate;">
<tr>
<td width="292" valign="top" bgcolor="#f4f4f5" style="width:48.67%;background-color:#f4f4f5;border-radius:8px;">
  … Fast …
</td>
…
```

## Pick how you use it

| You have | Use | Section |
|---|---|---|
| An HTML file | `tddr build email.html` | [Command line](#command-line) |
| HTML in your own code | `compile(html)` | [From code](#from-code) |
| React or Vue components | an `emails/` folder, `tddr dev`, `tddr build emails` | [React and Vue](#react-and-vue) |
| Handlebars or Liquid templates for an email service | the same components, with `export const template` | [Templates for an email service](#templates-for-an-email-service) |

Install only the extras you use:

| For | Also install |
|---|---|
| `tddr dev`, folder builds, `@krzys_s/tddr/vite` | `vite` |
| React components (`@krzys_s/tddr/react`) | `react`, `react-dom` |
| Vue components (`@krzys_s/tddr/vue`) | `vue` |
| Checking Handlebars or Liquid output, previews filled by the real engine | `handlebars`, `liquidjs` |

## Command line

The package installs a `tddr` command. Run it from a `package.json` script, or as `npx tddr` in a
project that has the package installed; elsewhere, use `npx @krzys_s/tddr`, since `npx tddr` would
look for a different package named `tddr`.

```sh
tddr build email.html -o out.html          # compile one file
tddr build email.html -o out.html --watch  # …and again on every save
tddr check email.html                      # report diagnostics, write nothing
tddr dev emails                            # preview server at localhost:3100
tddr build emails                          # every template email in a folder
```

Common flags:

| Flag | Meaning |
|---|---|
| `-o, --out <path>` | Output file (or folder). Without it, a file build prints to stdout. |
| `--targets gmail,outlook-2019` | Which clients to check support for (default `broad`, [all presets](#options)). |
| `--width <px>` | Design width (default: the root container's px width, else 600). |
| `--text` | Also write the plain-text part, `<name>.txt`. |
| `--format json\|sarif` | Machine-readable diagnostics, for CI and code scanning. |
| `--max-warnings <n>` | `tddr check`: fail on more than `n` warnings. |

The exit code is 1 when an error is reported and 2 for a usage error. Every flag, the output formats
and what each command writes are in the [command-line reference](docs/cli.md).

Defaults for `targets`, `width` and `baseUrl` can go in `tddr.config.ts` in the directory you run
from; a flag wins over it:

```ts
import { defineConfig } from "@krzys_s/tddr";

export default defineConfig({ targets: ["gmail", "outlook-2019"], width: 640, baseUrl: "https://cdn.example.com/emails" });
```

## From code

```ts
import { compile } from "@krzys_s/tddr";

const { html, diagnostics } = compile(source, { targets: ["gmail", "outlook-2019"] });
for (const d of diagnostics) console.log(d.severity, d.code, d.message, d.loc);
```

`source` is a full document or just the body's content.

### Options

| Option | Default | Meaning |
|---|---|---|
| `targets` | `["broad"]` | Clients to check support for: `broad`, `gmail`, `outlook-2019`, `outlook-com`, `outlook-new`, `outlook-mobile`, `apple-mail`, `yahoo`, `samsung`. |
| `width` | from the email | Design width in px: the root container's px width, else 600 ([details](docs/support.md#design-width)). |
| `css` | `[]` | Extra stylesheets, applied after the document's own `<style>` blocks. |
| `strict` | `true` | Unsupported input is an error. `false` makes it a warning and keeps the input as written. |
| `allowSvg` | `false` | Keep inline `<svg>` (warning W010) instead of refusing it (error E008). |
| `lang` | from the source | Language when there is no `<html lang>`; else `en`, with a note (I009). |
| `template` | none | `"handlebars"` or `"liquid"`: write template fields and blocks ([templates](docs/templates.md)). |
| `trace` | `false` | Also return which input element each output tag came from. |

### Diagnostics

Each diagnostic is `{ code, severity, message, hint?, loc?: { line, col, file? }, locs? }`. Codes
starting with `E` are errors, `W` warnings, `I` notes ([every code](docs/support.md#diagnostic-codes)).
The same problem in several places is reported once, as "… (N places)", with every place in `locs`.

### Other exports

- `toText(html, { template })` turns a compiled email into its plain-text part
  ([how](docs/support.md#plain-text-part)).
- `preview(html, props)`, `field(path)` and `writeString(text, dialect)` help with templates.

## React and Vue

A component renders the email's body; td;dr writes the rest of the document. The CSS is whatever the
component imports: plain CSS, `<style scoped>`, or Tailwind through its Vite plugin.

```jsx
// emails/receipt.jsx
import "./styles.css";
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

An `emails/` folder holds one email per file (`receipt.jsx`, `digest.vue`) or per subfolder
(`index.jsx`, `index.tsx`, `App.vue`). Sample data goes in `receipt.json` (or `receipt.*.json` for
several sets) beside a file, or in any `*.json` in an email's subfolder.

**Preview.** `tddr dev` (default folder `./emails`) shows the source and the compiled email side by
side, or one over the other as a difference, at any width. It has editable sample data, diagnostics
that point into both panes, the size against Gmail's clip, and reload on save. *Simulate* shows the
email as a stricter client would: without `<style>`, without `@media`, with images off, or in an
approximate forced dark mode. It uses your project's Vite config if there is one; otherwise it adds
the Vue and Tailwind Vite plugins when they are installed.

**In your own code**, `@krzys_s/tddr/react` and `@krzys_s/tddr/vue` export `render(Component, props)`,
and `@krzys_s/tddr/vite` exports `renderEmail` (the compiled `html` and its plain-text `text`),
`buildEmails`, `createEmailServer`, `findEmails` and the Vite plugin.

## Templates for an email service

To send through a service that fills in fields itself (Handlebars or Liquid), add one line to the
component:

```jsx
export const template = ["handlebars", "liquid"];
```

Now the props are placeholders instead of values: printing `{customer.firstName}` writes a field,
`.map` writes a loop, and `?:`, `&&`, `||`, `!`, comparisons, early returns and `switch` write
conditional blocks. Vue's `v-if` and `v-for` work the same way. For anything plain code can't
express, `@krzys_s/tddr/react` and `@krzys_s/tddr/vue` also export `If`, `ElseIf`, `Else` and `Each`.

`tddr build emails` writes each such email once per template language, `receipt.handlebars.html`
and `receipt.liquid.html`. Then it fills every sample data set with the real Handlebars and Liquid
engines and checks the result matches the component's own render (error E016 if not). Local images
need `--base-url`, where they will be hosted (E015 without it); the build copies them to `<out>/assets`.
Emails without `export const template` are skipped by folder builds.

The full rules are in [Templates](docs/templates.md).

## What it supports

- **Layout:** normal block flow (with margin collapsing), centred `max-width` containers, flex rows
  and columns (px, %, `calc(P% ± Npx)`, grow, `gap`, alignment, equal-height cards, `order`),
  `flex-wrap` as columns that stack on small screens without media queries, simple grids,
  `display: table`.
- **Boxes and content:** padding, borders, rounded corners, background colours, images and
  gradients (also in Outlook), bulletproof buttons, fluid and floated images, linked cards, lists,
  dividers.
- **CSS:** the full cascade with `@layer`, nesting, `var()`, `@supports` and logical properties.
  `calc()`, `clamp()` and `vw` are worked out at the design width; modern colour syntax is converted.
- **Responsive and dark mode:** `@media` width rules, `prefers-color-scheme: dark` and `:hover` go
  into the head `<style>`; web fonts stay, with a fallback for Outlook.
- **Checks:** client support per target (from caniemail.com data), accessibility, dark-mode risks,
  Gmail's 102,000-byte clip and its 16 KB limit on head styles.
- **Refused on purpose**, because email clients can't do them reliably: positioning, transforms,
  animations, floats (except on images), negative margins (except full-width bands), `%` padding,
  grid areas and spans, inline SVG (unless allowed), video, audio and forms.
- **Approximate:** columns sized by their content and line breaks in fluid layouts (warning W003).

Every detail, client by client, is in [Support and limits](docs/support.md).

## Status

td;dr is at 0.x: options, diagnostics and output may change between minor versions (see
[CHANGELOG.md](CHANGELOG.md)). Output is checked by golden tests and rendered in Chromium, Firefox
and WebKit; real email clients are checked by hand. Behaviour not yet confirmed in a real client is
marked **unverified** in [Support and limits](docs/support.md), Outlook's Word engine included.

## Documentation

- [Command line](docs/cli.md): every command and flag, output formats, exit codes.
- [Support and limits](docs/support.md): layout, CSS, head styles, images and fonts, Outlook,
  size limits, client data, every diagnostic code.
- [Templates](docs/templates.md): writing template emails, Handlebars and Liquid, how conditions
  translate, the equivalence check.
- [Architecture](docs/architecture.md): how the compiler works inside, and how it is tested.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security issues: [SECURITY.md](SECURITY.md).

## License

MIT, see [LICENSE](LICENSE). Contains data from caniemail.com (MIT License), see [NOTICE](NOTICE).

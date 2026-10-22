# Command line

```sh
tddr build email.html -o out.html --targets gmail,outlook-2019 --width 640 --lang de
tddr build emails --base-url https://cdn.example.com/emails   # every template email in a folder
tddr check emails --max-warnings 0                             # the same diagnostics, nothing written
tddr dev emails                                                # preview server, localhost:3100
```

## Flags

| Flag | Meaning |
|---|---|
| `-o, --out <path>` | Output file; for a folder, the output folder (default `dist/emails`). Without it a file build writes to stdout. |
| `--targets`, `--width`, `--lang` | The `targets`, `width` and `lang` [options](../README.md#options). |
| `--css <file>` | Extra stylesheet (file builds, repeatable). |
| `--allow-unsupported`, `--allow-svg` | `strict: false`, `allowSvg: true`. |
| `--format text\|json\|sarif` | How diagnostics are printed (default `text`). |
| `--text` | Also write the [plain-text part](support.md#plain-text-part), `<name>.txt` next to each HTML file (file builds need `-o`). |
| `--file-name <pattern>` | Folder builds: output name from `[name]` and `[dialect]` (default `[name].[dialect].html`). |
| `--no-verify` | Folder builds: skip the [equivalence check](templates.md#the-equivalence-check). |
| `--base-url <url>` | Folder builds and dev: where images are hosted; a build copies them to `<out>/assets`. |
| `--port <n>`, `--host <h>` | Dev server address. |
| `--max-warnings <n>` | `tddr check`: also exit 1 on more than `n` warnings. |
| `--watch` | File builds (with `-o`) and checks: build again whenever the file or a `--css` file changes. |

## Output and exit codes

A file build prints each diagnostic to stderr as `file:line:col: severity CODE: message`, then
`  hint: …`. A folder build adds the dialect after the place. A Vue email's diagnostic on an element
points at that element's line in the `.vue` file; any other points at the email's file, with the
line in the rendered page, not the component.

The exit code is 1 when an error is reported and 2 for a usage error. The output is still written
after an error, except:

- after E018 it is empty;
- in a folder build, a template that fails its equivalence check or loses a field (E016, E012,
  E013) is not written.

## JSON and SARIF

`--format json` prints the diagnostics to stdout instead, as a list of
`{ file, line?, column?, code, severity, message, hint?, count, places, dialect? }`.
`--format sarif` prints a SARIF 2.1.0 log for code scanning. Anything else the build prints moves to
stderr, so a file build needs `-o`. A folder's email that wrote nothing is listed too, as an E019 at
its file.

## Check and watch

`tddr check <file|dir>` builds as `tddr build` does, with the same flags except `-o`, `--text` and
`--file-name`, and prints the same diagnostics, but writes nothing; `--format json|sarif` goes to
stdout.

With `--watch` a file build or check keeps running. After each build it prints the diagnostics and a
line like `built out.html: 0 errors, 2 warnings`, then waits for the next change, even after an
error. For a folder, use `tddr dev`.

## Folder builds

An emails folder holds one email per subfolder (`index.jsx` / `index.tsx`, `App.vue`) or per file
(`welcome.jsx`, `digest.vue`), each default-exporting its component. Every `*.json` in an email's
subfolder, or `<name>.json` / `<name>.*.json` beside a single file, is a data set.

`tddr build emails` builds every email that declares `export const template = ["handlebars", "liquid"]`,
once per dialect. It fills each data set with the real engine and compares the result with the
component's own render (E016 on a difference). Local images are hosted under `--base-url` (E015
without one) unless every target shows `data:` images. Emails without `export const template` are
skipped.

## Dev server

`tddr dev [dir]` (default `./emails`) shows the source and the compiled output side by side, or one
over the other as a difference, at any width. It has editable data sets, diagnostics linked into both
panes, the size against Gmail's clip, and reload on save.

*Simulate* shows the compiled frame as a stricter client would: without `<style>`, without `@media`,
with images off, or in an approximate forced dark mode. The code, size and Copy stay the real output.

It uses the project's Vite config when there is one; without one it adds the Vue and Tailwind Vite
plugins when they are installed. A `.vue` email that no Vue plugin compiled fails with a message
saying so.

## Config

`tddr build`, `check` and `dev` read `tddr.config.ts` (or `.mts`, `.js`, `.mjs`) from the current
directory, not the input's folder. It sets `targets` and `width` for builds and `baseUrl` for folder
builds and dev; a flag wins over it. Node (22.18 or later) loads a `.ts` config itself, stripping its
types, so it can use only erasable TypeScript.

```ts
import { defineConfig } from "@krzys_s/tddr";

export default defineConfig({ targets: ["gmail", "outlook-2019"], width: 640, baseUrl: "https://cdn.example.com/emails" });
```

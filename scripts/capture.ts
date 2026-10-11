// Renders the example emails through the same Vite SSR + CSS collection the dev server uses and
// writes each source page as a td;dr input fixture. Run: pnpm capture
import { createElement, type ComponentType } from "react";
import { renderToString } from "react-dom/server";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createEmailServer, findEmails, renderEmail, type EmailEntry } from "../adapters/vite/index.ts";
import { loadEmail, sourcePage } from "../adapters/vite/render.ts";

const root = resolve(import.meta.dirname, "..");
const examples = join(root, "examples");

type Status = "active" | "draft";

const intent = (lines: string[], status: Status) =>
  [
    "---",
    "feature: frameworks",
    "viewports: [600, 375]",
    "maxDiffRatio: 0.002",
    "expect: compile",
    "codes: []",
    `status: ${status}`,
    "---",
    ...lines,
    "",
  ].join("\n");

function write(name: string, source: string, lines: string[], status: Status = "active") {
  const dir = join(root, "test/fixtures/frameworks", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "input.html"), source);
  // intent.md gets tuned by hand (tolerances, status), so only the first capture writes it
  const intentFile = join(dir, "intent.md");
  if (!existsSync(intentFile)) writeFileSync(intentFile, intent(lines, status));
  console.log(`captured ${name}`);
}

const vite = await createEmailServer({ root: examples });
const emails = new Map(findEmails(examples).map((e) => [e.name, e]));

const email = (name: string): EmailEntry => {
  const e = emails.get(name);
  if (!e) throw new Error(`examples/${name} is not an email`);
  return e;
};
const props = (e: EmailEntry) => JSON.parse(readFileSync(e.data.find((d) => d.name === "props")!.file, "utf8"));
const source = async (name: string) => (await renderEmail(vite, email(name), { data: props(email(name)), mode: "html" })).source;

async function captureVue() {
  write("vue-digest", await source("vue-digest"), [
    "Weekly team digest as real Vue 3 SFCs rendered with renderToString: header, KPI tiles, task list by status, avatars, top contributor, footer.",
    "Uses script setup (JS and TS), defineProps, computed, v-for, v-if/v-else, :class and :style bindings, v-bind object spread, a default slot and scoped styles.",
    "Keeps SSR markers (comment fragments, data-v-*) for td;dr to strip itself. CSS uses :root custom properties, rem/em, nested flex, gap, max-width container.",
  ]);
}

async function captureReact() {
  const name = "react-itinerary";
  const lines = (variant: string) => [
    `Flight itinerary email as React 19 components rendered with ${variant}: header, two flight segments, passengers, price breakdown, upgrade banner, CTA, footer.`,
    "Uses props mapping, reduce and Intl.NumberFormat(en-GB, GBP) for money, conditional rendering, children composition, inline style objects and a plain styles.css import.",
    "CSS uses :root custom properties, rem/em, nested flex rows in columns, gap, pill chips with radius, letter-spacing, text-transform, an inline-block link styled as a button.",
  ];
  const stat = await source(name);
  write(name, stat, lines("renderToStaticMarkup"));
  // the adapter only does static markup; hydration markers need renderToString on the same module
  const { component, css } = await loadEmail(vite, email(name));
  const str = sourcePage(css, renderToString(createElement(component as ComponentType, props(email(name)))));
  if (str !== stat) {
    write(`${name}-hydrate`, str, [
      ...lines("renderToString").slice(0, 1),
      "Same email as react-itinerary but with renderToString, so text nodes are separated by <!-- --> hydration markers td;dr must strip.",
      ...lines("renderToString").slice(1),
    ]);
  }
}

async function captureVueModern() {
  write(
    "vue-modern-css",
    await source("vue-modern-css"),
    [
      "Garden club newsletter as Vue 3 SFCs rendered with renderToString: masthead, featured story, three story cards, upcoming events with date badges, sign-off.",
      "Scoped styles use CSS nesting (& .title, &:hover, &.featured, bare nested selectors), @layer order statement and blocks, oklch() colours, color-mix(in oklch), custom properties redefined per component, and calc(var(--space) * n) spacing.",
      "Keeps SSR markers (comment fragments, data-v-*). Vue's scoped compiler keeps the nesting and splits each parent into &[data-v-*] plus nested children, so td;dr sees nested rules, some inside @layer.",
      "Must stay true: 600px centred column; masthead brand and issue line on one row; story cards stack full width with even gaps; each event row keeps its date badge left of the text.",
    ],
    "draft",
  );
}

async function captureTailwind() {
  write(
    "react-tailwind-receipt",
    await source("react-tailwind-receipt"),
    [
      "Order receipt as React 19 components rendered with renderToStaticMarkup, styled only with Tailwind v4 utility classes: logo and nav row, headline, line items, totals box, CTA button, two-column addresses, footer.",
      "CSS is what @tailwindcss/vite builds for the classes in the components (`source(\".\")` keeps the scan to this email): @layer theme/base/utilities, preflight, @property fallbacks under @supports, theme variables in oklch, color-mix() for opacity modifiers.",
      "Uses arbitrary values (max-w-[600px]), opacity modifiers (bg-indigo-600/10, text-slate-900/70), line-height shorthands (text-base/7, text-sm/6), tracking-*, font-semibold, border-b, gap-*, flex and grid-cols-2.",
      "Must stay true: 600px white card centred on grey; logo left and nav right on one row; qty and price columns right-aligned and lined up across rows; totals box tinted with rounded corners; CTA is a centred indigo button; ship-to and bill-to side by side.",
    ],
    "draft",
  );
}

try {
  await captureVue();
  await captureReact();
  await captureVueModern();
  await captureTailwind();
} finally {
  await vite.close();
}

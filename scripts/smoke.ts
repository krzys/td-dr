// Builds and packs tddr, installs the tarball into a scratch project and uses it the way a user
// would: first with no optional peers, then with them. Run: pnpm smoke (KEEP=1 keeps the project)
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const WORK = mkdtempSync(join(tmpdir(), "tddr-smoke-"));
const APP = join(WORK, "app");
const TSC = join(ROOT, "node_modules/typescript/bin/tsc");

// the versions the repo tests against (the installed devDependencies)
const versionOf = (name: string): string => (JSON.parse(readFileSync(join(ROOT, "node_modules", name, "package.json"), "utf8")) as { version: string }).version;
const PEERS = ["react", "react-dom", "vue", "vite", "handlebars", "liquidjs"];
// what a TypeScript user of the adapters also has: React's types, and Node's for Vite's
const PEER_TYPES = ["@types/react", "@types/node"];

type Run = { status: number | null; out: string };
const run = (cmd: string, args: string[], cwd = APP): Run => {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });
  return { status: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}${r.error ? String(r.error) : ""}` };
};
const must = (cmd: string, args: string[], cwd = APP): string => {
  const r = run(cmd, args, cwd);
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} exited ${r.status}\n${r.out.trim()}`);
  return r.out;
};
const assert: (ok: unknown, msg: string) => asserts ok = (ok, msg) => {
  if (!ok) throw new Error(msg);
};
const write = (file: string, text: string): void => {
  mkdirSync(dirname(join(APP, file)), { recursive: true });
  writeFileSync(join(APP, file), text);
};
const node = (file: string): string => must(process.execPath, [file]);
const tddr = join(APP, "node_modules/.bin/tddr");

const results: Array<{ name: string; error?: string }> = [];
const notes: string[] = [];
const check = async (name: string, fn: () => unknown): Promise<boolean> => {
  try {
    await fn();
    results.push({ name });
    console.log(`PASS ${name}`);
    return true;
  } catch (e) {
    const error = (e as Error).message;
    results.push({ name, error });
    console.log(`FAIL ${name}\n  ${error.replaceAll("\n", "\n  ")}`);
    return false;
  }
};

// Offline from the local store when its metadata cache can resolve the ranges; a store filled from
// a lockfile has the tarballs but not that metadata, so fall back to fetching only the metadata.
const install = (specs: string[]): void => {
  const offline = run("pnpm", ["add", ...specs, "--offline"]);
  if (offline.status === 0) return void notes.push(`pnpm add ${specs.length} package(s): --offline`);
  if (!offline.out.includes("ERR_PNPM_NO_OFFLINE_META")) throw new Error(offline.out.trim());
  const out = must("pnpm", ["add", ...specs, "--prefer-offline"]);
  const fetched = [...out.matchAll(/downloaded (\d+)/g)].at(-1)?.[1] ?? "?";
  notes.push(`pnpm add ${specs.length} package(s): no offline metadata, used --prefer-offline (${fetched} tarballs downloaded)`);
};

const EMAIL = `<!doctype html>
<html lang="en"><head><style>
  .card { max-width: 600px; margin: 0 auto; padding: 24px; background: #ffffff; font-family: Arial, sans-serif; }
  .row { display: flex; gap: 16px; }
</style></head>
<body>
  <div class="card">
    <h1 style="color:#222222;font-size:24px">Your order</h1>
    <table role="presentation" width="100%"><tr><td style="padding:8px;color:#444444">Total</td><td align="right">$42.00</td></tr></table>
    <div class="row"><p style="margin:0">Left</p><p style="margin:0">Right</p></div>
    <a href="https://example.com/order" style="display:inline-block;padding:12px 20px;background:#0a66c2;color:#ffffff">View order</a>
  </div>
</body></html>
`;

const TSCONFIG = (files: string[], lib: string[], types: string[]) =>
  JSON.stringify({
    compilerOptions: { target: "ES2023", lib, module: "NodeNext", moduleResolution: "NodeNext", strict: true, skipLibCheck: false, noEmit: true, types },
    files,
  });

const REACT_EMAIL = `export const template = ["handlebars", "liquid"];
export const lang = "en";

export default function Welcome({ user }) {
  return (
    <div style={{ maxWidth: "600px", margin: "0 auto", fontFamily: "Arial, sans-serif" }}>
      <h1 style={{ color: "#222222" }}>Welcome, {user.name}.</h1>
      <p style={{ color: "#444444" }}>Your account is ready.</p>
    </div>
  );
}
`;

// `tddr dev` on a free port; resolves to its URL and a stop function
const startDev = (): Promise<{ url: string; stop: () => Promise<void> }> =>
  new Promise((done, fail) => {
    const child = spawn(tddr, ["dev", "emails", "--port", "0", "--host", "127.0.0.1"], { cwd: APP });
    let out = "";
    const stop = () =>
      new Promise<void>((ok) => {
        if (child.exitCode !== null) return ok();
        child.once("exit", () => ok());
        child.kill();
      });
    const timer = setTimeout(() => void stop().then(() => fail(new Error(`no URL after 30s:\n${out}`))), 30_000);
    const onData = (b: Buffer) => {
      out += b.toString();
      const url = /dev server: (http:\/\/\S+)/.exec(out)?.[1];
      if (url) {
        clearTimeout(timer);
        done({ url, stop });
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("exit", (code) => {
      clearTimeout(timer);
      fail(new Error(`exited ${code} before listening:\n${out}`));
    });
  });

const steps = async (): Promise<void> => {
  if (!(await check("build", () => must("pnpm", ["build"], ROOT)))) return;

  let tarball = "";
  const packed = await check("pack: tarball holds dist (with dist/ui), LICENSE, NOTICE, README and nothing else", () => {
    const pack = JSON.parse(must("pnpm", ["pack", "--pack-destination", WORK, "--json"], ROOT)) as { filename: string; files: Array<{ path: string }> };
    tarball = pack.filename;
    const paths = pack.files.map((f) => f.path);
    for (const p of ["LICENSE", "NOTICE", "README.md", "package.json", "dist/cli.js", "dist/ui/index.html", "dist/types/src/index.d.ts"])
      assert(paths.includes(p), `missing ${p}`);
    const stray = paths.filter((p) => !/^(dist\/|LICENSE$|NOTICE$|README\.md$|package\.json$)/.test(p));
    assert(stray.length === 0, `unexpected files: ${stray.join(", ")}`);
  });
  if (!packed) return;

  mkdirSync(APP);
  write("package.json", JSON.stringify({ name: "tddr-smoke", private: true, type: "module" }));
  if (!(await check("install the tarball without optional peers", () => install([tarball])))) return;

  await check("every exports target and the bin exist", () => {
    const dir = join(APP, "node_modules/tddr");
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { bin: Record<string, string>; exports: Record<string, Record<string, string>> };
    const targets = [...Object.values(pkg.bin), ...Object.values(pkg.exports).flatMap((e) => Object.values(e))];
    const missing = targets.filter((t) => !existsSync(join(dir, t)));
    assert(missing.length === 0, `missing: ${missing.join(", ")}`);
    for (const peer of PEERS) assert(!existsSync(join(APP, "node_modules", peer)), `optional peer ${peer} got installed`);
  });

  await check('import { compile } from "tddr" compiles an email without errors', () => {
    write("email.html", EMAIL);
    write(
      "compile.mjs",
      `import { readFileSync } from "node:fs";
import { compile } from "tddr";
const { html, diagnostics } = compile(readFileSync("email.html", "utf8"));
console.log(JSON.stringify({ html, errors: diagnostics.filter((d) => d.severity === "error") }));`,
    );
    const { html, errors } = JSON.parse(node("compile.mjs")) as { html: string; errors: unknown[] };
    assert(errors.length === 0, `error diagnostics: ${JSON.stringify(errors)}`);
    assert(html.includes('role="presentation"') && html.includes("<!--[if mso]>"), "no email tables or MSO markup in the output");
    assert(!html.includes("display:flex"), "flex was not lowered");
  });

  await check("tddr build in.html -o out.html (node_modules/.bin)", () => {
    must(tddr, ["build", "email.html", "-o", "out.html"]);
    assert(readFileSync(join(APP, "out.html"), "utf8").includes('role="presentation"'), "out.html has no email tables");
    assert(must(tddr, ["--version"]).trim() === (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string }).version, "--version");
  });

  await check('types: "tddr" type-checks with skipLibCheck false, no DOM or Node types', () => {
    write(
      "core.ts",
      `import { compile, field, preview, writeString, type CompileOptions, type CompileResult, type Diagnostic, type DialectName } from "tddr";
const options: CompileOptions = { targets: ["gmail"], width: 600, template: "handlebars" };
const result: CompileResult = compile("<p>hi</p>", options);
const errors: Diagnostic[] = result.diagnostics.filter((d) => d.severity === "error");
const dialect: DialectName = "liquid";
export { errors, dialect, field, preview, writeString };`,
    );
    write("tsconfig.json", TSCONFIG(["core.ts"], ["ES2023"], []));
    must(process.execPath, [TSC, "-p", "."]);
  });

  // ERR_MODULE_NOT_FOUND names the package; anything vaguer would leave a user guessing
  const missingPeer: Array<[entry: string, peer: string]> = [
    ["tddr/react", "react"],
    ["tddr/vue", "vue"],
    ["tddr/vite", "vite"],
  ];
  for (const [entry, peer] of missingPeer)
    await check(`import "${entry}" without its peer fails naming "${peer}"`, () => {
      const r = run(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(entry)})`]);
      assert(r.status !== 0, "import succeeded");
      assert(r.out.includes(`Cannot find package '${peer}'`), `error does not name ${peer}:\n${r.out.trim()}`);
    });
  write("emails/welcome/index.jsx", REACT_EMAIL);
  write("emails/welcome/default.json", JSON.stringify({ user: { name: "Ada" } }));
  await check('tddr build <dir> without vite fails naming "vite"', () => {
    const r = run(tddr, ["build", "emails", "-o", "out"]);
    assert(r.status !== 0, "build succeeded");
    assert(r.out.includes("need vite in your project: pnpm add -D vite"), `error does not name vite:\n${r.out.trim()}`);
    assert(!r.out.includes("    at "), `error prints a stack trace:\n${r.out.trim()}`);
  });

  const peers = [...PEERS, ...PEER_TYPES].map((p) => `${p}@${versionOf(p)}`);
  if (!(await check(`install peers (${peers.join(" ")})`, () => install(peers)))) return;

  await check("types: all four entries type-check with skipLibCheck false", () => {
    write(
      "adapters.ts",
      `import * as core from "tddr";
import { Each, Else, ElseIf, If, render, renderTemplate } from "tddr/react";
import { render as renderVue, renderTemplate as renderVueTemplate } from "tddr/vue";
import { buildEmails, createEmailServer, findEmails, renderEmail, tddr, verifyEmail, type BuildOptions, type BuildResult, type EmailEntry } from "tddr/vite";
import type { Plugin } from "vite";
const plugins: Plugin[] = tddr();
const options: BuildOptions | undefined = undefined;
export type { BuildResult, EmailEntry };
export { core, Each, Else, ElseIf, If, render, renderTemplate, renderVue, renderVueTemplate, buildEmails, createEmailServer, findEmails, renderEmail, verifyEmail, plugins, options };`,
    );
    // DOM: Vue's own declarations need it; node: Vite's
    write("tsconfig.json", TSCONFIG(["core.ts", "adapters.ts"], ["ES2023", "DOM"], ["node"]));
    must(process.execPath, [TSC, "-p", "."]);
  });

  await check("tddr/react render and renderTemplate", () => {
    // renderTemplate's fields need tddr's JSX runtime, which only the tddr() Vite plugin wires in
    // (the folder build below covers that); here a component without fields
    write(
      "react.mjs",
      `import { createElement as h } from "react";
import { render, renderTemplate } from "tddr/react";
const Hello = ({ name }) => h("table", null, h("tbody", null, h("tr", null, h("td", { style: { color: "#333333" } }, "Hello ", name))));
const Static = () => h("p", { style: { margin: 0 } }, "Static");
console.log(JSON.stringify({ html: render(Hello, { name: "Ada" }), template: await renderTemplate(Static) }));`,
    );
    const { html, template } = JSON.parse(node("react.mjs")) as { html: string; template: string };
    assert(html === '<table><tbody><tr><td style="color:#333333">Hello Ada</td></tr></tbody></table>', `render: ${html}`);
    assert(template === '<p style="margin:0">Static</p>', `renderTemplate: ${template}`);
  });

  await check("tddr/vue render and renderTemplate", () => {
    write(
      "vue.mjs",
      `import { defineComponent, h } from "vue";
import { compile } from "tddr";
import { render, renderTemplate } from "tddr/vue";
const Hello = defineComponent({ props: { user: Object }, setup: (p) => () => h("p", { style: "color:#333333" }, "Hello " + p.user.name) });
const template = compile(await renderTemplate(Hello), { template: "liquid" });
console.log(JSON.stringify({ html: await render(Hello, { user: { name: "Ada" } }), liquid: template.html }));`,
    );
    const { html, liquid } = JSON.parse(node("vue.mjs")) as { html: string; liquid: string };
    assert(html === '<p style="color:#333333">Hello Ada</p>', `render: ${html}`);
    assert(liquid.includes("Hello {{ user.name | escape }}"), "renderTemplate + compile wrote no liquid field");
  });

  await check("tddr build <emails dir> writes one file per dialect for a React template email", () => {
    must(tddr, ["build", "emails", "-o", "out"]);
    const hbs = readFileSync(join(APP, "out/welcome.handlebars.html"), "utf8");
    const liquid = readFileSync(join(APP, "out/welcome.liquid.html"), "utf8");
    assert(hbs.includes("Welcome, {{user.name}}."), "handlebars field missing");
    assert(liquid.includes("Welcome, {{ user.name | escape }}."), "liquid field missing");
  });

  await check("tddr dev serves the page, the email list and a render", async () => {
    const dev = await startDev();
    try {
      const page = await fetch(dev.url);
      assert(page.status === 200 && (await page.text()).includes("<title>td;dr dev</title>"), `GET / ${page.status}`);
      const script = await fetch(new URL("/__tddr/ui/app.js", dev.url));
      assert(script.status === 200, `GET /__tddr/ui/app.js ${script.status}`);
      const list = (await (await fetch(new URL("/__tddr/api/emails", dev.url))).json()) as { emails: Array<{ name: string; template: string[] }> };
      assert(list.emails.some((e) => e.name === "welcome" && e.template.includes("handlebars")), `emails: ${JSON.stringify(list)}`);
      const res = await fetch(new URL("/__tddr/api/render", dev.url), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "welcome", mode: "handlebars", data: "default" }),
      });
      const body = (await res.json()) as { html?: string; diagnostics?: Array<{ severity: string }> };
      assert(res.status === 200 && body.html?.includes("Welcome, Ada."), `render ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
      assert(!body.diagnostics?.some((d) => d.severity === "error"), "render reported errors");
    } finally {
      await dev.stop();
    }
  });
};

await steps();
const failed = results.filter((r) => r.error);
console.log(`\n${notes.map((n) => `note: ${n}\n`).join("")}smoke: ${results.length - failed.length} passed, ${failed.length} failed`);
if (failed.length === 0 && !process.env.KEEP) rmSync(WORK, { recursive: true, force: true });
else console.log(`scratch project kept at ${APP}`);
process.exitCode = failed.length === 0 ? 0 : 1;

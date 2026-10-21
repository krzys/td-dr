// Refreshes the vendored caniemail data (docs/support.md#targets-and-client-data). Run: pnpm caniemail
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL("../src/targets/data/", import.meta.url));
const old = JSON.parse(readFileSync(`${DIR}caniemail.meta.json`, "utf8"));

const res = await fetch(old.url);
if (!res.ok) throw new Error(`${old.url}: ${res.status}`);
const text = await res.text();
const data = JSON.parse(text);

// capabilities.ts reads the 1.x shape; a new major needs a look first
const major = (v: string) => v.split(".")[0];
if (major(data.api_version) !== major(old.api_version))
  throw new Error(`api_version ${data.api_version} (was ${old.api_version}): check capabilities.ts before vendoring`);

const sha256 = createHash("sha256").update(text).digest("hex");
const meta = {
  ...old,
  api_version: data.api_version,
  last_update_date: data.last_update_date,
  features: data.data.length,
  sha256,
  fetched_at: new Date().toISOString().slice(0, 10),
};
writeFileSync(`${DIR}caniemail.json`, text);
writeFileSync(`${DIR}caniemail.meta.json`, `${JSON.stringify(meta, null, 2)}\n`);
console.log(sha256 === old.sha256 ? `unchanged (${old.last_update_date})` : `updated: ${old.last_update_date} → ${data.last_update_date}, ${meta.features} features; run pnpm check and review goldens`);

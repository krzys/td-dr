import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEmailServer, emailImports, findEmails, renderEmail } from "../../../adapters/vite/index.ts";

describe("emailImports", () => {
  it("knows the files an email loaded from outside its folder", async () => {
    const root = mkdtempSync(join(tmpdir(), "tddr-imports-"));
    mkdirSync(join(root, "emails/card"), { recursive: true });
    mkdirSync(join(root, "shared"));
    writeFileSync(join(root, "shared/Logo.jsx"), "export const Logo = () => <b>Logo</b>;\n");
    writeFileSync(join(root, "shared/tokens.css"), "b { color: #123456; }\n");
    writeFileSync(join(root, "shared/unused.jsx"), "export const x = 1;\n");
    writeFileSync(
      join(root, "emails/card/index.jsx"),
      'import "../../shared/tokens.css";\nimport { Logo } from "../../shared/Logo.jsx";\nexport default () => <div><Logo /></div>;\n',
    );
    const vite = await createEmailServer({ root });
    try {
      const [card] = findEmails(join(root, "emails"));
      expect(emailImports(vite, join(root, "shared/Logo.jsx"))).toBe(false);
      await renderEmail(vite, card!, { data: {}, mode: "html" });
      expect(emailImports(vite, join(root, "shared/Logo.jsx"))).toBe(true);
      expect(emailImports(vite, join(root, "shared/tokens.css"))).toBe(true);
      expect(emailImports(vite, join(root, "shared/unused.jsx"))).toBe(false);
    } finally {
      await vite.close();
    }
  });
});

describe("imported images", () => {
  it("stay files for the asset rule, small SVGs too (Vite would inline them as data: URIs Gmail drops)", async () => {
    const root = mkdtempSync(join(tmpdir(), "tddr-inline-"));
    mkdirSync(join(root, "emails/card"), { recursive: true });
    writeFileSync(join(root, "emails/card/icon.svg"), '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>');
    writeFileSync(join(root, "emails/card/index.jsx"), 'import icon from "./icon.svg";\nexport default () => <div><img src={icon} width="8" alt="" /></div>;\n');
    const vite = await createEmailServer({ root });
    try {
      const [card] = findEmails(join(root, "emails"));
      const r = await renderEmail(vite, card!, { data: {}, mode: "html" });
      expect(r.html).not.toContain("data:");
      expect(r.diagnostics.map((d) => d.code)).toContain("E015");
    } finally {
      await vite.close();
    }
  });
});

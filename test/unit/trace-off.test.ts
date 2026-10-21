import { describe, expect, it } from "vitest";
import { TRACE_ATTR } from "../../src/emit/trace.ts";
import { compile } from "../../src/index.ts";

// The tree is always marked (src/pipeline.ts): the screens diff by the markers and the self-lint
// places a W006 by them. Without trace:true none of them reach the output, Outlook's copies included.
const page = `<style>
  .row { display: flex; }
  @media (max-width: 480px) { .row { flex-direction: column; } }
  @media (prefers-color-scheme: dark) { .light { display: none; } .dark { display: inline-block !important; } }
</style>
<div style="max-width: 600px; margin: 0 auto; background: #333333 url(https://img.example/bg.png) center / cover; padding: 24px;">
  <a href="https://example.com/"><img class="light" src="https://img.example/a.png" width="100" height="20" alt="A"><img class="dark" src="https://img.example/b.png" width="100" height="20" alt="A" style="display: none;"></a>
  <div class="row"><p style="flex: 1;">One</p><p style="flex: 1;">Two</p></div>
  <a href="https://example.com/go" style="display: inline-block; padding: 12px 24px; border-radius: 6px; background: #cc3333; color: #ffffff;">Go</a>
</div>`;

describe("trace markers", () => {
  it.each([{}, { template: "handlebars" as const }, { template: "liquid" as const }])("stay out of the output without trace: %o", (o) => {
    const out = compile(page, { strict: false, ...o });
    expect(out.html).toContain("<!--[if mso");
    expect(out.html).toContain("v:roundrect");
    expect(out.html).not.toContain(TRACE_ATTR);
    expect(out.html).not.toContain("\u{F8F0}");
    expect(out.trace).toBeUndefined();
  });
});

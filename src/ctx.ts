import type { DialectName } from "./template/dialects.ts";
import { createSink, type DiagnosticSink } from "./diagnostics/diagnostic.ts";
import { DEFAULT_TARGETS, loadCapabilities, type Capabilities } from "./targets/capabilities.ts";

export type CompileOptions = {
  css?: string[]; // extra stylesheets, applied after <style> blocks
  targets?: string[]; // default ["broad"]
  width?: number; // design width; without it, the email's root container decides (docs/support.md#design-width)
  strict?: boolean; // default true: unsupported input is an error
  allowSvg?: boolean; // keep inline <svg> with W010 instead of E008 (docs/support.md#images)
  lang?: string; // the email's language when the source has no <html lang>; else "en" with I009
  template?: DialectName; // write placeholders and each/if blocks for an ESP (docs/templates.md)
  trace?: boolean; // also return which input element each output start tag came from (dev UI)
};

export type ResolvedOptions = {
  readonly css: readonly string[];
  readonly targets: readonly string[];
  readonly width: number;
  readonly widthGiven: boolean;
  readonly strict: boolean;
  readonly allowSvg: boolean;
  readonly lang?: string;
  readonly template?: DialectName;
  readonly trace?: boolean;
};

// The design-width decision (analyze/design-width.ts, docs/support.md#design-width): the width, and the root containers it
// reported (W011) as wider than a given width option, by identityKey. The analyzer marks their nodes
// (`reportedWide`), so later stages read that, not the diagnostics.
export type WidthDecision = { readonly width: number; readonly reportedWide: ReadonlySet<string> };

// What the compile's other screens (src/responsive) do differently, by locKey, so every compile decides
// alike (src/pipeline.ts otherScreens).
export type OtherScreens = {
  // elements a narrower screen lays out differently, with the widest such screen (px): below it the output
  // follows that screen's layout, so the base layout's narrow-screen notes don't apply there
  readonly relaidBelow: ReadonlyMap<string, number>;
  // elements with a left or right border on the base screen: their box gets a table of its own in every
  // compile, so all screens keep one structure (emit/plan.ts sharesSlotCell)
  readonly sideBorders: ReadonlySet<string>;
  // flex columns another screen spaces with another space-* value: their spacer rows take a shape every
  // value fits, so all screens keep one structure (emit/stack.ts justified)
  readonly respaced: ReadonlySet<string>;
  // elements with a fill or a border on some screens only, or painted with padding on some only: their box
  // keeps its cell in every compile (Box.keepCell), so a screen that adds or drops either changes only styles
  readonly painted: ReadonlySet<string>;
};

export interface Ctx {
  readonly options: ResolvedOptions;
  readonly caps: Capabilities;
  readonly diagnostics: DiagnosticSink;
  readonly widthDecision?: WidthDecision; // absent before the decision (and in stage tests)
  readonly otherScreens?: OtherScreens; // absent without other screens
}

export const resolveOptions = (o: CompileOptions = {}): ResolvedOptions => ({
  css: o.css ?? [],
  targets: o.targets ?? [...DEFAULT_TARGETS],
  width: o.width ?? 600,
  widthGiven: o.width !== undefined,
  strict: o.strict ?? true,
  allowSvg: o.allowSvg ?? false,
  ...(o.lang ? { lang: o.lang } : {}),
  ...(o.template ? { template: o.template } : {}),
  ...(o.trace ? { trace: true } : {}),
});

// a BCP 47 tag as far as a lang attribute needs: de, pt-BR, zh-Hant-TW
export const LANG_TAG = /^[a-z]{2,3}(?:-[a-z0-9]{1,8})*$/i;

export const createCtx = (o: CompileOptions = {}): Ctx => {
  const options = resolveOptions(o);
  return { options, caps: loadCapabilities(options.targets), diagnostics: createSink(options.strict) };
};

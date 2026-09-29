import { lintAccessibility, type LintDoc } from "../../../src/lint/index.ts";
import type { Diagnostic } from "../../../src/diagnostics/diagnostic.ts";
import { styledFrom, testCtx } from "../../helpers/index.ts";

// The real parse, sanitize and style stages, then the lint; `only` keeps one code.
export const lint = (html: string, only?: string, doc?: LintDoc): Diagnostic[] => {
  const ctx = testCtx();
  lintAccessibility(styledFrom(html, ctx), ctx, doc);
  return ctx.diagnostics.list().filter((d) => only === undefined || d.code === only);
};

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const chunk = (type: string, data: Buffer): Buffer => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  return Buffer.concat([len, Buffer.from(type, "latin1"), data, Buffer.alloc(4)]);
};

export const png = (colourType: number, extra: Buffer[] = []): string => {
  const ihdr = Buffer.alloc(13);
  ihdr[8] = 8;
  ihdr[9] = colourType;
  const bytes = Buffer.concat([PNG_SIG, chunk("IHDR", ihdr), ...extra, chunk("IDAT", Buffer.alloc(2)), chunk("IEND", Buffer.alloc(0))]);
  return `data:image/png;base64,${bytes.toString("base64")}`;
};

export const trns = (): Buffer => chunk("tRNS", Buffer.from([0]));

export const gif = (transparent: boolean): string => {
  const head = Buffer.from("GIF89a", "latin1");
  const screen = Buffer.from([1, 0, 1, 0, 0x80, 0, 0]);
  const table = Buffer.alloc(6);
  const gce = Buffer.from([0x21, 0xf9, 0x04, transparent ? 1 : 0, 0, 0, 0, 0]);
  const image = Buffer.from([0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 0, 0x3b]);
  return `data:image/gif;base64,${Buffer.concat([head, screen, table, gce, image]).toString("base64")}`;
};

// Size limits clients put on a message, in raw UTF-8 bytes. Display uses decimal kilobytes
// (1 KB = 1000 bytes) everywhere, and a limit is also given in exact bytes so nobody has to
// guess which kilobyte is meant.

// Gmail hides everything past about 102 KB of HTML behind "View entire message".
export const GMAIL_CLIP_BYTES = 102_000;
// Gmail drops the head <style> rules past this point, the reset included.
export const HEAD_STYLE_BYTES = 16 * 1024;

// SMTP allows 998 bytes a line (https://www.rfc-editor.org/rfc/rfc5322#section-2.1.1); a server
// breaks a longer one wherever it likes, mid-URL or mid-tag.
export const SMTP_LINE_BYTES = 998;
// Lines are wrapped below it, so a relay's own rewrite of a line has room.
export const WRAP_LINE_BYTES = 900;

export const byteLength = (s: string): number => Buffer.byteLength(s, "utf8");

export const formatKB = (bytes: number): string => `${(bytes / 1000).toFixed(1)} KB`;

export const formatBytes = (bytes: number): string => `${bytes.toLocaleString("en-US")} bytes`;

// td;dr's own: rules nested deeper are ignored with a W002, since flattening a level costs
// stack and time for every level above it.
export const CSS_NESTING_DEPTH = 128;

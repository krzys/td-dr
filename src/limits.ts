// Size limits clients put on a message, in raw UTF-8 bytes. Display uses decimal kilobytes
// (1 KB = 1000 bytes) everywhere, and a limit is also given in exact bytes so nobody has to
// guess which kilobyte is meant.

// Gmail hides everything past about 102 KB of HTML behind "View entire message".
export const GMAIL_CLIP_BYTES = 102_000;
// Gmail drops the head <style> rules past this point, the reset included.
export const HEAD_STYLE_BYTES = 16 * 1024;

export const byteLength = (s: string): number => Buffer.byteLength(s, "utf8");

export const formatKB = (bytes: number): string => `${(bytes / 1000).toFixed(1)} KB`;

export const formatBytes = (bytes: number): string => `${bytes.toLocaleString("en-US")} bytes`;

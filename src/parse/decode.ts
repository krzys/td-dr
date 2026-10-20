// What the input says about itself before it is HTML: its byte order mark.

export const BOM = "﻿";

// a leading U+FEFF is the encoding's mark, not text (https://encoding.spec.whatwg.org/#decode)
export const stripBom = (s: string): string => (s.startsWith(BOM) ? s.slice(1) : s);

// Shared by the <link> check (parse) and @import (cascade) so the lists can't drift.
const FONT_HOSTS = /^(https?:)?\/\/(fonts\.googleapis\.com|fonts\.bunny\.net|use\.typekit\.net|fast\.fonts\.net|use\.fontawesome\.com)\//i;

export const isFontHost = (url: string): boolean => FONT_HOSTS.test(url.trim());

// The url of an @import prelude: url("x"), url(x) or a bare string.
export const importUrl = (params: string): string => /^\s*(?:url\(\s*)?(?:"([^"]*)"|'([^']*)'|([^\s)"']+))/i.exec(params)?.slice(1).find((g) => g !== undefined) ?? "";

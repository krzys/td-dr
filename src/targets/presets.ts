export type Pair = {
  family: string;
  platform: string;
  // caniemail keeps one row per release; classic Outlook is pinned to the newest one at or below this
  maxVersion?: number;
};

const OUTLOOK_2019: Pair = { family: "outlook", platform: "windows", maxVersion: 2019 };
const GMAIL: Pair[] = ["desktop-webmail", "ios", "android", "mobile-webmail"].map((platform) => ({
  family: "gmail",
  platform,
}));
const OUTLOOK_COM: Pair = { family: "outlook", platform: "outlook-com" };
const APPLE_MAIL: Pair[] = ["macos", "ios"].map((platform) => ({ family: "apple-mail", platform }));
const YAHOO: Pair[] = ["desktop-webmail", "ios", "android"].map((platform) => ({ family: "yahoo", platform }));

export const PRESETS: Record<string, Pair[]> = {
  gmail: GMAIL,
  "outlook-2019": [OUTLOOK_2019],
  "outlook-com": [OUTLOOK_COM],
  // UNVERIFIED: the new Outlook for Windows has no caniemail key of its own.
  // outlook.com webmail and Windows Mail are the closest proxies.
  "outlook-new": [OUTLOOK_COM, { family: "outlook", platform: "windows-mail" }],
  "apple-mail": APPLE_MAIL,
  yahoo: YAHOO,
  samsung: [{ family: "samsung-email", platform: "android" }],
  "outlook-mobile": [
    { family: "outlook", platform: "ios" },
    { family: "outlook", platform: "android" },
  ],
  broad: [...GMAIL, OUTLOOK_2019, OUTLOOK_COM, ...APPLE_MAIL, ...YAHOO],
};

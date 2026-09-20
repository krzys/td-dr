import { describe, expect, it } from "vitest";
import {
  createCapabilities,
  latestVersion,
  loadCapabilities,
  type CaniemailData,
} from "../../../src/targets/capabilities.ts";
import { PRESETS } from "../../../src/targets/presets.ts";

const db: CaniemailData = {
  nicenames: {
    family: { gmail: "Gmail", outlook: "Outlook", yahoo: "Yahoo" },
    platform: { ios: "iOS", windows: "Windows", "desktop-webmail": "Desktop Webmail" },
  },
  data: [
    {
      slug: "f-mixed",
      notes_by_num: { "1": "gmail note", "2": "outlook note", "3": "unused" },
      stats: {
        gmail: { ios: { "2019-02": "y", "2020-11": "a #1", "2026-03": "y" } },
        outlook: { windows: { "2007": "n #2", "2016": "n #2", "2019": "a #2 #1", "2021": "y" } },
        yahoo: { "desktop-webmail": { "2019-02": "y" } },
      },
    },
    { slug: "f-newonly", stats: { outlook: { windows: { "2021": "y", "2024": "y" } } } },
    { slug: "f-ok", stats: { gmail: { ios: { "2020": "y" } }, outlook: { windows: { "2019": "y" } } } },
    { slug: "f-untested", stats: { gmail: { ios: { "2020": "u" } }, outlook: { windows: { "2019": "y" } } } },
  ],
};
const caps = (t: string[]) => createCapabilities(db, t);

describe("presets", () => {
  it("defines the documented presets", () => {
    expect(Object.keys(PRESETS).sort()).toEqual(
      ["apple-mail", "broad", "gmail", "outlook-2019", "outlook-com", "outlook-mobile", "outlook-new", "samsung", "yahoo"].sort(),
    );
  });

  it("broad is gmail + outlook-2019 + outlook-com + apple-mail + yahoo", () => {
    const names = ["gmail", "outlook-2019", "outlook-com", "apple-mail", "yahoo"];
    expect(PRESETS.broad).toEqual(names.flatMap((n) => PRESETS[n]!));
  });

  it("resolves every preset against the vendored data", () => {
    for (const name of Object.keys(PRESETS)) {
      const r = loadCapabilities([name]).check("css-display-flex");
      expect(["y", "a", "n", "u"]).toContain(r.status);
    }
  });
});

describe("latestVersion", () => {
  it("sorts numerically, not lexically", () => {
    expect(latestVersion(["16.9", "16.80", "16.103"])).toBe("16.103");
    expect(latestVersion(["2016", "2007", "2019"])).toBe("2019");
  });
  it("sorts dates chronologically even if listed out of order", () => {
    expect(latestVersion(["2024-10", "2024-01"])).toBe("2024-10");
  });
  it("trusts dict order to pick the kind when versions and dates mix", () => {
    expect(latestVersion(["2021-11", "7.0", "6.0"])).toBe("7.0");
    expect(latestVersion(["6.0", "2021-11"])).toBe("2021-11");
  });
  it("caps classic releases", () => {
    expect(latestVersion(["2013", "2019", "2021", "2024"], 2019)).toBe("2019");
    expect(latestVersion(["2021"], 2019)).toBeUndefined();
  });
});

describe("check", () => {
  it("uses the latest version per platform", () => {
    expect(caps(["gmail/ios"]).check("f-mixed")).toEqual({ status: "y", clients: [], unsupported: [], notes: [] });
  });

  it("pins outlook-2019 to the newest classic release", () => {
    const r = createCapabilities(
      { ...db, nicenames: db.nicenames },
      ["outlook-2019"],
    ).check("f-mixed");
    expect(r.status).toBe("a");
    expect(r.clients).toEqual(["Outlook Windows"]);
  });

  it("takes the worst status across pairs and dedupes notes", () => {
    const r = caps(["outlook/windows", "gmail/ios"]).check("f-mixed");
    expect(r.status).toBe("y"); // outlook 2021 is the latest row of a raw family/platform
    const old = createCapabilities(
      { ...db, data: [{ ...db.data[0]!, stats: { ...db.data[0]!.stats, outlook: { windows: { "2019": "n #2 #1" } } } }] },
      ["outlook/windows", "gmail/ios"],
    ).check("f-mixed");
    expect(old.status).toBe("n");
    expect(old.clients).toEqual(["Outlook Windows"]);
    expect(old.notes).toEqual(["outlook note", "gmail note"]);
  });

  it("ranks n > a > u > y", () => {
    expect(caps(["gmail/ios"]).check("f-untested").status).toBe("u");
    const mixed = createCapabilities(
      {
        ...db,
        data: [{ slug: "x", stats: { gmail: { ios: { "1": "u" } }, yahoo: { "desktop-webmail": { "1": "a" } } } }],
      },
      ["gmail/ios", "yahoo/desktop-webmail"],
    );
    expect(mixed.check("x").status).toBe("a");
    expect(mixed.check("x").clients).toEqual(["Gmail iOS", "Yahoo Desktop Webmail"]);
  });

  it("treats a client with no row as untested", () => {
    const r = caps(["yahoo/desktop-webmail"]).check("f-ok");
    expect(r.status).toBe("u");
    expect(r.clients).toEqual(["Yahoo Desktop Webmail"]);
  });

  it("returns u for unknown slugs and memoizes", () => {
    const c = caps(["gmail"]);
    expect(c.check("nope")).toEqual({ status: "u", clients: [], unsupported: [], notes: [] });
    expect(c.check("f-ok")).toBe(c.check("f-ok"));
  });

  it("reports display names and notes from the vendored data", () => {
    const r = loadCapabilities(["gmail"]).check("css-display-flex");
    expect(r.status).toBe("a");
    expect(r.clients).toContain("Gmail iOS");
    expect(r.notes.length).toBeGreaterThan(0);
  });

  it("drops the dead buttons.cm link from the border-radius note", () => {
    const notes = loadCapabilities(["broad"]).check("css-border-radius").notes.join("\n");
    expect(notes).toContain("[VML documentation]");
    expect(notes).not.toContain("buttons.cm");
  });

  it("flags display:flex for broad because of classic Outlook", () => {
    const r = loadCapabilities(["broad"]).check("css-display-flex");
    expect(r.status).toBe("n");
    expect(r.clients).toContain("Outlook Windows");
  });
});

describe("targets", () => {
  it("accepts a raw family and family/platform", () => {
    expect(() => loadCapabilities(["yahoo"])).not.toThrow();
    expect(() => loadCapabilities(["outlook/windows"])).not.toThrow();
  });

  it("throws for unknown targets, listing the known ones", () => {
    for (const bad of ["nope", "gmail/nope", "a/b/c"]) {
      expect(() => loadCapabilities([bad])).toThrow(`Unknown target "${bad}". Known: gmail`);
    }
  });
});

describe("fix round 1", () => {
  it("handles product years mixed with build numbers", () => {
    expect(latestVersion(["2011", "2016", "16.80"])).toBe("16.80");
    expect(latestVersion(["2019", "16.70", "16.80"])).toBe("16.80");
    expect(latestVersion(["2019", "2024"])).toBe("2024");
    expect(latestVersion(["12", "13", "14", "15", "11.4"])).toBe("15");
  });

  it("vendored outlook/macos reports the newest row", () => {
    expect(loadCapabilities(["outlook/macos"]).check("css-at-font-face").status).toBe("n");
  });

  it("outlook-2019 falls back to the latest row when only date rows exist", () => {
    const d: CaniemailData = {
      ...db,
      data: [{ slug: "dates", stats: { outlook: { windows: { "2022-08": "n", "2023-12": "y" } } } }],
    };
    expect(createCapabilities(d, ["outlook-2019"]).check("dates").status).toBe("y");
  });

  it("an empty target list throws", () => {
    expect(() => createCapabilities(db, [])).toThrow();
  });

  it("dedupes notes shared by two pairs", () => {
    const d: CaniemailData = {
      ...db,
      data: [
        {
          slug: "n",
          notes_by_num: { "1": "shared" },
          stats: { gmail: { ios: { "1": "a #1" } }, yahoo: { "desktop-webmail": { "1": "a #1" } } },
        },
      ],
    };
    expect(createCapabilities(d, ["gmail/ios", "yahoo/desktop-webmail"]).check("n").notes).toEqual(["shared"]);
  });

  it("overlapping targets give no duplicate client names", () => {
    const d: CaniemailData = {
      ...db,
      data: [{ slug: "o", stats: { outlook: { windows: { "2019": "n" } } } }],
    };
    expect(createCapabilities(d, ["outlook-2019", "outlook/windows"]).check("o").clients).toEqual(["Outlook Windows"]);
  });
});

describe("fix round 2 capabilities", () => {
  it.each(["toString", "constructor", "__proto__", "hasOwnProperty"])("rejects inherited name %s", (t) => {
    expect(() => loadCapabilities([t])).toThrow(/Unknown target/);
  });

  it("outlook rows with only years above 2019 resolve to u for outlook-2019", () => {
    const r = caps(["outlook-2019"]).check("f-newonly");
    expect(r.status).toBe("u");
    expect(r.clients).toContain("Outlook Windows");
  });
});

import { describe, expect, it } from "vitest";
import { mergeBlacklists, sameBlacklist } from "./blacklistMerge";

describe("mergeBlacklists", () => {
  it("keeps lines added on both sides since the last sync", () => {
    const base = "gore";
    const local = "gore\nscat"; // added here
    const remote = "gore\ninflation"; // added on Android
    const r = mergeBlacklists(base, local, remote);
    expect(r.merged).toBe("gore\ninflation\nscat");
    expect(r).toMatchObject({ pulled: 1, pushed: 1, removed: 0 });
  });

  it("drops lines removed locally since the last sync", () => {
    const r = mergeBlacklists("gore\nscat", "gore", "gore\nscat\ninflation");
    expect(r.merged).toBe("gore\ninflation");
    expect(r.removed).toBe(1);
  });

  it("respects lines removed on the account since the last sync", () => {
    const r = mergeBlacklists("gore\nscat", "gore\nscat", "gore");
    expect(r.merged).toBe("gore");
    expect(r.pushed).toBe(0);
  });

  it("unions everything when there is no base", () => {
    const r = mergeBlacklists(null, "scat\ngore", "gore\ninflation");
    expect(r.merged).toBe("gore\ninflation\nscat");
  });

  it("treats case and spacing differences as the same line", () => {
    const r = mergeBlacklists(null, "Young  -age_difference", "young -age_difference");
    expect(r.merged).toBe("young -age_difference");
    expect(r).toMatchObject({ pulled: 0, pushed: 0 });
  });

  it("drops blank lines and duplicates", () => {
    expect(mergeBlacklists(null, "\n\ngore\n", "gore\ngore\n\n").merged).toBe("gore");
  });
});

describe("sameBlacklist", () => {
  it("ignores spacing, case and blank lines", () => {
    expect(sameBlacklist("Gore\n\nscat ", "gore\nscat")).toBe(true);
    expect(sameBlacklist("gore\nscat", "scat\ngore")).toBe(false);
  });
});

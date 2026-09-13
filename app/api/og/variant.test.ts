import { describe, it, expect } from "vitest";
import { variantForTime } from "./variant";

// The reference zone is UTC, so these instants are unambiguous.
const at = (iso: string) => new Date(iso);

describe("share card variant selection", () => {
  it("serves the sunrise card through the working day", () => {
    expect(variantForTime(at("2026-07-23T07:00:00Z"))).toBe("light");
    expect(variantForTime(at("2026-07-23T12:30:00Z"))).toBe("light");
    expect(variantForTime(at("2026-07-23T18:59:59Z"))).toBe("light");
  });

  it("serves the nocturne card overnight", () => {
    expect(variantForTime(at("2026-07-23T19:00:00Z"))).toBe("dark");
    expect(variantForTime(at("2026-07-23T23:30:00Z"))).toBe("dark");
    expect(variantForTime(at("2026-07-23T04:00:00Z"))).toBe("dark");
  });

  it("treats midnight as night, not as hour 24", () => {
    // Guards the hourCycle choice: `hour12: false` reports 00:00 as "24"
    // under some ICU builds, which would land outside both branches and
    // silently flip midnight to the daytime card.
    expect(variantForTime(at("2026-07-23T00:00:00Z"))).toBe("dark");
    expect(variantForTime(at("2026-07-23T00:59:00Z"))).toBe("dark");
  });

  it("matches the boundaries the site's own theme script uses", () => {
    // app/layout.tsx flips at 07:00 and 19:00; if that ever moves, this
    // should move with it or the unfurl stops agreeing with the page.
    expect(variantForTime(at("2026-07-23T06:59:59Z"))).toBe("dark");
    expect(variantForTime(at("2026-07-23T07:00:00Z"))).toBe("light");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  codeFromQuery,
  isCodeShape,
  peekStashedCode,
  stashCode,
  takeStashedCode,
} from "./pending";

/** A minimal localStorage. jsdom is not configured for this suite. */
function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    _map: map,
  };
}

beforeEach(() => {
  vi.stubGlobal("window", { localStorage: fakeStorage() });
});

describe("isCodeShape", () => {
  it("accepts a derived code (6 hex)", () => {
    expect(isCodeShape("7C2A9E")).toBe(true);
  });

  it("accepts a vanity code", () => {
    expect(isCodeShape("HYUNGSU")).toBe(true);
  });

  it("rejects anything that is not a code", () => {
    // This value reaches a URL path and a signed message, so it is validated on
    // the way in rather than trusted on the way out.
    for (const bad of ["", "AB", "A".repeat(13), "with space", "semi;colon", "../etc", "<script>"]) {
      expect(isCodeShape(bad), bad).toBe(false);
    }
  });
});

describe("stash / peek / take", () => {
  it("round-trips a code, uppercased", () => {
    stashCode("hyungsu");
    expect(peekStashedCode()).toBe("HYUNGSU");
  });

  it("peek does NOT consume", () => {
    // Consuming on display would lose the referral for anyone who reloads
    // mid-flow — the exact case the stash exists for.
    stashCode("MEHDI");
    expect(peekStashedCode()).toBe("MEHDI");
    expect(peekStashedCode()).toBe("MEHDI");
  });

  it("take consumes", () => {
    stashCode("MEHDI");
    expect(takeStashedCode()).toBe("MEHDI");
    expect(peekStashedCode()).toBeNull();
  });

  it("refuses to stash a malformed code", () => {
    stashCode("../../admin");
    expect(peekStashedCode()).toBeNull();
  });

  it("returns null when nothing is stashed", () => {
    expect(peekStashedCode()).toBeNull();
    expect(takeStashedCode()).toBeNull();
  });

  it("survives storage that throws", () => {
    // Private mode. The user can still type the code by hand, so this must
    // degrade rather than break the page.
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("denied");
        },
        setItem: () => {
          throw new Error("denied");
        },
        removeItem: () => {
          throw new Error("denied");
        },
      },
    });
    expect(() => stashCode("MEHDI")).not.toThrow();
    expect(peekStashedCode()).toBeNull();
    expect(takeStashedCode()).toBeNull();
  });
});

describe("codeFromQuery", () => {
  it("reads ?ref=", () => {
    expect(codeFromQuery("?ref=MEHDI")).toBe("MEHDI");
  });

  it("uppercases", () => {
    expect(codeFromQuery("?ref=mehdi")).toBe("MEHDI");
  });

  it("survives other params around it", () => {
    expect(codeFromQuery("?chain=rise&ref=7C2A9E&base=NOVA")).toBe("7C2A9E");
  });

  it("returns null when absent", () => {
    expect(codeFromQuery("?chain=rise")).toBeNull();
  });

  it("returns null for a malformed code rather than passing it through", () => {
    // A bad ?ref= should render no banner at all — never a banner naming a code
    // that cannot work.
    expect(codeFromQuery("?ref=")).toBeNull();
    expect(codeFromQuery("?ref=nope%20nope")).toBeNull();
    expect(codeFromQuery("?ref=" + "A".repeat(40))).toBeNull();
  });

  it("accepts URLSearchParams as well as a string", () => {
    expect(codeFromQuery(new URLSearchParams({ ref: "MEHDI" }))).toBe("MEHDI");
  });
});

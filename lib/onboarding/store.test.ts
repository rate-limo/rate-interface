import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  claimOnboardingOffer,
  hasOnboarded,
  markOnboarded,
  wasOnboardingOffered,
} from "./store";

/**
 * The guard that stops onboarding re-running. A wrong answer here is either a
 * flow the user sees forever, or one they never see — both silent.
 */

function fakeStorage(seed?: Record<string, string>) {
  const map = new Map(Object.entries(seed ?? {}));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

const A = "0xAAAA000000000000000000000000000000000001";
const B = "0xBBBB000000000000000000000000000000000002";

beforeEach(() => {
  vi.stubGlobal("window", { localStorage: fakeStorage() });
});
afterEach(() => vi.unstubAllGlobals());

describe("hasOnboarded / markOnboarded", () => {
  it("is false before anything is recorded", () => {
    expect(hasOnboarded(A)).toBe(false);
  });

  it("round-trips a wallet", () => {
    markOnboarded(A);
    expect(hasOnboarded(A)).toBe(true);
  });

  it("is per-wallet, not per-browser", () => {
    // A browser with two wallets must onboard each once — and a shared machine
    // must not silently skip the second person.
    markOnboarded(A);
    expect(hasOnboarded(B)).toBe(false);
  });

  it("ignores address casing", () => {
    markOnboarded(A);
    expect(hasOnboarded(A.toLowerCase())).toBe(true);
    expect(hasOnboarded(A.toUpperCase().replace("0X", "0x"))).toBe(true);
  });

  it("treats a missing address as not onboarded", () => {
    expect(hasOnboarded(undefined)).toBe(false);
    expect(() => markOnboarded(undefined)).not.toThrow();
  });

  it("treats corrupt storage as 'nobody onboarded'", () => {
    // Showing the flow twice is a small cost; never showing it is a silent one.
    vi.stubGlobal("window", { localStorage: fakeStorage({ "iter.onboarded": "{not json" }) });
    expect(hasOnboarded(A)).toBe(false);
  });

  it("survives storage that throws", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem() { throw new Error("denied"); },
        setItem() { throw new Error("denied"); },
        removeItem() { throw new Error("denied"); },
      },
    });
    expect(hasOnboarded(A)).toBe(false);
    // Must not throw inside a completion handler.
    expect(() => markOnboarded(A)).not.toThrow();
  });

  it("does not grow without bound", () => {
    // An unbounded array in localStorage grows forever on a browser that
    // connects many wallets.
    for (let i = 0; i < 80; i += 1) {
      markOnboarded(`0x${i.toString(16).padStart(40, "0")}`);
    }
    const raw = (window as unknown as { localStorage: Storage }).localStorage.getItem(
      "iter.onboarded",
    );
    expect(JSON.parse(raw ?? "[]").length).toBeLessThanOrEqual(50);
  });

  it("keeps the most recent wallets when it trims", () => {
    for (let i = 0; i < 80; i += 1) {
      markOnboarded(`0x${i.toString(16).padStart(40, "0")}`);
    }
    expect(hasOnboarded(`0x${(79).toString(16).padStart(40, "0")}`)).toBe(true);
  });
});

/**
 * The offer guard. This is the one that regressed: between 2026-08-05 and
 * 2026-08-08 there was no such state, so an abandoned flow left nothing behind
 * and the redirect fired on every subsequent page load forever.
 */
describe("wasOnboardingOffered / claimOnboardingOffer", () => {
  it("is false before anything is recorded", () => {
    expect(wasOnboardingOffered(A)).toBe(false);
  });

  it("round-trips a wallet", () => {
    claimOnboardingOffer(A);
    expect(wasOnboardingOffered(A)).toBe(true);
  });

  it("sticks when the user ABANDONS the flow — the regression this exists for", () => {
    // Redirected, then navigated away without finishing or skipping. Nothing
    // writes `iter.onboarded`, so the offer flag is the only record that the
    // user was already sent there once.
    claimOnboardingOffer(A);
    expect(hasOnboarded(A)).toBe(false);
    expect(wasOnboardingOffered(A)).toBe(true);
  });

  it("counts a completed flow as offered, even if it was reached by URL", () => {
    // A wallet that typed /welcome and finished must never be auto-routed
    // afterwards, so the union is read, not the offer key alone.
    markOnboarded(A);
    expect(wasOnboardingOffered(A)).toBe(true);
  });

  it("does not mark a wallet as onboarded", () => {
    // WelcomeGate must still render the flow for someone who reloads mid-way.
    claimOnboardingOffer(A);
    expect(hasOnboarded(A)).toBe(false);
  });

  it("is per-wallet", () => {
    claimOnboardingOffer(A);
    expect(wasOnboardingOffered(B)).toBe(false);
  });

  it("ignores address casing", () => {
    claimOnboardingOffer(A);
    expect(wasOnboardingOffered(A.toLowerCase())).toBe(true);
    expect(wasOnboardingOffered(A.toUpperCase().replace("0X", "0x"))).toBe(true);
  });

  it("treats a missing address as not offered", () => {
    expect(wasOnboardingOffered(undefined)).toBe(false);
    expect(() => claimOnboardingOffer(undefined)).not.toThrow();
  });

  it("survives storage that throws", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem() { throw new Error("denied"); },
        setItem() { throw new Error("denied"); },
        removeItem() { throw new Error("denied"); },
      },
    });
    // Must not throw: this one runs inside a render effect, before a redirect.
    expect(() => claimOnboardingOffer(A)).not.toThrow();
    expect(wasOnboardingOffered(A)).toBe(false);
  });

  it("uses its own key, so it cannot clobber the completion list", () => {
    markOnboarded(A);
    claimOnboardingOffer(B);
    expect(hasOnboarded(A)).toBe(true);
    expect(hasOnboarded(B)).toBe(false);
    const store = (window as unknown as { localStorage: Storage }).localStorage;
    expect(JSON.parse(store.getItem("iter.onboarded") ?? "[]")).toEqual([A.toLowerCase()]);
    expect(JSON.parse(store.getItem("iter.onboarding-offered") ?? "[]")).toEqual([
      B.toLowerCase(),
    ]);
  });

  it("does not grow without bound", () => {
    for (let i = 0; i < 80; i += 1) {
      claimOnboardingOffer(`0x${i.toString(16).padStart(40, "0")}`);
    }
    const raw = (window as unknown as { localStorage: Storage }).localStorage.getItem(
      "iter.onboarding-offered",
    );
    expect(JSON.parse(raw ?? "[]").length).toBeLessThanOrEqual(50);
  });
});

/**
 * The claim is the gate: LoginRouter navigates if and only if this returns true,
 * which is what makes "record before navigating" structural rather than a
 * convention. These pin the once-only contract that rests on.
 */
describe("claimOnboardingOffer", () => {
  it("succeeds exactly once per wallet", () => {
    expect(claimOnboardingOffer(A)).toBe(true);
    expect(claimOnboardingOffer(A)).toBe(false);
    expect(claimOnboardingOffer(A)).toBe(false);
  });

  it("records the offer as it claims — no separate write to forget", () => {
    expect(wasOnboardingOffered(A)).toBe(false);
    claimOnboardingOffer(A);
    expect(wasOnboardingOffered(A)).toBe(true);
  });

  it("refuses a wallet that already completed the flow by URL", () => {
    markOnboarded(A);
    expect(claimOnboardingOffer(A)).toBe(false);
  });

  it("is per-wallet", () => {
    expect(claimOnboardingOffer(A)).toBe(true);
    expect(claimOnboardingOffer(B)).toBe(true);
  });

  it("ignores address casing, so one wallet cannot claim twice", () => {
    expect(claimOnboardingOffer(A.toLowerCase())).toBe(true);
    expect(claimOnboardingOffer(A.toUpperCase().replace("0X", "0x"))).toBe(false);
  });

  it("refuses a missing address rather than navigating", () => {
    expect(claimOnboardingOffer(undefined)).toBe(false);
  });

  it("does not mark the wallet onboarded", () => {
    // Being sent to the flow is not finishing it — WelcomeGate must still render.
    claimOnboardingOffer(A);
    expect(hasOnboarded(A)).toBe(false);
  });

  it("still offers once when storage cannot be written", () => {
    // Private mode. The claim cannot be made durable, so the choice is between
    // never onboarding in this browser and onboarding once per page load. The
    // in-memory guard in LoginRouter covers the rest of the page's life.
    vi.stubGlobal("window", {
      localStorage: {
        getItem() { throw new Error("denied"); },
        setItem() { throw new Error("denied"); },
        removeItem() { throw new Error("denied"); },
      },
    });
    expect(() => claimOnboardingOffer(A)).not.toThrow();
    expect(claimOnboardingOffer(A)).toBe(true);
  });
});

/**
 * The RETURN VALUE, which is the whole reason this replaced `markOnboardingOffered`.
 *
 * The old function recorded the offer and returned nothing, so "record before
 * navigating" was a rule expressed in call order — one edit away from moving
 * into a completion handler, which is precisely the bug that shipped between
 * 2026-08-05 and 2026-08-08. Making the claim the GATE means a caller cannot
 * navigate without having recorded, because recording is how they learn they
 * may. These tests hold that contract; the ones above only prove the write.
 */
describe("claimOnboardingOffer — the claim is the gate", () => {
  it("grants the offer exactly once", () => {
    expect(claimOnboardingOffer(A)).toBe(true);
    expect(claimOnboardingOffer(A)).toBe(false);
    expect(claimOnboardingOffer(A)).toBe(false);
  });

  it("is a WRITE — asking whether the offer is available spends it", () => {
    // This is why the docstring says to call it last, after every other guard.
    expect(wasOnboardingOffered(A)).toBe(false);
    claimOnboardingOffer(A);
    expect(wasOnboardingOffered(A)).toBe(true);
  });

  it("refuses a wallet that already completed the flow", () => {
    // Reached /welcome by URL and finished. An automatic redirect afterwards
    // would send them somewhere they have explicitly already been.
    markOnboarded(A);
    expect(claimOnboardingOffer(A)).toBe(false);
  });

  it("refuses a missing address rather than throwing", () => {
    expect(claimOnboardingOffer(undefined)).toBe(false);
    expect(claimOnboardingOffer("")).toBe(false);
  });

  it("is per-wallet: spending A's offer leaves B's intact", () => {
    expect(claimOnboardingOffer(A)).toBe(true);
    expect(claimOnboardingOffer(B)).toBe(true);
    expect(claimOnboardingOffer(A)).toBe(false);
  });

  it("cannot be spent twice by changing the casing", () => {
    expect(claimOnboardingOffer(A)).toBe(true);
    expect(claimOnboardingOffer(A.toLowerCase())).toBe(false);
  });

  /*
   * Unwritable storage grants the offer anyway, and that is deliberate.
   *
   * `add` silently does nothing in private mode, so the claim cannot be made
   * durable. Refusing would mean never showing onboarding at all in that
   * browser — a permanent failure to avoid a repeat. LoginRouter's in-memory
   * `routed` ref still holds for the life of the page, so the redirect does not
   * loop within a session.
   */
  it("grants the offer when storage refuses the write, rather than never onboarding", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem() { throw new Error("denied"); },
        setItem() { throw new Error("denied"); },
        removeItem() { throw new Error("denied"); },
      },
    });
    expect(claimOnboardingOffer(A)).toBe(true);
    // And again, because nothing could be recorded — the honest consequence.
    expect(claimOnboardingOffer(A)).toBe(true);
  });
});

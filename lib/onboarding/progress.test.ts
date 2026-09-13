import { describe, expect, it } from "vitest";
import { onboardingProgress } from "./progress";

const base = { connected: true, gas: "ok" as const, trades: 3 };

describe("onboardingProgress", () => {
  it("a funded wallet that has traded is finished", () => {
    const p = onboardingProgress(base);
    expect(p.finished).toBe(true);
    expect(p.completed).toBe(3);
    expect(p.next).toBeNull();
  });

  it("an empty wallet's next step is funding", () => {
    const p = onboardingProgress({ ...base, gas: "empty", trades: 0 });
    expect(p.next?.key).toBe("fund");
    expect(p.completed).toBe(1);
  });

  it("a funded wallet that has not traded is one step away", () => {
    const p = onboardingProgress({ ...base, trades: 0 });
    expect(p.next?.key).toBe("trade");
    expect(p.completed).toBe(2);
    expect(p.finished).toBe(false);
  });

  it("an UNREAD balance is pending, and pending is not done", () => {
    // The card must never claim a wallet is funded because the read failed, nor
    // demand a deposit because it is slow.
    const p = onboardingProgress({ ...base, gas: "unknown" });
    expect(p.steps.find((s) => s.key === "fund")?.state).toBe("pending");
    expect(p.completed).toBe(2);
    expect(p.finished).toBe(false);
  });

  it("pending never becomes the next step — there is nothing to act on", () => {
    const p = onboardingProgress({ ...base, gas: "unknown", trades: 0 });
    expect(p.next?.key).toBe("trade");
  });

  it("holds the card back until every source has answered", () => {
    // Otherwise it appears, renumbers itself and vanishes as reads land.
    expect(onboardingProgress({ ...base, gas: "unknown" }).ready).toBe(false);
    expect(onboardingProgress({ ...base, trades: undefined }).ready).toBe(false);
    expect(onboardingProgress(base).ready).toBe(true);
  });

  it("renders nothing at all with no wallet — the connect gate owns that", () => {
    const p = onboardingProgress({ connected: false, gas: "unknown", trades: undefined });
    expect(p.ready).toBe(false);
  });

  it("finished requires every step DONE, not merely 'not todo'", () => {
    // A wallet whose trade count never loads must not be treated as finished and
    // have the card silently removed.
    const p = onboardingProgress({ ...base, trades: undefined });
    expect(p.finished).toBe(false);
  });
});

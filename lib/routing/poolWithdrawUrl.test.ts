import { describe, expect, it } from "vitest";
import { buildPageUrl } from "./chainParams";

/**
 * The portfolio is where an LP reads their positions, and for a while it was a
 * dead end: its only action routed to `/pool/deposit`, so the tab showing what
 * you hold could add to a position and never close one. The withdraw dialog
 * existed the whole time, on a card at `/pool`, reachable only by knowing it
 * was there.
 */
describe("buildPageUrl pool verbs", () => {
  it("deep-links the withdraw dialog to a specific pair", () => {
    const url = buildPageUrl("pool", {
      slug: "arc-testnet",
      withdraw: true,
      base: "ITRA",
      quote: "USDC",
    });
    expect(url.startsWith("/pool?")).toBe(true);
    const q = new URLSearchParams(url.split("?")[1]);
    expect(q.get("withdraw")).toBe("1");
    expect(q.get("base")).toBe("ITRA");
    expect(q.get("quote")).toBe("USDC");
  });

  /* Opposite verbs, opposite routes — one must never resolve to the other. */
  it("keeps adding funds on the deposit route", () => {
    const url = buildPageUrl("pool", {
      slug: "arc-testnet",
      deposit: true,
      base: "ITRA",
      quote: "USDC",
    });
    expect(url.startsWith("/pool/deposit?")).toBe(true);
    expect(url).not.toContain("withdraw");
  });

  it("leaves the plain overview alone", () => {
    const url = buildPageUrl("pool", { slug: "arc-testnet" });
    expect(url).toBe("/pool?chain=arc-testnet");
  });
});

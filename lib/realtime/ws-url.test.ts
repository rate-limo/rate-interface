import { describe, it, expect, beforeEach } from "vitest";
import { getWsUrl, getApiUrl, getFuturesWsUrl } from "./ws-url";
import { PonderWssLinks } from "@/consts";

describe("realtime URL resolution", () => {
  beforeEach(() => { delete process.env.NEXT_PUBLIC_WS_URL; delete process.env.NEXT_PUBLIC_API_URL; });

  it("resolves the per-network host, not a global override, for a mapped network", () => {
    process.env.NEXT_PUBLIC_WS_URL = "wss://override.example";
    // The per-network map wins for a recognized network, so a stray env var on a
    // multi-chain deploy cannot point every chain at one gateway.
    expect(getWsUrl("RISE Testnet")).toBe(PonderWssLinks["RISE Testnet"]);
  });

  it("honors the override only as a dev escape hatch for an UNMAPPED network", () => {
    process.env.NEXT_PUBLIC_WS_URL = "wss://dev.local";
    expect(getWsUrl("Unmapped Devnet")).toBe("wss://dev.local");
    // Somnia is unmapped BY DESIGN — a registered chain with no gateway. It must take
    // the escape-hatch path, not resolve to a host. (This used Monad until Monad was
    // redeployed and mapped on 2026-10-02.)
    expect(getWsUrl("Somnia Testnet")).toBe("wss://dev.local");
  });

  it("returns empty for futures, which is deployed nowhere and mapped nowhere", () => {
    // PonderFuturesWssLinks is deliberately empty; with no NEXT_PUBLIC_FUTURES_WS_URL
    // set, every network falls through to "" rather than a placeholder host.
    expect(getFuturesWsUrl("RISE Testnet")).toBe("");
    expect(getFuturesWsUrl("Monad Testnet")).toBe("");
  });
});

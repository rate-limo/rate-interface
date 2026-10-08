import { describe, expect, it, vi } from "vitest";
import { normalizeOrigin } from "./origins";

/**
 * `normalizeOrigin` is what both origin checks compare against, so it has to
 * produce exactly the string the browser puts in `event.origin` — or every
 * message is dropped and the wallet reads as "did not answer".
 */
describe("normalizeOrigin", () => {
  it("returns the fallback for nothing", () => {
    expect(normalizeOrigin(undefined, "https://app.test")).toBe("https://app.test");
    expect(normalizeOrigin("", "https://app.test")).toBe("https://app.test");
    expect(normalizeOrigin("   ", "https://app.test")).toBe("https://app.test");
  });

  it("strips a path and a trailing slash", () => {
    expect(normalizeOrigin("https://wallet.iter.cx/", "x")).toBe("https://wallet.iter.cx");
    expect(normalizeOrigin("https://wallet.iter.cx/wallet-frame", "x")).toBe("https://wallet.iter.cx");
  });

  it("drops a default port and keeps a real one", () => {
    expect(normalizeOrigin("https://wallet.iter.cx:443", "x")).toBe("https://wallet.iter.cx");
    expect(normalizeOrigin("https://dev.iter.cx:3101", "x")).toBe("https://dev.iter.cx:3101");
  });

  it("lower-cases the host", () => {
    expect(normalizeOrigin("https://Wallet.Iter.CX", "x")).toBe("https://wallet.iter.cx");
  });

  it("falls back on garbage rather than comparing against it", () => {
    expect(normalizeOrigin("wallet.iter.cx", "https://app.test")).toBe("https://app.test");
    expect(normalizeOrigin("not a url", "https://app.test")).toBe("https://app.test");
  });
});

describe("appOrigins", () => {
  it("parses a comma-separated list, normalises each entry, and drops garbage", async () => {
    vi.stubEnv("NEXT_PUBLIC_WALLET_APP_ORIGIN", " https://www.iter.cx/, https://iter.cx , not-an-origin ,https://www.iter.cx");
    const { appOrigins, isAllowedAppOrigin, appOrigin } = await import("./origins");
    expect(appOrigins()).toEqual(["https://www.iter.cx", "https://iter.cx"]);
    expect(isAllowedAppOrigin("https://iter.cx")).toBe(true);
    expect(isAllowedAppOrigin("https://evil.example")).toBe(false);
    expect(appOrigin()).toBe("https://www.iter.cx");
    vi.unstubAllEnvs();
  });
});
